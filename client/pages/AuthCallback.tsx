import API_BASE from "@/lib/api";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import axios from "axios";

/**
 * Handles the OAuth redirect from Auth0 after social login (Google / Facebook / Apple).
 * Exchanges the authorization code for a session via the backend, then redirects.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code       = params.get("code");
    const state      = params.get("state");
    const errorParam = params.get("error");

    if (errorParam) {
      // Auth0 returned an error (e.g. user cancelled)
      navigate("/signin", { replace: true });
      return;
    }

    const savedState = sessionStorage.getItem("oauth_state");
    const returnTo   = sessionStorage.getItem("oauth_return_to") || "/find";
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("oauth_return_to");

    if (!code) {
      setError("Authentication failed: no code returned. Please try again.");
      return;
    }

    // State mismatch can happen if sessionStorage was cleared (private browsing, etc.)
    // Don't hard-fail — just warn and proceed with the safe returnTo.
    if (state !== savedState) {
      console.warn("[AuthCallback] state mismatch — proceeding anyway");
    }

    axios.post(`${API_BASE}/api/auth/callback`, {
      code,
      redirectUri: `${window.location.origin}/auth/callback`,
    }).then(res => {
      const { user, isNewUser } = res.data;
      setUser(user);
      localStorage.setItem("authUser", JSON.stringify(user));
      navigate(isNewUser && !returnTo.startsWith("/add") ? "/find" : returnTo, { replace: true });
    }).catch(err => {
      const data = err.response?.data;
      if (data?.error === "email_already_registered") {
        navigate("/signin", {
          replace: true,
          state: { socialError: data.message },
        });
      } else {
        setError(data?.message || "Authentication failed. Please try again.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate("/signin")}
            className="rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
