import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "@/components/Layout";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <Layout>
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8 text-8xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            404
          </div>
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">
            Page Not Found
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
          </p>

          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Back to Home
            </a>
            <a
              href="/directory"
              className="inline-flex items-center justify-center rounded-lg border border-primary bg-primary/10 px-8 py-3 font-medium text-primary transition-all hover:bg-primary/20"
            >
              Browse Directory
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default NotFound;
