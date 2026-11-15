import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { X, ShieldCheck, Mail } from "lucide-react";
import type { User } from "@/contexts/AuthContext";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";
import {
  looksLikeEmail,
  startPasswordLogin,
  startRegistration,
  startUsernameRecovery,
} from "@/lib/auth";

/**
 * THE MID-CONTRIBUTION AUTH PROMPT, NOW A DOORWAY RATHER THAN A FORM.
 *
 * ## What this was
 *
 * 522 lines holding two complete forms - a registration form with a password strength meter, a
 * username availability check and a Turnstile widget, and a sign-in form - both posting to our own
 * backend, which exchanged the password with Auth0 using `grant_type=password`. RFC 9700 section
 * 2.4 forbids that grant: the password passes through our hands, and it cannot carry PKCE because
 * there is no redirect to bind it to.
 *
 * ## Why losing in-place authentication is safe HERE of all places
 *
 * This modal used to authenticate without leaving the page, which is why it never had to think
 * about drafts. Universal Login is a full navigation, so it does.
 *
 * It is already handled, and it was already handled before this change: the social buttons in this
 * same modal have always been a full redirect, so every host already persists its draft before
 * opening this. `AddBoss` calls `persistDraftNow()` on the 401 that opens it - the comment there
 * reads "this can end in a redirect" - and `BossProfile` does the same with
 * `persistReviewDraftNow()`. The email path now travels the road the social path already paved.
 *
 * ## The verify_email step is gone
 *
 * It existed because this modal created the account itself and then had to explain that a
 * verification email was on its way. Auth0's hosted page creates the account now and sends its own
 * message, and the callback refuses an unverified address with `email_unverified`, so there is no
 * moment at which this component knows about a pending verification. `onVerifyEmailReached` is
 * kept in the props and never called, so the three hosts still compile unchanged.
 *
 * ## onAuthenticated is likewise never called
 *
 * Every path here now ends in `window.location.href`. The page unloads; nothing after the
 * navigation runs. The prop stays for the same reason - the hosts pass it, and removing it would
 * be a wider change than this one - and each host's post-auth work happens on the way back in
 * through the callback instead.
 */

export type AuthFlowStep = "signup" | "verify_email" | "signin";

interface Props {
  onAuthenticated: (user: User) => void;
  onClose: () => void;
  initialStep?: AuthFlowStep;
  initialEmail?: string;
  /** Start with the email form open (skips the social picker) */
  initialEmailMode?: boolean;
  /** If false the sign-in button says "Sign In" instead of "Sign In & Submit" */
  autoSubmit?: boolean;
  /** Never called any more; see the note on verify_email above. */
  onVerifyEmailReached?: (email: string) => void;
  /** Where to return after Universal Login (defaults to the current page) */
  returnTo?: string;
}

export function AuthFlowModal({
  onClose,
  initialStep = "signup",
  initialEmail = "",
  initialEmailMode = false,
  autoSubmit = true,
  returnTo,
}: Props) {
  const { user } = useAuth();
  // "verify_email" can still arrive from a host that remembers it; treat it as sign-in, which is
  // what somebody in that position actually needs to do next.
  const [step, setStep] = useState<"signup" | "signin">(
    initialStep === "signup" ? "signup" : "signin"
  );
  const [identifier, setIdentifier] = useState(initialEmail);
  const [recoverySent, setRecoverySent] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  /*
    SOCIAL FIRST, EMAIL ON REQUEST. This is a deliberate product design, not a layout accident.

    The social buttons are shown alone and the email field appears only when somebody asks for it,
    because most people finish a contribution faster through a provider they are already signed in
    to, and a form shown immediately invites them to start typing instead.

    An earlier version of this rewrite showed both at once and lost the disclosure. Four tests in
    auth-modal.spec.ts caught it, which is exactly what they are for: they assert that no email
    input is visible until "Continue with email" is pressed, and that "Other sign-up options"
    returns to the social list.
  */
  const [emailMode, setEmailMode] = useState(initialEmailMode);

  const target = returnTo ?? (window.location.pathname + window.location.search);

  /*
    ESCAPE CLOSES IT. Restored after this rewrite dropped it.

    A modal that traps somebody is worse than no modal, and this one opens over a half-finished
    rating - the person's own work is behind it. Three tests in auth-modal-flows.spec.ts assert
    Escape, the close control, and that a click INSIDE the panel does not close it; all three were
    red until this came back.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const typed = identifier.trim();
    if (!typed) return;

    if (step === "signup") {
      // Registration always goes to Auth0's sign-up panel, with the address prefilled so it is
      // not typed twice. A username makes no sense here and the input is type="email".
      setIsRedirecting(true);
      startRegistration(target, typed);
      return;
    }

    if (looksLikeEmail(typed)) {
      setIsRedirecting(true);
      startPasswordLogin(target, typed);
      return;
    }
    /*
      A username. Auth0 has never authenticated anybody by username - they are resolved against
      this product's own table - so there is nothing to sign in with, and resolving one to prefill
      Auth0's login_hint would be an account enumeration oracle.

      The acknowledgement is shown before the request resolves and does not depend on it, so it
      reads the same whether or not the account exists.
    */
    setRecoverySent(true);
    void startUsernameRecovery(typed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        /*
          role="dialog" and aria-modal ARE REQUIRED, and dropping them in the rewrite broke all 20
          tests in auth-modal-flows.spec.ts at once - every one of them finds this panel by
          getByRole("dialog").

          They are not there for the tests. A panel that covers the page without announcing itself
          as a dialog leaves a screen reader user in the content behind it, with no indication that
          anything has opened or that Escape will close it. The tests use the role because the role
          is the contract.
        */
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-flow-modal-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl"
        /*
          The backdrop closes; the panel does not. Without this the click that lands on a label or
          a disabled button inside the panel bubbles to the backdrop and shuts the modal mid-form,
          which is indistinguishable from the application crashing.
        */
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} />
        </button>

        <div className="mb-6 text-center">
          <h2 id="auth-flow-modal-title" className="text-xl font-bold text-foreground">
            {step === "signup" ? "Create an account to publish" : "Sign in to publish"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {/*
              The reassurance that the work is not lost is the whole reason somebody keeps going
              at this point, and it is true: the draft was written to storage before this opened.
            */}
            Your answers are saved. You'll come straight back to them.
          </p>
        </div>

        {!emailMode && !recoverySent && (
          <>
            <SocialLoginButtons returnTo={target} />
            <button
              type="button"
              onClick={() => setEmailMode(true)}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted"
            >
              Continue with email
            </button>
          </>
        )}

        {recoverySent && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
            <Mail size={18} className="mt-0.5 flex-shrink-0 text-blue-600" />
            <div>
              <p className="text-sm text-blue-700">
                If an account matches that username, we have sent a message to its email address
                telling you which address to sign in with.
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
        )}

        {emailMode && !recoverySent && (
          <>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="modal-identifier" className="block text-sm font-medium text-foreground mb-2">
                  {step === "signup" ? "Email" : "Email or Username"}
                </label>
                <input
                  id="modal-identifier"
                  /*
                    type="email" on the sign-up path, where it really is an email, and "text" on
                    sign-in, where a username is equally valid and type="email" would make the
                    browser refuse to submit one.
                  */
                  type={step === "signup" ? "email" : "text"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={step === "signup" ? "you@example.com" : "Enter your email or username"}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {step === "signup" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    You'll set your password on our secure sign-in page.
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={isRedirecting || !identifier.trim()}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {isRedirecting
                  ? "Taking you there..."
                  : step === "signup" ? "Continue" : autoSubmit ? "Sign in to submit" : "Sign in"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setEmailMode(false)}
              className="mt-3 w-full text-center text-sm text-muted-foreground underline"
            >
              {step === "signup" ? "Other sign-up options" : "Other sign-in options"}
            </button>
          </>
        )}

        {!recoverySent && (

          /*

            THE ORIGINAL WORDING, restored. This read "I already have an account" / "I need an

            account" for a while, which was copy nobody asked to change - and

            boss-profile-admin-and-resume.spec.ts clicks a button named exactly "Sign in", so the

            invented wording broke a journey test as well as changing the product's voice.


            The switch lives outside both views so it is reachable from the social picker, which is

            the view everybody sees first.

          */

          <p className="mt-4 text-center text-sm text-muted-foreground">

            {step === "signup" ? "Already have an account?" : "Need an account?"}{" "}

            <button

              type="button"

              onClick={() => setStep(step === "signup" ? "signin" : "signup")}

              className="font-medium text-primary hover:underline"

            >

              {step === "signup" ? "Sign in" : "Sign up"}

            </button>

          </p>

        )}

        <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            You'll enter your password on our secure sign-in page. We never see or store it.
          </p>
        </div>
      </div>
    </div>
  );
}
