import { useState } from "react";
import { useLocation, Link, Navigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Mail, CheckCircle } from "lucide-react";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";
import {
  looksLikeEmail,
  startPasswordLogin,
  startRegistration,
  startUsernameRecovery,
} from "@/lib/auth";

/*
  SIGN-IN NO LONGER TAKES A PASSWORD.

  This page used to collect an email and a password and POST them to /api/auth/signin, which
  exchanged them with Auth0 using grant_type=password. RFC 9700 section 2.4 says that grant must
  not be used: the password passes through our hands, and it cannot carry PKCE because there is no
  redirect to bind it to. The whole page is now a doorway to Universal Login.

  What somebody types decides which doorway:

    an EMAIL    -> Universal Login, where Auth0 asks for the password. We never see it.
    a USERNAME  -> account recovery, because Auth0 has never authenticated anybody by username.

  The second branch deserves care. Usernames are resolved against this product's own table, never
  Auth0's, so there is nothing to sign in with. The tempting fix - look the username up and prefill
  Auth0's login_hint with the email - is an account enumeration oracle: anybody could type
  usernames and read private addresses off the hosted page. Instead a message goes to the
  account's OWN inbox and the person at the keyboard is told nothing. See startUsernameRecovery.
*/
export default function SignIn() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  // Social login failures redirect here with the reason in navigation state - Auth0's
  // error_description, or "this email already has a password account". Seeding the banner with
  // it means the redirect explains itself instead of looking like an unexplained page refresh.
  const [error, setError] = useState<string>(
    ((location.state as any)?.socialError as string) ?? ""
  );
  const [isUnverified, setIsUnverified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const emailVerified = (location.state as any)?.emailVerified === true;
  /*
    returnTo ARRIVES TWO WAYS, and only one of them was being read.

    Router state is how a component hands it over, and that worked. A query string is how a plain
    navigation or a typed link hands it over, and that was dropped on the floor: the workplace
    rating form sends `/signin?returnTo=/companies/<slug>/rate` when somebody presses submit
    without an account, so the destination it carefully chose was discarded here and the person
    came back to the directory with a finished rating stranded in a draft. Same symptom as the
    manager form's, different mechanism, which is why fixing that one did not fix this one.

    Site-relative only. This value ends up in a redirect and, through startPasswordLogin, in the
    returnTo the server stores on the login transaction, so an absolute URL here would be an
    open-redirect handed straight to the thing that validates it. `//evil.test` is rejected along
    with `https://evil.test`: a protocol-relative URL starts with a slash and is NOT site-relative.
  */
  const queryReturnTo = searchParams.get("returnTo");
  const returnTo: string =
    (location.state as any)?.returnTo ||
    (queryReturnTo && queryReturnTo.startsWith("/") && !queryReturnTo.startsWith("//")
      ? queryReturnTo
      : null) ||
    "/explore";

  if (isAuthenticated) {
    return <Navigate to={returnTo === "/" ? "/explore" : returnTo} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsUnverified(false);
    const typed = identifier.trim();
    if (!typed) return;

    if (looksLikeEmail(typed)) {
      // Universal Login takes it from here. No state to clear and no result to handle: this
      // navigates away from the page.
      setIsLoading(true);
      startPasswordLogin(returnTo);
      return;
    }

    /*
      A username. The acknowledgement is shown BEFORE the request resolves and does not depend on
      it, which is what keeps the browser from becoming the oracle the server refuses to be: the
      same words appear whether or not that username exists, and appear at the same moment.
    */
    setRecoverySent(true);
    void startUsernameRecovery(typed);
  };

  return (
    <Layout>
      <section className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-background p-8 shadow-lg">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
              <p className="mt-2 text-muted-foreground">
                Sign in to your Werkpages account
              </p>
            </div>

            {emailVerified && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-green-500/50 bg-green-500/10 p-4">
                <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700">Email verified! You can now sign in.</p>
              </div>
            )}

            {error && (
              <div className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${
                isUnverified
                  ? "border-yellow-500/50 bg-yellow-500/10"
                  : "border-red-500/50 bg-red-500/10"
              }`}>
                {isUnverified ? (
                  <Mail size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm ${isUnverified ? "text-yellow-700" : "text-red-700"}`}>
                    {error}
                  </p>
                  {isUnverified && (
                    <p className="text-xs text-yellow-600 mt-1">
                      Didn't receive the email? Check your spam folder.
                    </p>
                  )}
                </div>
              </div>
            )}

            <SocialLoginButtons returnTo={returnTo} />

            {recoverySent ? (
              /*
                Deliberately NOT "we have emailed you". That would be a claim this page cannot
                make: it does not know whether an account matched, and saying so for a username
                nobody holds would be false. The wording has to be true in both cases, because
                it is the same wording in both cases.
              */
              <div className="flex items-start gap-3 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
                <Mail size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-700">
                    If an account matches that username, we have sent a message to its email
                    address telling you which address to sign in with.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setRecoverySent(false); setIdentifier(""); }}
                    className="mt-2 text-xs font-medium text-blue-700 underline"
                  >
                    Try a different email or username
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="identifier" className="block text-sm font-medium text-foreground mb-2">
                    Email or Username
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your email or username"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    required
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Enter your email to continue. If you only remember your username, we will
                    email you which address your account uses.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !identifier.trim()}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Redirecting..." : "Continue"}
                </button>
              </form>
            )}

            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-sm text-muted-foreground">New user?</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <button
              type="button"
              onClick={() => startRegistration(returnTo)}
              className="block w-full rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-center font-medium text-primary transition-all hover:bg-primary/20"
            >
              Create an Account
            </button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
