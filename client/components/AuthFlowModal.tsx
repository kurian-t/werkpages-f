import API_BASE from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { validateUsername, validateEmail, generateUsername } from "@/lib/validators";
import { AlertCircle, RotateCcw, Check, X, Mail, ArrowLeft } from "lucide-react";
import axios from "axios";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import type { User } from "@/contexts/AuthContext";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";

const TURNSTILE_SITE_KEY  = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

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
  /** Called when signup succeeds and we move to the verify_email step */
  onVerifyEmailReached?: (email: string) => void;
  /** Where to redirect after successful OAuth (defaults to current page) */
  returnTo?: string;
}

export function AuthFlowModal({
  onAuthenticated, onClose,
  initialStep = "signup", initialEmail = "",
  initialEmailMode = false,
  autoSubmit = true,
  onVerifyEmailReached,
  returnTo,
}: Props) {
  const { setUser } = useAuth();
  const [step, setStep] = useState<AuthFlowStep>(initialStep);

  // ── Sign-up state ────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState(initialEmail);
  const [username, setUsername] = useState(() => generateUsername());
  const [usernameError, setUsernameError] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileLoadError, setTurnstileLoadError] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [signupError, setSignupError] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(initialEmail);

  // ── Email mode (false = social-only view, true = email form) ────────────
  const [emailMode, setEmailMode] = useState(initialEmailMode);

  // ── Sign-in state ────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState(initialEmail);
  const [signinPassword, setSigninPassword] = useState("");
  const [signinError, setSigninError] = useState("");
  const [isUnverified, setIsUnverified] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // ── Username handlers ────────────────────────────────────────────────────
  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameAvailable(null);
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    if (!value) { setUsernameError(""); return; }
    const validation = validateUsername(value);
    if (!validation.valid) { setUsernameError(validation.error || ""); return; }
    setUsernameError("");
    setIsCheckingUsername(true);
    usernameDebounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/auth/check-username`, { params: { username: value.trim() } });
        setUsernameAvailable(res.data.available);
        if (!res.data.available) setUsernameError("That username is already taken. Please choose another.");
      } catch {
        setUsernameAvailable(null);
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);
  };

  // Check availability of the auto-generated username on mount
  useEffect(() => {
    handleUsernameChange(username);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateUsername = () => handleUsernameChange(generateUsername());

  const passwordRules = [
    { label: "At least 8 characters",        met: password.length >= 8 },
    { label: "At least one uppercase letter", met: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter", met: /[a-z]/.test(password) },
    { label: "At least one number",           met: /[0-9]/.test(password) },
    { label: "At least one special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordValid = passwordRules.every(r => r.met);

  const isSignupValid =
    firstName && lastName && signupEmail && username &&
    !usernameError && usernameAvailable === true && !isCheckingUsername &&
    password && confirmPassword && password === confirmPassword && passwordValid &&
    !!turnstileToken;

  // ── Sign-up submit ───────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError("");
    if (!validateEmail(signupEmail)) { setSignupError("Please enter a valid email address"); return; }
    setIsSigningUp(true);
    try {
      await axios.post(
        `${API_BASE}/api/auth/signup`,
        {
          email: signupEmail,
          username: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
          ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {}),
        },
        { headers: { "Content-Type": "application/json" } }
      );
      // Persist signup email into pending localStorage entries so sign-in can pre-fill
      for (const key of ["rmm_pending_manager", "rmm_pending_review"]) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try { localStorage.setItem(key, JSON.stringify({ ...JSON.parse(raw), signupEmail })); } catch {}
        }
      }
      setVerifiedEmail(signupEmail);
      setIdentifier(signupEmail);
      setStep("verify_email");
      onVerifyEmailReached?.(signupEmail);
    } catch (err: any) {
      if (err?.response?.data?.error === "username_taken") {
        setUsernameError("That username is already taken. Please choose another.");
      } else if (err?.response?.data?.error === "email_already_registered") {
        setSignupError("An account with this email already exists.");
        setIdentifier(signupEmail);
        setStep("signin");
        setEmailMode(true);
      } else {
        const message = err?.response?.data?.message || err?.response?.data?.error || "Failed to sign up. Please try again.";
        setSignupError(message);
        turnstileRef.current?.reset();
        setTurnstileToken("");
      }
    } finally {
      setIsSigningUp(false);
    }
  };

  // ── Sign-in submit ───────────────────────────────────────────────────────
  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninError("");
    setIsUnverified(false);
    setIsSigningIn(true);
    try {
      const response = await axios.post(
        `${API_BASE}/api/auth/signin`,
        { identifier, password: signinPassword },
        { headers: { "Content-Type": "application/json" } }
      );
      const { user } = response.data;
      setUser(user);
      localStorage.setItem("authUser", JSON.stringify(user));
      onAuthenticated(user);
    } catch (err: any) {
      if (err.response?.status === 403 && err.response.data?.error === "email_not_verified") {
        setIsUnverified(true);
        setSigninError("Please verify your email before signing in. Check your inbox.");
      } else if (err.response && typeof err.response.data === "object") {
        setSigninError("Invalid credentials. Please try again.");
      } else {
        setSigninError("Unable to connect. Please check your connection and try again.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl my-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 id="auth-modal-title" className="text-lg font-semibold text-foreground">
            {step === "signup"       ? (autoSubmit ? "Create an account to submit" : "Create an account") :
             step === "verify_email" ? "Check your email" :
                                       (autoSubmit ? "Sign in to submit" : "Sign in")}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="p-6">

          {/* ── Step: Sign Up — social picker ──────────────────────────────── */}
          {step === "signup" && !emailMode && (
            <>
              {autoSubmit && (
                <p className="text-sm text-muted-foreground mb-5">
                  Your form data is saved. Create an account to submit it.
                </p>
              )}
              <SocialLoginButtons returnTo={returnTo} divider={false} />
              <div className="relative my-4 flex items-center">
                <div className="flex-1 border-t border-border" />
                <span className="mx-3 text-xs font-medium uppercase tracking-widest text-muted-foreground whitespace-nowrap">or</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <button
                type="button"
                onClick={() => setEmailMode(true)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted/60"
              >
                Continue with email
              </button>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button onClick={() => { setStep("signin"); setEmailMode(false); }} className="font-medium text-primary hover:underline">
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* ── Step: Sign Up — email form ──────────────────────────────────── */}
          {step === "signup" && emailMode && (
            <>
              <button
                type="button"
                onClick={() => setEmailMode(false)}
                className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Other sign-up options
              </button>

              {signupError && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{signupError}</p>
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">First Name</label>
                    <input
                      type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                      placeholder="John" maxLength={50} required
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Last Name</label>
                    <input
                      type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                      placeholder="Doe" maxLength={50} required
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <input
                    type="text" value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                    placeholder="john@example.com" maxLength={254} required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Username</label>
                  <div className="flex gap-2">
                    <input
                      type="text" value={username} onChange={e => handleUsernameChange(e.target.value)}
                      placeholder="Click refresh to generate one" maxLength={30} required
                      className={`flex-1 rounded-lg border px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 transition-all text-sm ${
                        usernameError ? "border-red-500/50 focus:ring-red-500" : "border-border focus:ring-primary"
                      } bg-background`}
                    />
                    <button
                      type="button" onClick={handleGenerateUsername}
                      className="rounded-lg border border-border bg-background px-2.5 py-2 text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                      title="Generate a random username"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  {usernameError && <p className="mt-1 text-xs text-red-500">{usernameError}</p>}
                  {!usernameError && username && isCheckingUsername && <p className="mt-1 text-xs text-muted-foreground">Checking…</p>}
                  {!usernameError && username && !isCheckingUsername && usernameAvailable === true && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-accent"><Check size={12} className="flex-shrink-0" /> Available</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters" maxLength={128} required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>

                {password && (
                  <ul className="space-y-0.5 -mt-1">
                    {passwordRules.map(rule => (
                      <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.met ? "text-accent" : "text-muted-foreground"}`}>
                        <Check size={10} className={`flex-shrink-0 ${rule.met ? "text-accent" : "text-border"}`} />
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Confirm Password</label>
                  <input
                    type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password" required
                    className={`w-full rounded-lg border px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 transition-all bg-background text-sm ${
                      confirmPassword
                        ? password === confirmPassword ? "border-accent focus:ring-accent" : "border-red-500/50 focus:ring-red-500"
                        : "border-border focus:ring-primary"
                    }`}
                  />
                  {confirmPassword && (
                    <p className={`mt-1 flex items-center gap-1 text-xs ${password === confirmPassword ? "text-accent" : "text-red-500"}`}>
                      {password === confirmPassword ? <Check size={10} /> : <X size={10} />}
                      {password === confirmPassword ? "Passwords match" : "Passwords do not match"}
                    </p>
                  )}
                </div>

                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={(token) => { setTurnstileToken(token); setTurnstileLoadError(false); }}
                  onExpire={() => setTurnstileToken("")}
                  onError={() => setTurnstileLoadError(true)}
                  options={{ appearance: "always", theme: "light" }}
                  style={{ margin: "4px auto 0" }}
                />
                {turnstileLoadError && (
                  <p className="text-sm text-red-500 text-center">Security check failed to load. Please refresh the page.</p>
                )}

                <button
                  type="submit" disabled={isSigningUp || !isSignupValid}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSigningUp ? "Creating Account…" : "Create Account"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button onClick={() => { setStep("signin"); setEmailMode(false); }} className="font-medium text-primary hover:underline">
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* ── Step: Verify Email ─────────────────────────────────────────── */}
          {step === "verify_email" && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-green-100 p-4">
                  <Mail size={32} className="text-green-600" />
                </div>
              </div>
              <p className="text-muted-foreground mb-2">We sent a verification link to</p>
              <p className="font-semibold text-foreground mb-4">{verifiedEmail}</p>
              <p className="text-sm text-muted-foreground mb-6">
                Click the link in the email to verify your account, then come back here and sign in.
                If you don't see it, check your spam folder.
              </p>
              <button
                onClick={() => { setStep("signin"); setEmailMode(true); }}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90"
              >
                I've verified my email. Sign In.
              </button>
            </div>
          )}

          {/* ── Step: Sign In — social picker ──────────────────────────────── */}
          {step === "signin" && !emailMode && (
            <>
              {autoSubmit && (
                <p className="text-sm text-muted-foreground mb-5">
                  Your form data is saved and ready to submit.
                </p>
              )}
              <SocialLoginButtons returnTo={returnTo} divider={false} />
              <div className="relative my-4 flex items-center">
                <div className="flex-1 border-t border-border" />
                <span className="mx-3 text-xs font-medium uppercase tracking-widest text-muted-foreground whitespace-nowrap">or</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <button
                type="button"
                onClick={() => setEmailMode(true)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted/60"
              >
                Continue with email
              </button>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                No account?{" "}
                <button onClick={() => { setStep("signup"); setEmailMode(false); }} className="font-medium text-primary hover:underline">
                  Create one
                </button>
              </p>
            </>
          )}

          {/* ── Step: Sign In — email form ──────────────────────────────────── */}
          {step === "signin" && emailMode && (
            <>
              <button
                type="button"
                onClick={() => setEmailMode(false)}
                className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Other sign-in options
              </button>

              {signinError && (
                <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 ${
                  isUnverified ? "border-yellow-500/50 bg-yellow-500/10" : "border-red-500/50 bg-red-500/10"
                }`}>
                  <AlertCircle size={16} className={`flex-shrink-0 mt-0.5 ${isUnverified ? "text-yellow-600" : "text-red-500"}`} />
                  <p className={`text-sm ${isUnverified ? "text-yellow-700" : "text-red-700"}`}>{signinError}</p>
                </div>
              )}

              <form onSubmit={handleSignin} className="space-y-3">
                <input
                  type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                  placeholder="Email or username" required autoFocus
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <input
                  type="password" value={signinPassword} onChange={e => setSigninPassword(e.target.value)}
                  placeholder="Password" required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <button
                  type="submit" disabled={isSigningIn || !identifier || !signinPassword}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSigningIn ? "Signing in…" : autoSubmit ? "Sign In & Submit" : "Sign In"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                No account?{" "}
                <button onClick={() => { setStep("signup"); setEmailMode(false); }} className="font-medium text-primary hover:underline">
                  Create one
                </button>
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
