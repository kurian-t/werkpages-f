import API_BASE from "@/lib/api";
import { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Mail, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, isAuthenticated } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Social login failures redirect here with the reason in navigation state - Auth0's
  // error_description, or "this email already has a password account". Seeding the banner with
  // it means the redirect explains itself instead of looking like an unexplained page refresh.
  const [error, setError] = useState<string>(
    ((location.state as any)?.socialError as string) ?? ""
  );
  const [isUnverified, setIsUnverified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const emailVerified = (location.state as any)?.emailVerified === true;
  const returnTo: string = (location.state as any)?.returnTo || "/explore";

  if (isAuthenticated) {
    return <Navigate to={returnTo === "/" ? "/explore" : returnTo} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsUnverified(false);
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_BASE}/api/auth/signin`,
        { identifier: username, password: password },
        { headers: { "Content-Type": "application/json", accept: "application/json" } }
      );

      const { user } = response.data;
      setUser(user);
      localStorage.setItem("authUser", JSON.stringify(user));

      toast.success("Signed in successfully!", {
        description: "Welcome back to Rate My Managers",
      });

      navigate(returnTo);
    } catch (error: any) {
      if (error.response?.status === 403 && error.response.data?.error === "email_not_verified") {
        setIsUnverified(true);
        setError("Please verify your email before signing in. Check your inbox for a verification email.");
      } else if (error.response) {
        setError("Invalid credentials. Please try again.");
      } else if (error.request) {
        setError("No response from server. Please try again later.");
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <section className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-background p-8 shadow-lg">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
              <p className="mt-2 text-muted-foreground">
                Sign in to your Rate My Managers account
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-foreground mb-2">
                  Email or Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your email or username"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !username || !password}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-sm text-muted-foreground">New user?</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Link
              to="/signup"
              className="block w-full rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-center font-medium text-primary transition-all hover:bg-primary/20"
            >
              Create an Account
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
