import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
 
export default function About() {
  return (
    <Layout>
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-10">
            About Werkpages
          </h1>
          <div className="space-y-5 text-muted-foreground leading-relaxed">
            <p>
              Werkpages was created to build the world's most useful and accessible database
              of manager experiences.
            </p>
            <p>
              We're a global platform where employees can anonymously share structured opinions 
              about managers and research workplace leadership before they accept a job offer.
            </p>
            <p>
              We've all taken a job that looked great on paper (good salary, interesting work,
              reputable company) only to discover that the manager made it unbearable. And we
              had no way to know that beforehand.
            </p>
            <p>
              Glassdoor tells you about companies. LinkedIn tells you about careers. Nobody
              tells you about the person you'll be reporting to every single day.
            </p>
            <p className="text-foreground font-medium">That's what Werkpages is for.</p>
            <p>
              We don't run ads. We don't sell your data. This site exists purely to serve the
              community. If you find it valuable and want to help keep it running, you can{" "}
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
      </section>
    </Layout>
  );
}
