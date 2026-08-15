import { Layout } from "@/components/Layout";
import { ArrowRight } from "lucide-react";

export default function AddReview() {
  return (
    <Layout>
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8 text-6xl">✍️</div>
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">
            Share Your Experience
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Want to add or write a review for a manager? This feature is coming soon!
          </p>
          <p className="mt-4 text-muted-foreground">
            In the meantime, you can browse our directory of leaders and read reviews from the tech community.
          </p>

          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Back to Home
            </a>
            <a
              href="/directory"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-8 py-3 font-medium text-primary transition-all hover:bg-primary/20"
            >
              Browse Directory
              <ArrowRight size={18} />
            </a>
          </div>

          <div className="mt-16 rounded-xl border border-border bg-background/50 p-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Coming Soon</h2>
            <ul className="space-y-3 text-left text-muted-foreground">
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                  ✓
                </span>
                Submit new tech leaders to rate
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                  ✓
                </span>
                Write detailed reviews and ratings
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                  ✓
                </span>
                Rate multiple aspects (leadership, innovation, culture, etc.)
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                  ✓
                </span>
                Build your professional reputation on the platform
              </li>
            </ul>
          </div>
        </div>
      </section>
    </Layout>
  );
}
