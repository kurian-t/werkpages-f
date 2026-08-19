import "./global.css";
import axios from "axios";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import queryClient from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import Index from "./pages/Index";
import BossProfile from "./pages/BossProfile";
import Directory from "./pages/Directory";
import AddBoss from "./pages/AddBoss";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import AccountSettings from "./pages/AccountSettings";
import Admin from "./pages/Admin";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import About from "./pages/About";
import SupportUs from "./pages/SupportUs";
import EmailVerified from "./pages/EmailVerified";
import FindYourManager from "./pages/FindYourManager";
import AuthCallback from "./pages/AuthCallback";
import Companies from "./pages/Companies";
import CompanyProfile from "./pages/CompanyProfile";
import WhatIsWerkpages from "./pages/WhatIsWerkpages";
import ResumeBuilder from "./pages/ResumeBuilder";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PostHogRouteTracker } from "@/components/PostHogProvider";
import "@/lib/posthog";


axios.defaults.withCredentials = true;

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
          <Routes>
            <Route path="/" element={<Index />} />
            {/* Legacy numeric-ID route — redirects to slug URL */}
            <Route path="/manager/:id" element={<BossProfile />} />
            {/* New SEO-friendly slug routes */}
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
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:companySlug" element={<CompanyProfile />} />
            <Route path="/resume" element={<ResumeBuilder />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </DataProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  </HelmetProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
