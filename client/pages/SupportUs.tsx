import { Layout } from "@/components/Layout";
import { Heart, Shield, Server, EyeOff } from "lucide-react";

export default function SupportUs() {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 py-20 md:py-32">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Heart size={32} className="text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Support Werkpages
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Werkpages is an independent, community-driven platform. No investors,
            no advertisers, no corporate agenda, just firsthand reviews to help people make
            better career decisions.
          </p>
          <a
            href="https://ko-fi.com/werkpages"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg"
          >
            <Heart size={18} />
            Support Us on Ko-fi
          </a>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">

          {/* Why we need support */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-foreground mb-6">Why We Need Your Support</h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Running Werkpages isn't free. Every time you search for a manager, load a
                profile, or submit a review, there are real costs behind the scenes, such as servers,
                databases, bandwidth, and the domain that keeps this site at a reliable address.
              </p>
              <p>
                We built this platform because we believe workers deserve better information before
                accepting a job. We want to keep it that way: free, honest, and independent. But
                that only works if the community that benefits from it helps keep it alive.
              </p>
            </div>
          </div>

          {/* What your support means */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-foreground mb-8">What Your Support Means</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <EyeOff size={20} className="text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">No Ads, Ever</h3>
                <p className="text-sm text-muted-foreground">
                  We don't run ads on this platform. Ads create perverse incentives,
                  they reward engagement over accuracy and can be used to manipulate what you see.
                  Your support keeps us ad-free.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Shield size={20} className="text-accent" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Your Data Is Yours</h3>
                <p className="text-sm text-muted-foreground">
                  We don't sell, rent, or share your personal data with third parties.
                  Your reviews are anonymous by design. Your support means we don't need to
                  monetize your information.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                  <Server size={20} className="text-secondary" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Keeping the Lights On</h3>
                <p className="text-sm text-muted-foreground">
                  Servers, databases, and infrastructure cost money every month. Your support
                  directly pays for the hosting that keeps Werkpages fast, reliable,
                  and available 24/7.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                  <Heart size={20} className="text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Built for Workers</h3>
                <p className="text-sm text-muted-foreground">
                  This platform was built by someone who wished it existed before taking a job.
                  Your support helps us keep building features that serve workers, not companies
                  or recruiters.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-background to-accent/10 border border-border p-10 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">Ready to Support Us?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Even a small contribution goes a long way. Every dollar helps keep Werkpages
              independent, ad-free, and working for you.
            </p>
            <a
              href="https://ko-fi.com/werkpages"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg"
            >
              <Heart size={18} />
              Support Us on Ko-fi
            </a>
            <p className="mt-4 text-xs text-muted-foreground">
              No subscription required. Give what you can, when you can.
            </p>
          </div>

        </div>
      </section>
    </Layout>
  );
}
