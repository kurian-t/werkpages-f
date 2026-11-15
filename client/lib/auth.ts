import API_BASE from "@/lib/api";
// Auth0 config is baked in at build time by Vite. Values are trimmed because a secret stored with
// a trailing newline silently corrupts the /authorize URL that every social login is built from.
export const AUTH0_DOMAIN = ((import.meta.env.VITE_AUTH0_DOMAIN as string) ?? "").trim();
export const AUTH0_CLIENT_ID = ((import.meta.env.VITE_AUTH0_CLIENT_ID as string) ?? "").trim();
// Sent as the `audience` param on /authorize. Auth0 only issues a JWT access token when the
// authorization request names an API; without it the access token comes back opaque and the
// backend's audience check rejects every social login.
export const AUTH0_AUDIENCE = ((import.meta.env.VITE_AUTH0_AUDIENCE as string) ?? "").trim();

export type SocialConnection = "google-oauth2" | "facebook" | "windowslive";

/** True when this build can actually run a social login. Used to avoid rendering dead buttons. */
export const isSocialLoginConfigured = () =>
  !!AUTH0_DOMAIN && !!AUTH0_CLIENT_ID && !!AUTH0_AUDIENCE;

export function startSocialLogin(connection: SocialConnection, returnTo?: string) {
  /*
    THE BROWSER NO LONGER BUILDS THE AUTHORIZE URL.

    It used to mint `state` into sessionStorage and assemble /authorize itself, which meant the
    two values that are supposed to bind a login to this browser were held by the browser - and
    an attacker owns their own browser. The server mints both now, keeps the PKCE verifier where
    no script can reach it, and redirects.

    Three things follow:

      1. VITE_AUTH0_DOMAIN, _CLIENT_ID and _AUDIENCE are no longer used by this path, so the
         trailing-newline bug that silently corrupted the authorize URL is now impossible: the
         browser does not construct that URL at all.
      2. The oauth_return_to sessionStorage slot is gone. returnTo rides on the server-side
         transaction, so private browsing no longer loses it.
      3. There is nothing left here to get wrong, which is the point.
  */
  const params = new URLSearchParams({ connection });
  const target = returnTo ?? (window.location.pathname + window.location.search);
  if (target) params.set("returnTo", target);
  window.location.href = `${API_BASE}/api/auth/start?${params}`;
}

/**
 * Email and password, through the SAME authorization-code flow as the social buttons.
 *
 * The application used to post the password to its own backend, which exchanged it with Auth0
 * using `grant_type=password`. RFC 9700 section 2.4 says that grant must not be used: it puts the
 * password through our hands, and it cannot carry PKCE because there is no redirect to bind.
 *
 * This sends the person to Auth0's own login page instead. We never see the password, and every
 * protection built for the social flow - the browser-bound transaction, PKCE S256, enforced state,
 * ID token validation - covers email sign-in too, without a line of it being written twice.
 */
export function startPasswordLogin(returnTo?: string, emailHint?: string) {
  const params = new URLSearchParams({ connection: "Username-Password-Authentication" });
  // Only ever an address the person typed about themselves. NEVER the result of resolving a
  // username, which would be an enumeration oracle; see startUsernameRecovery.
  if (emailHint && emailHint.includes("@")) params.set("login_hint", emailHint);
  const target = returnTo ?? (window.location.pathname + window.location.search);
  if (target) params.set("returnTo", target);
  window.location.href = `${API_BASE}/api/auth/start?${params}`;
}

/**
 * Registration, through the same flow, on Auth0's own sign-up panel.
 *
 * `screen_hint=signup` is what opens that panel. Without it somebody who pressed "Create an
 * account" lands on the sign-in panel and has to find the registration link themselves, which is
 * exactly the drop-off this flow exists to remove.
 *
 * The hint is allowlisted server-side to this one value: it ends up in the authorize URL the
 * browser is redirected to, and a passthrough there would let a caller change the semantics of
 * the authorization request.
 */
export function startRegistration(returnTo?: string, emailHint?: string) {
  const params = new URLSearchParams({
    connection: "Username-Password-Authentication",
    screen_hint: "signup",
  });
  if (emailHint && emailHint.includes("@")) params.set("login_hint", emailHint);
  const target = returnTo ?? (window.location.pathname + window.location.search);
  if (target) params.set("returnTo", target);
  window.location.href = `${API_BASE}/api/auth/start?${params}`;
}

/**
 * Whether what somebody typed is an email address rather than a username.
 *
 * Deliberately crude, and deliberately generous towards "this is an email". The only decision it
 * drives is whether to send somebody to Universal Login or to start account recovery, and sending
 * an email address down the recovery path would be the worse mistake: they would get a message
 * about an account that does not exist under that username and no way to sign in.
 *
 * Usernames in this product cannot contain `@`, so the presence of one is sufficient.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}

/**
 * Starts account recovery for a username.
 *
 * ALWAYS resolves, and resolves to nothing. The endpoint answers 202 with the same body whether or
 * not an account matched, and it is important that this function cannot report otherwise: a caller
 * able to distinguish the two cases would be an account enumeration oracle in the browser, which
 * is the whole thing the server-side design avoids. Even a network failure resolves, because a
 * caller that could tell "no such account" from "request failed" is halfway back to an oracle.
 */
export async function startUsernameRecovery(username: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username }),
    });
  } catch {
    // Intentionally swallowed. See above.
  }
}
