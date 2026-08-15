import API_BASE from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { validateUsername, validateEmail, validatePhone, generateUsername } from "@/lib/validators";
import { AlertCircle, RotateCcw, Check, X, Mail } from "lucide-react";
import axios from "axios";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

export default function SignUp() {
  const { isAuthenticated } = useAuth();

  // ── All hooks must come before any conditional return ──────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileLoadError, setTurnstileLoadError] = useState(false);
  const [turnstileTimedOut, setTurnstileTimedOut] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameCheckFailed, setUsernameCheckFailed] = useState(false);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // If Turnstile hasn't completed after 8s, show a hint (likely blocked by ad blocker or firewall)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const t = setTimeout(() => {
      if (!turnstileToken) setTurnstileTimedOut(true);
    }, 8000);
    return () => clearTimeout(t);
  }, []);



  // ── Derived state ──────────────────────────────────────────────────────────
  const passwordRules = [
    { label: "At least 8 characters",        met: password.length >= 8 },
    { label: "At least one uppercase letter", met: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter", met: /[a-z]/.test(password) },
    { label: "At least one number",           met: /[0-9]/.test(password) },
    { label: "At least one special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordValid = passwordRules.every((r) => r.met);

  const isFormValid =
    firstName && lastName && emailOrPhone && username &&
    !usernameError && usernameAvailable === true && !isCheckingUsername &&
    password && confirmPassword &&
    password === confirmPassword && passwordValid &&
    (!TURNSTILE_SITE_KEY || !!turnstileToken);

  if (isAuthenticated) return <Navigate to="/find" replace />;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleGenerateUsername = () => {
    const generated = generateUsername();
    handleUsernameChange(generated);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameAvailable(null);
    setUsernameCheckFailed(false);
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
        setUsernameCheckFailed(true);
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!firstName.trim()) { setError("First name is required"); return; }
    if (!lastName.trim()) { setError("Last name is required"); return; }
    if (!emailOrPhone.trim()) { setError("Email or phone number is required"); return; }

    const isEmail = emailOrPhone.includes("@");
    if (isEmail) {
      if (!validateEmail(emailOrPhone)) { setError("Please enter a valid email address"); return; }
    } else {
      if (!validatePhone(emailOrPhone)) { setError("Please enter a valid email address"); return; }
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) { setError(usernameValidation.error || "Invalid username"); return; }
    if (!password) { setError("Password is required"); return; }
    if (!passwordValid) { setError("Please make sure your password meets all requirements below."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }

    setIsLoading(true);
    try {
      await axios.post(
        `${API_BASE}/api/auth/signup`,
        {
          email: emailOrPhone,
          username: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
          ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {}),
        },
        { headers: { "Content-Type": "application/json" } }
      );

      setSignupEmail(emailOrPhone);
      setSignupSuccess(true);
    } catch (err: any) {
      if (err?.response?.data?.error === "username_taken") {
        setUsernameError("That username is already taken. Please choose another.");
        return;
      }
      if (err?.response?.data?.error === "email_already_registered") {
        setError("An account with this email already exists. Please sign in instead.");
        turnstileRef.current?.reset();
        setTurnstileToken("");
        return;
      }
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.description ||
        err?.response?.data?.error ||
        "Failed to sign up. Please try again.";
      setError(message);
      turnstileRef.current?.reset();
      setTurnstileToken("");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (signupSuccess) {
    return (
      <Layout>
        <section className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-border bg-background p-8 shadow-lg text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-green-100 p-4">
                  <Mail size={32} className="text-green-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
              <p className="text-muted-foreground mb-4">We sent a verification link to</p>
              <p className="font-semibold text-foreground mb-6">{signupEmail}</p>
              <p className="text-sm text-muted-foreground mb-8">
                Click the link in the email to verify your account before signing in.
                If you don't see it, check your spam folder.
              </p>
              <Link
                to="/signin"
                className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center font-medium text-primary-foreground transition-all hover:bg-primary/90"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-background p-8 shadow-lg">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-foreground">Create Account</h1>
              <p className="mt-2 text-muted-foreground">Join Rate My Managers community</p>
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <SocialLoginButtons />

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-foreground mb-2">First Name</label>
                  <input
                    id="firstName" type="text" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    maxLength={50}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-foreground mb-2">Last Name</label>
                  <input
                    id="lastName" type="text" value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    maxLength={50}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="emailOrPhone" className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input
                  id="emailOrPhone" type="text" value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder="john@example.com"
                  maxLength={254}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-foreground mb-2">
                  Username
                </label>
                <div className="flex gap-2">
                  <input
                    id="username" type="text" value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="Click refresh to generate one"
                    maxLength={30}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                      usernameError ? "border-red-500/50 focus:ring-red-500" : "border-border focus:ring-primary"
                    } bg-background`}
                    required
                  />
                  <button
                    type="button"
                    onClick={handleGenerateUsername}
                    className="rounded-lg border border-border bg-background px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                    title="Generate a random username"
                  >
                    <RotateCcw size={20} />
                  </button>
                </div>
                {usernameError && <p className="mt-2 text-sm text-red-500">{usernameError}</p>}
                {!usernameError && username && isCheckingUsername && (
                  <p className="mt-2 text-sm text-muted-foreground">Checking availability…</p>
                )}
                {!usernameError && username && !isCheckingUsername && usernameAvailable === true && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-accent">
                    <Check size={16} className="flex-shrink-0" /> Username is available!
                  </p>
                )}
                {usernameCheckFailed && (
                  <p className="mt-2 text-sm text-red-500">
                    Couldn't check username availability.{" "}
                    <button type="button" className="underline" onClick={() => handleUsernameChange(username)}>Try again</button>
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Click the refresh button to generate a random username, or type your own.
                </p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">Password</label>
                <input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  maxLength={128}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  required
                />
              </div>

              {password && (
                <ul className="space-y-1 -mt-2">
                  {passwordRules.map((rule) => (
                    <li key={rule.label} className={`flex items-center gap-2 text-xs ${rule.met ? "text-accent" : "text-muted-foreground"}`}>
                      <Check size={12} className={`flex-shrink-0 ${rule.met ? "text-accent" : "text-border"}`} />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">Confirm Password</label>
                <input
                  id="confirmPassword" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className={`w-full rounded-lg border px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 transition-all bg-background ${
                    confirmPassword
                      ? password === confirmPassword
                        ? "border-accent focus:ring-accent"
                        : "border-red-500/50 focus:ring-red-500"
                      : "border-border focus:ring-primary"
                  }`}
                  required
                />
                {confirmPassword && (
                  <p className={`mt-2 flex items-center gap-2 text-xs ${password === confirmPassword ? "text-accent" : "text-red-500"}`}>
                    {password === confirmPassword ? <Check size={12} className="flex-shrink-0" /> : <X size={12} className="flex-shrink-0" />}
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
                style={{ margin: "8px auto 0" }}
              />
              {(turnstileLoadError || (turnstileTimedOut && !turnstileToken)) && (
                <p className="text-sm text-amber-600 text-center">
                  Security check didn't load. Try disabling your ad blocker, then refresh the page.
                </p>
              )}

              <button
                type="submit" disabled={isLoading || !isFormValid}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creating Account..." : "Create Account"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-sm text-muted-foreground">Already have an account?</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Link
              to="/signin"
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
