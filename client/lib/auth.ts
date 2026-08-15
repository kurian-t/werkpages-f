export const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN as string;
export const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID as string;

export type SocialConnection = "google-oauth2" | "facebook" | "windowslive";

export function startSocialLogin(connection: SocialConnection, returnTo?: string) {
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem(
    "oauth_return_to",
    returnTo ?? (window.location.pathname + window.location.search)
  );
  const params = new URLSearchParams({
    response_type: "code",
    client_id: AUTH0_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: "openid profile email",
    connection,
    state,
    prompt: "select_account",
  });
  window.location.href = `https://${AUTH0_DOMAIN}/authorize?${params}`;
}
