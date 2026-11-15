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
      // Auth0's error_description names connections, API identifiers, and grant configuration -
      // never put it in front of an end user. Dev builds log it for debugging; the log is
      // stripped from production bundles, and the user always sees the same generic message.
      if (import.meta.env.DEV) {
        const description = params.get("error_description");
        console.error(`[auth] Auth0 returned ${errorParam}: ${description ?? "no description"}`);
      }
      navigate("/signin", {
        replace: true,
        state: { socialError: "Sign-in was not completed. Please try again." },
      });
      return;
    }

    if (!code) {
      setError("Authentication failed: no code returned. Please try again.");
      return;
    }

    /*
      THE STATE IS FORWARDED, NOT COMPARED HERE.

      This used to compare `state` against a sessionStorage copy and log "state mismatch -
      proceeding anyway", because sessionStorage is empty in private browsing and hard-failing
      broke real sign-ins. The comparison was decorative either way: an attacker owns their own
      browser's storage, so a browser-held value cannot bind anything.

      The server holds the expected state, against a row only this browser's cookie can consume,
      and refuses the callback when they disagree. All this page does is carry it back.
    */
    axios.post(`${API_BASE}/api/auth/callback`, {
      code,
      state,
      redirectUri: `${window.location.origin}/auth/callback`,
    }, { withCredentials: true }).then(res => {
      const { user, returnTo } = res.data;
      setUser(user);
      localStorage.setItem("authUser", JSON.stringify(user));

      /*
        THE SERVER SAYS WHERE THEY WERE GOING, because it is the only party that still knows.

        This read `sessionStorage.getItem("oauth_return_to")`, a slot `auth.ts` stopped writing
        when the browser gave up building the authorize URL - returnTo moved onto the server-side
        login transaction at that point, precisely so private browsing could not lose it. The read
        was left behind, so it was always null, and EVERY login fell through to the default. A
        contributor who filled in a rating, was asked to sign in at submit, and came back found
        themselves on the directory with their answers stranded in a draft.

        There was a second bug stacked on the first, and it is why this is not simply a one-line
        swap. The destination used to be:

            isNewUser && !returnTo.startsWith("/add") ? "/search" : returnTo

        so a brand-new account had its destination discarded unless it happened to be the
        add-manager form. That exemption was written for the one form somebody remembered; the
        rating form is not under /add, so the very people most likely to be signing up - someone
        part-way through their first contribution - were the ones guaranteed to lose it.

        There is nothing left to special-case. `safeReturnTo` on the server already rejects
        anything that is not a site-relative path and already defaults to the directory when the
        caller named nowhere, so honouring it unconditionally gives a new account the directory in
        exactly the case the exemption was reaching for, and gives everybody else the page they
        were on.
      */
      const destination: string = typeof returnTo === "string" && returnTo.startsWith("/")
        ? returnTo
        : "/search";

      /*
        PROFILE COMPLETION IS INTERPOSED HERE, and it keys on `profileComplete`, not `isNewUser`.
      
        Universal Login never asks for a username, so an account arrives with a generated
        placeholder and the flag false. Keying on `isNewUser` would miss the case that matters
        most: somebody who skipped this step last time is not new, and still has no username.
      
        returnTo is carried through rather than consumed. For a contributor this step sits between
        the callback and a half-finished rating, and dropping it here would strand them on the
        directory with a draft they have to find again.
      */
      if (user?.profileComplete === false) {
        navigate("/complete-profile", { replace: true, state: { returnTo: destination } });
        return;
      }

      navigate(destination, { replace: true });
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
