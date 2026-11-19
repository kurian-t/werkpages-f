#!/usr/bin/env bash
#
# EVERY WAY IN, CHECKED AGAINST THE RUNNING STACK, BEFORE YOU PUSH.
#
# WHY THIS EXISTS
#
# A dead backend produced 4,640 passing Playwright specs and a sign-in page where
# every button returned HTTP 500. Not one test noticed, because the suite mocks
# `/api/auth/me` and never asks the real question: does pressing "Continue with
# Google" actually reach Auth0?
#
# It cannot be a Playwright spec in the normal suite. Those run against a
# prebuilt bundle with the API mocked, which is right for testing screens and
# useless for testing a redirect chain. A spec that needed a live backend would
# fail in CI for environmental reasons and get skipped or deleted within a month.
#
# So it is a script you run deliberately, locally, against servers that are up.
#
# WHAT IT CAN AND CANNOT PROVE
#
# It proves the hop this product owns: the browser hits `/api/auth/start`, the
# backend answers 302, and the Location carries the right tenant, the right
# client, the right audience and a callback URL that matches where you are. That
# is the hop that broke today, and the hop that broke in RateMyManagers when it
# was sending WerkPages' client id.
#
# It cannot prove Auth0 will accept the request, because completing the flow
# needs a real Google password. What it does prove is that a failure from here on
# is Auth0's configuration rather than ours, which is exactly the distinction
# that wasted hours before.
#
# USAGE
#
#   tools/preflight/check-signin.sh                 # defaults below
#   FRONTEND=8080 EXPECT_AUDIENCE=api.ratemymanager.com tools/preflight/check-signin.sh
#
# Exits 0 when every path is sound, 1 otherwise, and says which one failed.

set -uo pipefail

FRONTEND="${FRONTEND:-8081}"
# The audience identifies the product, and is the single most useful assertion
# here: RateMyManagers once sent api.werkpages.com, so Auth0 validated the
# request against the wrong application and refused a callback URL that was
# correctly configured on the right one.
EXPECT_AUDIENCE="${EXPECT_AUDIENCE:-api.werkpages.com}"
ORIGIN="http://localhost:${FRONTEND}"

pass=0
fail=0

ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; printf '        %s\n' "$2"; fail=$((fail+1)); }
note() { printf '        %s\n' "$1"; }

echo "Sign-in preflight against ${ORIGIN}"
echo

# ── 0. is anything actually serving? ────────────────────────────────────────
#
# Checked first and separately, because every other failure below is a
# consequence of this one and reporting ten failures for one cause is noise.
front=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${ORIGIN}/" || echo 000)
if [ "$front" = "200" ]; then
  ok "frontend is serving on :${FRONTEND}"
else
  bad "frontend on :${FRONTEND}" "got HTTP ${front}; start it with: npx vite --port ${FRONTEND} --strictPort"
  echo; echo "Nothing else can be checked. Stopping."; exit 1
fi

# ── 1. every path out of the sign-in page ───────────────────────────────────
#
# The three social connections plus the two password paths. All five go through
# the same endpoint, and all five are listed so that adding a provider to the UI
# without adding it here is visible as an omission rather than silent.
check_start() {
  # label, the query to send, the connection that must survive, and any extra
  # parameters that must reach Auth0 (space separated, each as name=value).
  local label="$1" query="$2" expect_connection="$3" expect_extra="${4:-}"
  local hdrs status loc

  hdrs=$(curl -s -o /dev/null -D - --max-time 10 "${ORIGIN}/api/auth/start?${query}" 2>/dev/null)
  status=$(printf '%s' "$hdrs" | awk 'NR==1{print $2}')
  loc=$(printf '%s' "$hdrs" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')

  if [ "$status" != "302" ]; then
    if [ "$status" = "500" ]; then
      bad "$label" "HTTP 500 - this is the Vite proxy failing, not Auth0. The backend is not answering."
    elif [ "$status" = "401" ]; then
      bad "$label" "HTTP 401 - the endpoint is requiring a token it should not. Check 'security: []' in openapi.yaml."
    elif [ "$status" = "404" ] || [ "$status" = "501" ]; then
      bad "$label" "HTTP ${status} - the operation is not wired. Check addHandlerByOperationId for socialAuthStart."
    else
      bad "$label" "expected a 302 to Auth0, got HTTP ${status:-none}"
    fi
    return
  fi

  # The tenant. A redirect to anywhere else means the backend built the URL from
  # configuration nobody expected.
  case "$loc" in
    https://*.auth0.com/authorize\?*) : ;;
    *) bad "$label" "redirected somewhere that is not an Auth0 /authorize URL: ${loc:0:80}"; return ;;
  esac

  # The audience says which PRODUCT's API this request is for, and getting it
  # wrong is the failure that looks like an Auth0 misconfiguration for hours.
  if ! printf '%s' "$loc" | grep -q "audience=https%3A%2F%2F${EXPECT_AUDIENCE//./\\.}%2F"; then
    local got
    got=$(printf '%s' "$loc" | grep -oE 'audience=[^&]*' | head -1)
    bad "$label" "wrong audience: expected ${EXPECT_AUDIENCE}, saw ${got:-none}. The backend is using another product's Auth0 application."
    return
  fi

  # A client id must be present. Its VALUE is not printed: it is not secret, but
  # there is no reason for a terminal to echo credentials-shaped strings.
  if ! printf '%s' "$loc" | grep -qE 'client_id=[A-Za-z0-9_-]{10,}'; then
    bad "$label" "no usable client_id in the authorize URL"
    return
  fi

  # The callback has to come back to where the browser actually is, or Auth0
  # refuses it however well configured the application is.
  if ! printf '%s' "$loc" | grep -qF "redirect_uri=http%3A%2F%2Flocalhost%3A${FRONTEND}%2Fauth%2Fcallback"; then
    local got
    got=$(printf '%s' "$loc" | grep -oE 'redirect_uri=[^&]*' | head -1)
    bad "$label" "callback does not match this origin: ${got:-none}"
    return
  fi

  # PKCE, because the password path deliberately uses the authorization-code
  # flow rather than putting a password through our hands (RFC 9700 2.4).
  if ! printf '%s' "$loc" | grep -q 'code_challenge='; then
    bad "$label" "no PKCE challenge - the flow is not the authorization-code flow it should be"
    return
  fi

  if [ -n "$expect_connection" ]; then
    if ! printf '%s' "$loc" | grep -qF "connection=${expect_connection}"; then
      bad "$label" "connection did not survive: expected ${expect_connection}"
      return
    fi
  fi

  # Anything else the backend has to forward. screen_hint is allowlisted to
  # 'signup' server side, so losing it would silently turn "Create an account"
  # into an ordinary sign-in page and nothing would say so.
  local want
  for want in $expect_extra; do
    if ! printf '%s' "$loc" | grep -qF "$want"; then
      bad "$label" "the backend did not forward ${want}"
      return
    fi
  done

  ok "$label"
}

echo "Every way in:"
check_start "Continue with Google"    "connection=google-oauth2&returnTo=%2Fsearch"                              "google-oauth2"
check_start "Continue with Microsoft" "connection=windowslive&returnTo=%2Fsearch"                                 "windowslive"
check_start "Continue with Facebook"  "connection=facebook&returnTo=%2Fsearch"                                    "facebook"
check_start "Email and password"      "connection=Username-Password-Authentication&returnTo=%2Fsearch"            "Username-Password-Authentication"
check_start "Create an account"       "connection=Username-Password-Authentication&screen_hint=signup&returnTo=%2F" "Username-Password-Authentication" "screen_hint=signup"

# ── 2. the return trip ──────────────────────────────────────────────────────
#
# Auth0 sends the browser to /auth/callback. If that route does not serve, every
# sign-in completes at Auth0 and then dies on the doorstep.
echo
echo "The return trip:"
cb=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${ORIGIN}/auth/callback" || echo 000)
if [ "$cb" = "200" ]; then ok "/auth/callback is served by the client"
else bad "/auth/callback" "got HTTP ${cb}; the browser would land on nothing after authenticating"; fi

# The backend half of the round trip. 401 is the CORRECT answer with no session:
# it proves the endpoint is wired and answering, which is all this can check.
me=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${ORIGIN}/api/auth/me" || echo 000)
case "$me" in
  200|401) ok "/api/auth/me answers (HTTP ${me}; 401 is correct with no session)" ;;
  500)     bad "/api/auth/me" "HTTP 500 - the backend is not answering through the proxy" ;;
  *)       bad "/api/auth/me" "unexpected HTTP ${me}" ;;
esac

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s\033[0m\n' "All ${pass} checks passed. Every sign-in path reaches Auth0 correctly."
  note "This does not prove Auth0 will accept the request - that needs a real password."
  note "It does prove a failure from here on is Auth0 configuration, not ours."
  exit 0
fi
printf '\033[31m%s\033[0m\n' "${fail} of $((pass+fail)) checks failed. Do not push until these pass."
exit 1
