import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";

const FAQS = [
  {
    question: "What is Werkpages?",
    answer:
      "Werkpages is a global platform where employees anonymously share structured ratings and reviews of their managers. It covers managers across all industries and countries, helping workers research workplace leadership before accepting a job offer.",
  },
  {
    question: "Are reviews on Werkpages anonymous?",
    answer:
      "Yes. All reviews are fully anonymous. We never display the reviewer's name, employer, or any personally identifying information alongside a review.",
  },
  {
    question: "Is Werkpages free to use?",
    answer:
      "Yes. Reading reviews and browsing manager profiles is free. Submitting reviews is also free. The platform is community-supported.",
  },
  {
    question: "How are managers rated on Werkpages?",
    answer:
      "Each manager is rated on multiple categories including communication, mentorship, work-life balance, technical ability, feedback quality, and overall leadership. Ratings are averaged across all reviews for that manager.",
  },
  {
    question: "What categories are managers rated on?",
    answer:
      "Werkpages scores managers across: Communication, Mentorship & Growth, Work-Life Balance, Technical Knowledge, Feedback & Recognition, and Overall Leadership.",
  },
  {
    question: "How is Werkpages different from Glassdoor?",
    answer:
      "Glassdoor focuses on companies — salary ranges, CEO approval, and overall company culture. Werkpages focuses on the individual manager — the person you'd report to every day. We fill a gap that company-level reviews cannot: your manager determines more of your day-to-day experience than any company policy.",
  },
  {
    question: "Is Werkpages a niche website?",
    answer:
      "No. Werkpages is a global platform indexing managers across all industries, company sizes, and countries. Our goal is to build the world's most comprehensive, accessible database of manager experiences — for every worker, everywhere.",
  },
];

export default function WhatIsWerkpages() {
  const canonicalUrl = "https://werkpages.com/what-is-werkpages";
  const pageTitle = "What is Werkpages? | Anonymous Manager Reviews & Ratings";
  const pageDescription =
    "Werkpages is a global platform where employees anonymously rate and review their managers. Research workplace leadership before your next job offer.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": FAQS.map((faq) => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer,
          },
        })),
      },
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        "name": pageTitle,
        "description": pageDescription,
        "url": canonicalUrl,
      },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <Layout>
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-6">
              What is Werkpages?
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mb-10">
              Werkpages is a <strong className="text-foreground">global platform</strong> where
              employees anonymously share structured ratings and reviews of their managers — and
              research workplace leadership before accepting a job offer.
            </p>

            <div className="space-y-8 text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Who it's for</h2>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Job seekers who want to know what their future manager is really like</li>
                  <li>Employees who want to share their experience to help others</li>
                  <li>Managers who want honest, anonymous feedback on their leadership</li>
                </ul>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">How it works</h2>
                <ol className="space-y-2 list-decimal list-inside">
                  <li>Search for your manager by name and company</li>
                  <li>Read anonymous, structured reviews from their direct reports</li>
                  <li>See category ratings: communication, mentorship, feedback, work-life balance, and more</li>
                  <li>Submit your own review to help the next person make an informed decision</li>
                </ol>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  What makes it different
                </h2>
                <p>
                  Glassdoor tells you about companies. LinkedIn tells you about careers. Nobody tells
                  you about the specific person you'll report to every day — until now.
                </p>
                <p className="mt-3">
                  Werkpages focuses on the <strong className="text-foreground">individual manager</strong>{" "}
                  — the single biggest factor in your day-to-day work experience. We cover managers
                  globally, across all industries and company sizes.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Our mission</h2>
                <p className="text-foreground font-medium">
                  Werkpages was created to build the world's most useful, accessible database
                  of manager experiences.
                </p>
                <p className="mt-3">
                  We're not a niche review site. We're a global platform — and we run no ads and
                  sell no data. If you find it valuable, you can{" "}
                  <Link
                    to="/support"
                    className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                  >
                    support us here
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="mt-16">
              <h2 className="text-2xl font-bold text-foreground mb-8">Frequently Asked Questions</h2>
              <div className="space-y-6">
                {FAQS.map((faq) => (
                  <div key={faq.question} className="border-b border-border pb-6 last:border-0">
                    <h3 className="text-base font-semibold text-foreground mb-2">{faq.question}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </Layout>
    </>
  );
}
