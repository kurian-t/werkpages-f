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

    // Nothing pending — just go home
    navigate("/", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting…</p>
    </div>
  );
}
