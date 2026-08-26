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
  // A build missing the Auth0 config must not navigate to "https://undefined/authorize" — that
  // dead-ends the user on an error page with no way back.
  if (!isSocialLoginConfigured()) {
    console.error(
      "[auth] Social login is unavailable: VITE_AUTH0_DOMAIN / VITE_AUTH0_CLIENT_ID / VITE_AUTH0_AUDIENCE are missing from this build."
    );
    return;
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem(
    "oauth_return_to",
    returnTo ?? (window.location.pathname + window.location.search)
  );
  const params = new URLSearchParams({
    response_type: "code",
    client_id: AUTH0_CLIENT_ID,
    audience: AUTH0_AUDIENCE,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: "openid profile email",
    connection,
    state,
    prompt: "select_account",
  });
  window.location.href = `https://${AUTH0_DOMAIN}/authorize?${params}`;
}
