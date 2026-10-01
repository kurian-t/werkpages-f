import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Header } from "./Header";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/hooks/useAuth";

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const isBanned = user?.isBanned === true;
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {isBanned && (
        <div className="w-full bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            Your account has been suspended. All write actions are disabled.
            To appeal, email <a href="mailto:contact@werkpages.com" className="underline font-semibold">contact@werkpages.com</a>
          </span>
        </div>
      )}
      <main key={pathname} className="animate-page-enter">{children}</main>
      <footer className="border-t border-border bg-background/50 mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
            {/* Left: Branding */}
            <div className="flex flex-col items-center md:items-start gap-1">
              <BrandLogo />
              <p className="text-xs text-muted-foreground">Anonymous opinions on workplace managers.</p>
            </div>

            {/* Center: Nav */}
            <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link to="/about" className="hover:text-primary transition-colors">About</Link>
              <Link to="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-primary transition-colors">Terms</Link>
              <Link to="/support" className="hover:text-primary transition-colors">Support Us</Link>
            </nav>

            {/* Right: Copyright + contact */}
            <div className="flex flex-col items-center md:items-end gap-1">
              <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Werkpages</p>
              <p className="text-xs text-muted-foreground">Questions? Email us at contact@werkpages.com</p>
            </div>
          </div>

          {/* Legal line */}
          <div className="mt-6 border-t border-border pt-5 text-center">
            <p className="text-[11px] text-muted-foreground">
              All content is user-submitted and reflects personal opinions only. Profiles and reviews are not independently verified.{" "}
              <Link to="/terms" className="underline hover:text-foreground transition-colors">Terms of Use</Link>
              {" · "}
              <Link to="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>
            </p>
            {/*
              Required, not decorative.

              The location picker surfaces GeoNames data, which is CC BY 4.0: attribution-only, but
              the attribution is obliged wherever the data is surfaced. Neither product credited it
              anywhere. Overture Places is CDLA-Permissive-2.0 and is credited alongside it.

              In the footer rather than inside the suggestion dropdown, where it was first put: an
              extra line there made the dropdown taller, which moved the options out of reach on
              small viewports and broke twenty tests that click them. A credit must not be able to
              change the geometry of the control it credits.
            */}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Location data from{" "}
              <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer"
                 className="underline hover:text-foreground transition-colors">GeoNames</a>
              {" ("}
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer"
                 className="underline hover:text-foreground transition-colors">CC BY 4.0</a>
              {") and "}
              <a href="https://overturemaps.org/" target="_blank" rel="noopener noreferrer"
                 className="underline hover:text-foreground transition-colors">Overture Maps</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}