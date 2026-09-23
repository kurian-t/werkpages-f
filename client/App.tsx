import "./global.css";
import axios from "axios";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { RouteMeta } from "@/components/RouteMeta";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import queryClient from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import type { ReactElement } from "react";
import { DataProvider } from "@/contexts/DataContext";
import Index from "./pages/Index";
import BossProfile from "./pages/BossProfile";
import Directory from "./pages/Directory";
import NotFound from "./pages/NotFound";
import FindYourManager from "./pages/FindYourManager";
import Companies from "./pages/Companies";
import CompanyProfile from "./pages/CompanyProfile";
import Explore from "./pages/Explore";
import Industries from "./pages/Industries";
import IndustryProfile from "./pages/IndustryProfile";

/*
  Split out of the initial bundle.

  Everything shipped as one 3.6 MB chunk. The worst of it was the resume builder: ResumeCanvas is
  370 KB of source on its own, the feature is restricted to admins, and every anonymous visitor
  was downloading it before the page they asked for could paint.

  The pages a first-time visitor or a crawler arrives on - the homepage, manager and company
  profiles, the directory, explore and the industry pages - stay eagerly imported on purpose.
  Splitting those would add a round trip to exactly the paths that need to be fastest.
*/
const AddBoss = lazy(() => import("./pages/AddBoss"));
const AddInterview = lazy(() => import("./pages/AddInterview"));
const RateCompany = lazy(() => import("./pages/RateCompany"));
const ProveIt = lazy(() => import("./pages/ProveIt"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const Admin = lazy(() => import("./pages/Admin"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const About = lazy(() => import("./pages/About"));
const SupportUs = lazy(() => import("./pages/SupportUs"));
const EmailVerified = lazy(() => import("./pages/EmailVerified"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const WhatIsWerkpages = lazy(() => import("./pages/WhatIsWerkpages"));
const ResumeBuilder = lazy(() => import("./pages/ResumeBuilder"));

import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PostHogRouteTracker } from "@/components/PostHogProvider";
import "@/lib/posthog";


axios.defaults.withCredentials = true;

/** Renders children only for admins; everyone else is redirected to /explore.
 *  Used to keep the Resume Builder hidden while it's in progress. */
function AdminOnly({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/explore" replace />;
  return children;
}

const App = () => (
  <HelmetProvider>
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DataProvider>
        <TooltipProvider>
        <Helmet defaultTitle="Werkpages – Anonymous Manager Reviews & Ratings">
          <meta name="description" content="Anonymously rate and review your manager. Research workplace leadership before you accept a job offer." />
        </Helmet>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <PostHogRouteTracker />
          {/* Canonical for every public route, noindex for the private ones. Routes that set
              their own head tags are skipped - see RouteMeta. */}
          <RouteMeta />
          {/*
            One boundary around the whole route table. The fallback is deliberately empty: these
            chunks resolve in well under a frame on a warm connection, and a spinner that flashes
            for 20ms reads as a glitch rather than as progress.
          */}
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* Canonical, industry-nested routes. The industry segment is descriptive - pages
                resolve on the company and manager slugs alone, and redirect to the canonical
                path when the segment is stale (e.g. after a company is reclassified). */}
            <Route path="/industries/:industrySlug/companies/:companySlug" element={<CompanyProfile />} />
            <Route path="/industries/:industrySlug/companies/:companySlug/managers/:managerSlug" element={<BossProfile />} />
            {/* Legacy routes. Still resolve, then redirect to the canonical path above, so
                existing links and everything already in Google's index keep working. */}
            <Route path="/manager/:id" element={<BossProfile />} />
            <Route path="/companies/:companySlug/managers/:managerSlug" element={<BossProfile />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/add" element={<AddBoss />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/settings" element={<AccountSettings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/about" element={<About />} />
            <Route path="/what-is-werkpages" element={<WhatIsWerkpages />} />
            <Route path="/support" element={<SupportUs />} />
            <Route path="/auth/verified" element={<EmailVerified />} />
            <Route path="/find" element={<FindYourManager />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/industries" element={<Industries />} />
            <Route path="/industries/:slug" element={<IndustryProfile />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:companySlug/add-interview" element={<AddInterview />} />
            {/* Rating the workplace itself. Both URL shapes, like the company page it returns to. */}
            <Route path="/managers/:managerId/confirm" element={<ProveIt />} />
            <Route path="/companies/:companySlug/rate" element={<RateCompany />} />
            <Route path="/industries/:industrySlug/companies/:companySlug/rate" element={<RateCompany />} />
            {/* Same form with no company chosen yet. Sharing an interview should not require
                finding the company's page first. */}
            <Route path="/add-interview" element={<AddInterview />} />
            <Route path="/companies/:companySlug" element={<CompanyProfile />} />
            <Route path="/resume" element={<AdminOnly><ResumeBuilder /></AdminOnly>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        </TooltipProvider>
      </DataProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  </HelmetProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
