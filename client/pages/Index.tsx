import { useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAnalytics } from "@/hooks/useAnalytics";
import { Layout } from "@/components/Layout";
import axios from "axios";
import API_BASE from "@/lib/api";
import { startSocialLogin } from "@/lib/auth";
import { GoogleIcon } from "@/components/SocialIcons";
import { Star, ShieldCheck, EyeOff, AlertCircle, CheckCircle } from "lucide-react";

// ─── Static mock review ───────────────────────────────────────────────────────
const SAMPLE_RATINGS: { label: string; score: number }[] = [
  { label: "Communication Style", score: 4 },
  { label: "Feedback Style", score: 3 },
  { label: "Decision Making Style", score: 3 },
  { label: "Delegation Style", score: 5 },
  { label: "Overall Working Experience", score: 4 },
];

function StarRow({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < score ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}
        />
      ))}
    </span>
  );
}

function HeroImage({ className, imgClass }: { className?: string; imgClass?: string }) {
  return (
    <div className={`relative w-fit ${className ?? ""}`}>
      <img
        src="/hero-girl-telescope-bg-v1.png"
        className={`w-auto ${imgClass ?? ""}`}
        alt=""
      />
      {/* Twinkling stars — placed over the drawn stars in the upper-left of the image */}
      <span className="hero-star hero-star-1" style={{ top: "6%",  left: "11%" }}>✦</span>
      <span className="hero-star hero-star-2" style={{ top: "3%",  left: "19%" }}>✦</span>
      <span className="hero-star hero-star-3" style={{ top: "14%", left: "6%"  }}>✦</span>
      <span className="hero-star hero-star-4" style={{ top: "10%", left: "18%" }}>✦</span>
      <span className="hero-star hero-star-5" style={{ top: "17%", left: "12%" }}>✦</span>
      <span className="hero-star hero-star-6" style={{ top: "7%",  left: "24%" }}>✦</span>
      {/* Rocket sparks — scattered around the exhaust nozzle */}
      <span className="hero-spark hero-spark-1" style={{ top: "85%", left: "66%" }}>✦</span>
      <span className="hero-spark hero-spark-2" style={{ top: "89%", left: "71%" }}>✦</span>
      <span className="hero-spark hero-spark-3" style={{ top: "93%", left: "68%" }}>✦</span>
      <span className="hero-spark hero-spark-4" style={{ top: "84%", left: "73%" }}>✦</span>
      <span className="hero-spark hero-spark-5" style={{ top: "91%", left: "64%" }}>✦</span>
      <span className="hero-spark hero-spark-6" style={{ top: "87%", left: "75%" }}>✦</span>
      <span className="hero-spark hero-spark-7" style={{ top: "95%", left: "70%" }}>✦</span>
      {/* Telescope projection bubbles — pop and disappear */}
      <div className="hero-bubble hero-bubble-main" style={{ top: "62%", left: "12%" }} />
      <div className="hero-bubble hero-bubble-2"    style={{ top: "53%", left: "7%"  }} />
      <div className="hero-bubble hero-bubble-3"    style={{ top: "68%", left: "16%" }} />
      <div className="hero-bubble hero-bubble-4"    style={{ top: "57%", left: "5%"  }} />
      {/* Purple pom-pom keychain dangling from backpack */}
      <div className="hero-pom-keychain" style={{ top: "63%", left: "89%" }}>
        <div className="hero-pom-cord" />
        <div className="hero-pom-ball" />
      </div>
    </div>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { track } = useAnalytics();

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get("code") === "success" && params.get("success") === "true") {
      try {
        const pendingReview = localStorage.getItem("rmm_pending_review");
        const pendingManager = localStorage.getItem("rmm_pending_manager");

        if (pendingReview) {
          const d = JSON.parse(pendingReview);
          navigate(`${d.returnTo}?verified=true`, { replace: true });
          return;
        }

        if (pendingManager) {
          navigate("/add?verified=true", { replace: true });
          return;
        }
      } catch {}

      navigate("/signin", { replace: true, state: { emailVerified: true, returnTo: "/find" } });
    }
  }, [location.search, navigate]);


  const heroCta = (
    <div className="mt-5 w-full max-w-[460px] space-y-3">
      <button
        onClick={() => { track("cta_clicked", { method: "google" }); startSocialLogin("google-oauth2", "/find"); }}
        className="flex h-[46px] w-full items-center justify-center gap-3 rounded-md border border-[#8B3BD3] bg-[#8B3BD3] px-4 text-[14px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(139,59,211,0.45)]"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      <button
        onClick={() => { track("cta_clicked", { method: "email" }); navigate("/signin", { state: { returnTo: "/find" } }); }}
        className="flex h-[46px] w-full items-center justify-center rounded-md border border-black/22 bg-white px-4 text-[14px] font-semibold shadow-sm hover:bg-neutral-50"
      >
        Continue with Facebook, Microsoft, or email
      </button>
      <p className="text-center text-[12px] text-muted-foreground">
        Your account is never shared with employers or managers.
      </p>
    </div>
  );

  const browsingLink = (
    <Link
      to="/directory"
      onClick={() => { track("cta_clicked", { method: "just_browsing" }); window.scrollTo(0, 0); }}
      className="mt-3 text-[13px] text-muted-foreground hover:text-foreground underline underline-offset-2"
    >
      Just browsing? Search managers without signing in →
    </Link>
  );

  return (
    <Layout>
      {/* Hero */}
      <section className="border-b border-border">

        {/* Large screens (lg+): content first, image BELOW buttons */}
        <div className="hidden lg:flex flex-col items-center text-center px-4 pt-8">
          <h1 className="text-[38px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground max-w-2xl">
            Had a great manager? A terrible one?
          </h1>
          <div className="mt-5 w-full max-w-[460px]">
            <p className="text-[17px] font-semibold text-foreground">Rate them anonymously</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Help the next person know what they're walking into. Star ratings only, takes 2 minutes.
            </p>
          </div>
          {heroCta}
          {browsingLink}
          <HeroImage className="mt-2" imgClass="max-h-[300px]" />
        </div>

        {/* Small/medium screens (<lg): image ABOVE title */}
        <div className="flex flex-col lg:hidden">
          <HeroImage className="" imgClass="max-h-[260px] mx-auto" />
          <div className="flex flex-col items-center text-center px-4 pt-4 pb-8">
            <h1 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
              Had a great manager? A terrible one?
            </h1>
            <div className="mt-5 w-full max-w-[460px]">
              <p className="text-[17px] font-semibold text-foreground">Rate them anonymously</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Help the next person know what they're walking into. Star ratings only, takes 2 minutes.
              </p>
            </div>
            {heroCta}
            {browsingLink}
          </div>
        </div>

      </section>

      {/* TRUST & SAFETY */}
      <section className="border-b border-border py-8 sm:py-10 bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-[20px] font-semibold sm:text-[22px] mb-6">
            Your safety, answered
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">

            <div className="flex gap-3">
              <EyeOff size={20} className="mt-0.5 shrink-0 text-[#2e0562]" />
              <div>
                <p className="text-[14px] font-semibold text-foreground">Is it really anonymous?</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Yes. Your name never appears on any review or manager listing. We only use your account to prevent duplicate submissions.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#2e0562]" />
              <div>
                <p className="text-[14px] font-semibold text-foreground">Can my employer find out?</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  No. Your account is not shared with employers or managers. Not your name, email, or any identifying information.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <AlertCircle size={20} className="mt-0.5 shrink-0 text-[#2e0562]" />
              <div>
                <p className="text-[14px] font-semibold text-foreground">What stops fake reviews?</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Accounts are required to submit reviews, which lets us detect and remove abuse. Each manager submission is also reviewed before going live.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <CheckCircle size={20} className="mt-0.5 shrink-0 text-[#2e0562]" />
              <div>
                <p className="text-[14px] font-semibold text-foreground">Is this allowed?</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Yes. The site is built around structured opinion-based ratings, not written accusations. We also review submissions and don't allow defamatory content.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SAMPLE REVIEW */}
      <section className="border-b border-border py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-[20px] font-semibold sm:text-[22px] mb-2">
            Here's what a review looks like
          </h2>
          <p className="text-center text-[13px] text-muted-foreground mb-6">
            Star ratings by category. No essays required.
          </p>

          <div className="mx-auto max-w-md rounded-xl border border-border bg-background shadow-sm p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Engineering Manager · Acme Corp</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">Jan 2022 – Mar 2024</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Star size={15} className="fill-amber-400 text-amber-400" />
                <span className="text-[14px] font-semibold">4.0</span>
                <span className="text-[12px] text-muted-foreground">/ 5</span>
              </div>
            </div>

            {/* Category ratings */}
            <div className="space-y-2">
              {SAMPLE_RATINGS.map(({ label, score }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-muted-foreground">{label}</span>
                  <StarRow score={score} />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground italic">HappyOtter42 · January 2025</span>
              <span className="text-[11px] text-muted-foreground">Example only</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-4 sm:py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-[22px] font-semibold sm:text-[26px]">
            How it works
          </h2>

          <div className="mx-auto mt-5 grid max-w-5xl gap-6 sm:grid-cols-3">

            <div className="flex flex-col items-center text-center">
              <img src="/final-icon-v1.png" className="h-12 w-12 mb-3" />
              <h3 className="text-[15px] font-semibold text-foreground">Think of a manager you've had</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Good or bad, both matter.</p>
            </div>

            <div className="flex flex-col items-center text-center sm:border-x sm:px-6">
              <img src="/final-icon-v2.png" className="h-12 w-15 mb-3" />
              <h3 className="text-[15px] font-semibold text-foreground">Rate them in 2 minutes</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Star ratings only. Posted anonymously, takes 2 minutes.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <img src="/final-icon-v3.png" className="h-12 w-12 mb-3" />
              <h3 className="text-[15px] font-semibold text-foreground">Help the next person decide</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Your rating gives the next person the full picture before they say yes.</p>
            </div>

          </div>


        </div>
      </section>

    </Layout>
  );
}
