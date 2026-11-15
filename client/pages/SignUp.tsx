import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";
import { startRegistration } from "@/lib/auth";
import { ShieldCheck } from "lucide-react";

/**
 * CREATING AN ACCOUNT, WITHOUT THIS PAGE EVER SEEING A PASSWORD.
 *
 * ## What this page used to be
 *
 * A 394-line form: first name, last name, email, username, password, confirm password, a password
 * strength meter, a username availability check and a Turnstile widget - all posted to
 * `/api/auth/signup`, which forwarded it to Auth0's `/dbconnections/signup`.
 *
 * ## Why none of that is here any more
 *
 * The password was the problem. Collecting it meant it passed through this application and then
 * through our own backend, and `grant_type=password` - which the matching sign-in path used - is
 * forbidden by RFC 9700 section 2.4. Auth0's own hosted page collects it instead, so there is no
 * password in this codebase to leak, log, or mishandle.
 *
 * ## Where the rest of the form went
 *
 * Nowhere: it moved. Auth0 takes the email and the password; the first name, last name and
 * username are asked for immediately afterwards by `/complete-profile`, which the callback
 * interposes before sending anybody onward. The same questions, in two steps instead of one, and
 * the account exists by the time the second is asked - so abandoning it loses a display name
 * rather than the whole registration.
 *
 * ## Turnstile is gone, deliberately
 *
 * It protected a form that no longer exists. The account is now created on Auth0's page, which has
 * its own bot and brute-force protection, and a CAPTCHA in front of a button that only performs a
 * redirect protects nothing.
 */
export default function SignUp() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const returnTo: string = (location.state as any)?.returnTo || "/explore";

  if (isAuthenticated) {
    return <Navigate to={returnTo === "/" ? "/explore" : returnTo} replace />;
  }

  return (
    <Layout>
      <section className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-background p-8 shadow-lg">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-foreground">Create Account</h1>
              <p className="mt-2 text-muted-foreground">
                Join Werkpages to rate and review managers
              </p>
            </div>

            <SocialLoginButtons returnTo={returnTo} />

            <button
              type="button"
              onClick={() => { setIsRedirecting(true); startRegistration(returnTo); }}
              disabled={isRedirecting}
              className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {isRedirecting ? "Taking you there..." : "Sign up with email"}
            </button>

            <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                You'll set your password on our secure sign-in page, then pick a username. We never
                see or store your password.
              </p>
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-sm text-muted-foreground">Already have an account?</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Link
              to="/signin"
              state={{ returnTo }}
              className="block w-full rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-center font-medium text-primary transition-all hover:bg-primary/20"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
