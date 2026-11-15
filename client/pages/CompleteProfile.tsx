import API_BASE from "@/lib/api";
import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Check } from "lucide-react";
import { validateUsername, generateUsername } from "@/lib/validators";
import { RotateCcw } from "lucide-react";

/**
 * CHOOSING A USERNAME, FOR AN ACCOUNT THAT WAS CREATED WITHOUT ONE.
 *
 * Universal Login asks for an email and a password. It does not ask for a username, and turning on
 * Auth0's own "Requires Username" would add a second username field that nothing in this product
 * reads - so a new account arrives with a generated placeholder of the shape `user_1a2b3c4d`, and
 * this page finishes the job.
 *
 * ## Why it is interposed rather than offered later
 *
 * The username is how a contributor is identified publicly. Until one is chosen the backend
 * suppresses the placeholder and publishes a pseudonym instead, so somebody who skips this page
 * does not get a broken-looking profile - but they do get a pseudonym on work they may have wanted
 * their name on, and `reviews.author` is a snapshot rather than a join, so choosing a name later
 * does not go back and fix it.
 *
 * ## returnTo is carried through, and that is the whole point
 *
 * This step sits between the callback and wherever the person was going, which for a contributor
 * is a half-finished rating. Losing `returnTo` here would strand them on the directory with a
 * draft they have to find again, which is the drop-off the draft machinery exists to prevent.
 */
export default function CompleteProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, isAuthenticated } = useAuth();

  const returnTo: string = (location.state as any)?.returnTo || "/explore";
  const [username, setUsername] = useState("");
  /*
    Names moved here from the old signup form.

    Universal Login takes the email and the password; everything else that form asked for is asked
    for at this step instead. They are OPTIONAL, which the old form's were not: the social path
    already fills them from the identity provider, so for most people arriving here they are
    already set, and the username is the only one of the three the product actually needs.
  */
  const [firstName, setFirstName] = useState(((user as any)?.firstName as string) ?? "");
  const [lastName, setLastName]   = useState(((user as any)?.lastName as string) ?? "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Nothing to complete, or nobody to complete it for.
  if (!isAuthenticated) return <Navigate to="/signin" replace />;
  if (user && (user as any).profileComplete === true) {
    return <Navigate to={returnTo} replace />;
  }

  const validation = validateUsername(username);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validation.valid) { setError(validation.error ?? "That username cannot be used."); return; }
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/complete-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // The context carries the new name AND the completion flag, or this page would be
        // re-entered on the next navigation that checks it.
        if (user) {
          const updated = {
            ...user,
            username: data.username,
            firstName: firstName.trim() || (user as any).firstName,
            lastName: lastName.trim() || (user as any).lastName,
            profileComplete: true,
          };
          setUser(updated as any);
          localStorage.setItem("authUser", JSON.stringify(updated));
        }
        navigate(returnTo, { replace: true });
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.error === "username_taken") {
        setError("That username is already taken. Please choose another.");
      } else if (res.status === 409 && body.error === "profile_already_complete") {
        // Somebody completed it in another tab. Not an error worth showing.
        navigate(returnTo, { replace: true });
      } else if (res.status === 400) {
        setError(body.message ?? "That username cannot be used.");
      } else if (res.status === 401) {
        navigate("/signin", { replace: true, state: { returnTo } });
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("No response from the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <section className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-background p-8 shadow-lg">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-foreground">Choose a username</h1>
              <p className="mt-2 text-muted-foreground">
                This is how you'll appear on anything you post.
              </p>
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-foreground mb-2">
                    First name <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-foreground mb-2">
                    Last name <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-foreground mb-2">
                  Username
                </label>
                <div className="flex gap-2">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Pick a username"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setUsername(generateUsername())}
                    title="Suggest one"
                    className="flex-shrink-0 rounded-lg border border-border px-3 text-muted-foreground transition-all hover:bg-muted"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                {username && (
                  <p className={`mt-2 flex items-center gap-1.5 text-xs ${
                    validation.valid ? "text-green-600" : "text-muted-foreground"
                  }`}>
                    {validation.valid ? <Check size={13} /> : <AlertCircle size={13} />}
                    {validation.valid ? "Looks good" : validation.error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSaving || !validation.valid}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Continue"}
              </button>
            </form>

            {/*
              Skipping is allowed, and that is deliberate.

              Somebody who arrived here mid-contribution has a half-finished rating waiting, and
              making a display name mandatory before they can publish it would be a gate on a
              contribution - the thing section 44 of the operating rules exists to prevent. The
              backend publishes a pseudonym rather than the placeholder, so nothing broken is
              exposed either way.
            */}
            <button
              type="button"
              onClick={() => navigate(returnTo, { replace: true })}
              className="mt-4 block w-full text-center text-sm text-muted-foreground underline"
            >
              Skip for now
            </button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
