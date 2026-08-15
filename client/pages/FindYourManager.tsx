import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import FindManagerForm from "@/components/FindManagerForm";

export default function FindYourManager() {
  const navigate = useNavigate();

  return (
    <Layout>
      <section className="min-h-[calc(100vh-64px)] flex flex-col items-center px-4 pt-16 pb-12">

        <div className="text-center max-w-lg mb-10">
          <h1 className="text-[28px] sm:text-[34px] font-semibold leading-snug tracking-tight text-foreground">
            Find your manager
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Search for your manager to see how others rated them.
          </p>
        </div>

        <div className="w-full max-w-xl">
          <FindManagerForm />
        </div>

        <div className="w-full max-w-xl mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Want to browse instead?{" "}
            <button onClick={() => navigate("/directory")} className="text-primary hover:underline font-medium">
              View directory
            </button>
          </p>
        </div>

      </section>
    </Layout>
  );
}
