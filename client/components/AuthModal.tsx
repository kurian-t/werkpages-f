import API_BASE from "@/lib/api";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, X } from "lucide-react";
import axios from "axios";
import type { User } from "@/contexts/AuthContext";

interface Props {
  onAuthenticated: (user: User) => void;
  onClose: () => void;
}

export function AuthModal({ onAuthenticated, onClose }: Props) {
  const { setUser } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isUnverified, setIsUnverified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsUnverified(false);
    setIsLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE}/api/auth/signin`,
        { identifier, password },
        { headers: { "Content-Type": "application/json", accept: "application/json" } }
      );
      const { user } = response.data;
      setUser(user);
      localStorage.setItem("authUser", JSON.stringify(user));
      onAuthenticated(user);
    } catch (err: any) {
      if (err.response?.status === 403 && err.response.data?.error === "email_not_verified") {
        setIsUnverified(true);
        setError("Please verify your email before signing in. Check your inbox.");
      } else if (err.response) {
        setError("Invalid credentials. Please try again.");
      } else {
        setError("Unable to connect. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-foreground">Sign in to submit</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Your review is ready. Just sign in to post it.
        </p>

        {error && (
          <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 ${
            isUnverified ? "border-yellow-500/50 bg-yellow-500/10" : "border-red-500/50 bg-red-500/10"
          }`}>
            <AlertCircle size={16} className={`flex-shrink-0 mt-0.5 ${isUnverified ? "text-yellow-600" : "text-red-500"}`} />
            <p className={`text-sm ${isUnverified ? "text-yellow-700" : "text-red-700"}`}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-3">
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email or username"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            required
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            required
          />
          <button
            type="submit"
            disabled={isLoading || !identifier || !password}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in…" : "Sign In & Submit"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
