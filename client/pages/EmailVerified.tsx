import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MANAGER_DRAFT_KEY, REVIEW_DRAFT_KEY, peekAnyScopeDraft } from "@/lib/draftScope";

/**
 * Landing page for Auth0 email verification redirects.
 * Auth0 is configured to redirect here after a user clicks the verification link.
 * We read localStorage to find where the user was trying to submit, then send
 * them back there with ?verified=true so the form can auto-open the sign-in modal.
 */
export default function EmailVerified() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    /*
      Looked for in the account's scope and then the anonymous one, because drafts are keyed per
      account now and somebody following a verification link may be signed in or not.

      Only `returnTo` is read. Whether the ANSWERS may be applied is the form's decision, and it
      turns on something this page cannot establish.
    */
    // A pending review first: it has a manager-specific returnTo.
    const review = peekAnyScopeDraft<any>(REVIEW_DRAFT_KEY, user?.id);
    if (review?.payload?.returnTo) {
      navigate(`${review.payload.returnTo}?verified=true`, { replace: true });
      return;
    }

    // Fall back to a pending manager submission.
    const manager = peekAnyScopeDraft<any>(MANAGER_DRAFT_KEY, user?.id);
    if (manager?.payload?.returnTo) {
      navigate(`${manager.payload.returnTo}?verified=true`, { replace: true });
      return;
    }

    /*
      Nothing pending: go to sign-in and SAY the verification worked.

      This used to navigate("/"), which dropped the person on the homepage with no acknowledgement
      at all. From their side: they clicked a link in an email and arrived at an ordinary home page,
      with nothing confirming their address was verified and no hint that signing in was the next
      step. Reported as "I click the link to verify my account and it takes me back to
      ratemymanagers.ca ... overall it's confusing".

      The sign-in page already renders "Email verified! You can now sign in." when it is given this
      state - the message existed and nothing ever sent anybody to it.
    */
    navigate("/signin", { replace: true, state: { emailVerified: true } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting…</p>
    </div>
  );
}
