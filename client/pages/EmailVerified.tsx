import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Landing page for Auth0 email verification redirects.
 * Auth0 is configured to redirect here after a user clicks the verification link.
 * We read localStorage to find where the user was trying to submit, then send
 * them back there with ?verified=true so the form can auto-open the sign-in modal.
 */
export default function EmailVerified() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check for a pending review draft first (has a manager-specific returnTo)
    try {
      const reviewRaw = localStorage.getItem("rmm_pending_review");
      if (reviewRaw) {
        const data = JSON.parse(reviewRaw);
        if (data.returnTo) {
          navigate(`${data.returnTo}?verified=true`, { replace: true });
          return;
        }
      }
    } catch {}

    // Fall back to a pending manager submission
    try {
      const managerRaw = localStorage.getItem("rmm_pending_manager");
      if (managerRaw) {
        const data = JSON.parse(managerRaw);
        if (data.returnTo) {
          navigate(`${data.returnTo}?verified=true`, { replace: true });
          return;
        }
      }
    } catch {}

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
