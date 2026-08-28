import API_BASE from "@/lib/api";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { User, Building2, Briefcase, Search, ArrowRight } from "lucide-react";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import FindManagerForm from "@/components/FindManagerForm";
import axios from "axios";

type Mode = "manager" | "company" | "industry";

interface IndustryEntry { industry: string; slug: string; companyCount: number; managerCount: number; }

/**
 * Company search - the EXACT same autocomplete used on the Companies tab (logo suggestions as you
 * type, via CompanyAutocomplete). Selecting a suggestion navigates to that company's profile.
 */
function CompanySearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const goToCompany = (name: string, slug?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    navigate(slug ? `/companies/${slug}` : `/companies/${encodeURIComponent(trimmed)}`);
  };
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">Company</label>
      <form onSubmit={(e) => { e.preventDefault(); goToCompany(q); }}>
        <CompanyAutocomplete
          value={q}
          onChange={setQ}
          onSuggestionSelect={(name) => goToCompany(name)}
          onClear={() => setQ("")}
          placeholder="Search for a company…"
          className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
        />
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Pick a company to see how its managers are rated.</p>
    </div>
  );
}

/** Industry search - a proper combobox that only opens on focus. Selecting navigates to the profile. */
function IndustrySearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["industry-listing"],
    queryFn: async () => (await axios.get(`${API_BASE}/api/industries/listing`)).data.data as IndustryEntry[],
  });
  const industries = data ?? [];
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? industries.filter((i) => i.industry.toLowerCase().includes(t)) : industries;
    return base.slice(0, 12);
  }, [q, industries]);

  // Close when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (i: IndustryEntry) => { setOpen(false); navigate(`/industries/${i.slug}`); };

  return (
    <div ref={wrapRef}>
      <label className="block text-sm font-medium text-foreground mb-1.5">Industry</label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) go(matches[0]); if (e.key === "Escape") setOpen(false); }}
          placeholder="Search industries…"
          className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
        />
        {open && matches.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
            {matches.map((i) => (
              <button
                key={i.slug}
                onClick={() => go(i)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#d5cde0] transition-colors"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#2e0562]/10 text-[#2e0562]"><Briefcase size={14} /></span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{i.industry}</span>
                <span className="flex-shrink-0 text-xs text-muted-foreground">{i.companyCount} {i.companyCount === 1 ? "company" : "companies"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Compare workplace experiences across an industry.</p>
    </div>
  );
}

function BrowseCard({ title, desc, cta, to }: { title: string; desc: string; cta: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[#2e0562]/30"
    >
      <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{desc}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2e0562] group-hover:gap-2 transition-all">
        {cta} <ArrowRight size={15} />
      </span>
    </button>
  );
}

export default function Explore() {
  const [mode, setMode] = useState<Mode>("manager");

  const segments: { id: Mode; label: string; Icon: typeof User }[] = [
    { id: "manager",  label: "Manager",  Icon: User },
    { id: "company",  label: "Company",  Icon: Building2 },
    { id: "industry", label: "Industry", Icon: Briefcase },
  ];

  return (
    <Layout>
      <section className="px-4 pt-12 pb-8 text-center">
        <h1 className="text-[28px] sm:text-[36px] font-semibold leading-tight tracking-tight text-foreground">
          Explore the world of work
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground">
          Search workplace perceptions from around the world.
        </p>
      </section>

      <div className="mx-auto w-full max-w-2xl px-4">
        <p className="text-center text-sm font-medium text-muted-foreground mb-3">What are you looking for?</p>

        {/* Segmented toggle */}
        <div className="mx-auto mb-5 flex max-w-md items-center gap-2">
          {segments.map((s) => {
            const active = mode === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setMode(s.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? "border-[#2e0562] bg-[#2e0562] text-white shadow-sm"
                    : "border-border bg-background text-foreground hover:bg-[#d5cde0]"
                }`}
              >
                <s.Icon size={16} /> {s.label}
              </button>
            );
          })}
        </div>

        {/* Active search card */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          {mode === "manager" && (
            <>
              <h2 className="mb-4 text-base font-semibold text-foreground">Search for a manager</h2>
              <FindManagerForm />
            </>
          )}
          {mode === "company"  && <CompanySearchBox />}
          {mode === "industry" && <IndustrySearchBox />}
        </div>
      </div>

      {/* Prefer to browse? */}
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
          Prefer to browse?
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <BrowseCard title="Managers"   desc="Discover managers already on Werkpages."      cta="Browse managers"   to="/directory" />
          <BrowseCard title="Companies"  desc="Explore workplaces around the world."         cta="Browse companies"  to="/companies" />
          <BrowseCard title="Industries" desc="Compare workplace experiences by industry."   cta="Browse industries" to="/industries" />
        </div>
      </div>
    </Layout>
  );
}
