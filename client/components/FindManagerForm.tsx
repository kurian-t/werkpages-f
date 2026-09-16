import { validateManagerName } from "@/lib/managerName";
import {
  captureSearch as sharedCaptureSearch,
  captureKey,
  searchForManager,
  CAPTURE_DEBOUNCE_MS,
} from "@/lib/managerSearch";
import { useState, useEffect, useRef } from "react";
import { useCompanySelection } from "@/hooks/useCompanySelection";
import { useNavigate } from "react-router-dom";
import { toNameCase, toJobTitleCase } from "@/lib/utils";
import ManagerCard from "@/components/ManagerCard";
import LockedManagerCard from "@/components/LockedManagerCard";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { useAuth } from "@/hooks/useAuth";
import { fetchGeo } from "@/lib/geo";

const INPUT_CLASS =
  "rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] shadow-sm placeholder:text-muted-foreground";



interface Props {
  prefilledCompany?: string;
}

export default function FindManagerForm({ prefilledCompany }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [title,     setTitle]     = useState("");
  // One object owns the name, the identity and the rule that typing invalidates it.
  const company = useCompanySelection(prefilledCompany ?? "");


  const [results,        setResults]        = useState<any[] | null>(null);
  const [hasContributed, setHasContributed] = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [searched,       setSearched]       = useState(false);

  const nameFilled    = firstName.trim().length > 0 && lastName.trim().length >= 2;
  const detailsFilled = title.trim().length > 0 && company.name.trim().length >= 2;
  const allFilled     = nameFilled && detailsFilled;

  // Ref lets doSearch always see the current user without being a dependency
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  /**
   * Builds the one shape {@link managerSearch} works in. The company is the only part that differs
   * between the three surfaces, so it arrives as a resolver rather than a value.
   */
  const searchInput = (fn: string, ln: string, t: string) => ({
    firstName: fn,
    lastName: ln,
    title: t,
    companyPayload: company.payload,
    companyName: company.name,
    isLoggedIn: !!userRef.current,
  });

  const captureSearch = (
    fn: string, ln: string, t: string,
    geo: { country?: string; state?: string; city?: string },
  ) => sharedCaptureSearch(searchInput(fn, ln, t), geo as any);

  /**
   * Captures a search the person never completed.
   *
   * The Find button stays gated on every field, so a half-filled search is never submitted and,
   * until now, was never recorded either - somebody who typed a name and a company and then gave
   * up left nothing behind. This fires as soon as there is enough to act on, without waiting for
   * them to finish, which is the only way a partial search is ever captured at all.
   *
   * Keyed on what was actually sent, so refining the company or title captures the better version
   * once, and idle keystrokes do not re-post the same thing.
   */
  const lastCapturedRef = useRef<string>("");
  useEffect(() => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const t  = title.trim();
    const c  = company.name.trim();
    if (!fn || !ln) return;
    if (!c && !t) return;  // a bare name tells an admin nothing

    const key = captureKey({ firstName: fn, lastName: ln, title: t, companyName: c });
    if (lastCapturedRef.current === key) return;
    lastCapturedRef.current = key;

    const timer = setTimeout(() => {
      void (async () => {
        const geo = await fetchGeo().catch(() => ({}) as Awaited<ReturnType<typeof fetchGeo>>);
        await captureSearch(fn, ln, t, geo);
      })();
    }, CAPTURE_DEBOUNCE_MS);  // let them finish typing before deciding they have stopped
    return () => clearTimeout(timer);
  }, [firstName, lastName, title, company.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = async (fn: string, ln: string, t: string, c: string) => {
    if (validateManagerName(fn, ln)) {
      setResults([]);
      setSearched(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);

    // Persist search params so we can restore them if the user rates and returns
    sessionStorage.setItem("rmm_find_search", JSON.stringify({ firstName: fn, lastName: ln, title: t, company: c }));

    try {
      const outcome = await searchForManager(searchInput(fn, ln, t));
      setResults(outcome.results);
      setHasContributed(outcome.hasContributed);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      const isServerError = !err?.response || err?.response?.status >= 500;
      setError(isServerError ? "Something went wrong. Please try again." : (msg ?? "Something went wrong. Please try again."));
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allFilled) return;
    await doSearch(
      toNameCase(firstName),
      toNameCase(lastName),
      toJobTitleCase(title),
      company.name.trim(),
    );
  };

  // When the user rates a manager and navigates back to /find, auto-re-search
  // so tiles unlock without a manual refresh.
  useEffect(() => {
    if (sessionStorage.getItem("rmm_just_rated") !== "1") return;
    const raw = sessionStorage.getItem("rmm_find_search");
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as { firstName: string; lastName: string; title: string; company: string };
      sessionStorage.removeItem("rmm_just_rated");
      setFirstName(p.firstName);
      setLastName(p.lastName);
      setTitle(p.title);
      company.set(p.company);
      doSearch(p.firstName, p.lastName, p.title, p.company);
    } catch { /* corrupted sessionStorage - ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasResults = searched && !loading && results !== null && results.length > 0;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch}>
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          <p className="text-sm text-muted-foreground font-medium">I'm looking for…</p>

          {/* Name row */}
          <div className="flex flex-wrap items-center gap-2 text-base">
            <input
              value={firstName}
              onChange={e => { setFirstName(e.target.value); setError(null); }}
              placeholder="First name"
              autoFocus={!prefilledCompany}
              className={`${INPUT_CLASS} w-[calc(50%-0.25rem)] min-w-[120px] flex-1`}
            />
            <input
              value={lastName}
              onChange={e => { setLastName(e.target.value); setError(null); }}
              placeholder="Last name"
              className={`${INPUT_CLASS} w-[calc(50%-0.25rem)] min-w-[120px] flex-1`}
            />
          </div>

          {/* Sentence line */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">who is a</span>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setError(null); }}
              placeholder="job title"
              className={`${INPUT_CLASS} flex-1 min-w-[140px]`}
            />
            <span className="shrink-0">at</span>
            {prefilledCompany ? (
              <span className="font-semibold text-foreground">{prefilledCompany}</span>
            ) : (
              <div className="flex-1 min-w-[140px]">
                <CompanyAutocomplete
                  {...company.bind}
                  onChange={val => { company.bind.onChange(val); setError(null); }}
                  placeholder="company"
                  className={`${INPUT_CLASS} w-full`}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!allFilled || loading}
            style={{ backgroundColor: !allFilled || loading ? 'rgba(46, 5, 98, 0.4)' : '#2e0562' }}
            className="w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors shadow-md disabled:cursor-not-allowed"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {/* Results */}
      {searched && !loading && (
        <div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
              <p className="text-sm font-semibold text-destructive">Something went wrong</p>
              <p className="mt-1 text-xs text-muted-foreground">Please try again in a moment.</p>
            </div>
          ) : results && results.length > 0 ? (
            <div className="flex flex-col gap-3">
              {results.map((boss: any) =>
                hasContributed ? (
                  <ManagerCard key={boss.id} boss={boss} />
                ) : (
                  <LockedManagerCard
                    key={boss.id}
                    boss={boss}
                    isLoggedIn={!!user}
                    asLink={true}
                    blurRating={true}
                    blurTitle={true}
                    forceShowCompany={true}
                  />
                )
              )}
              {hasContributed && (
                <button
                  onClick={() => navigate(`/directory?search=${encodeURIComponent(`${firstName} ${lastName}`)}`)}
                  className="mt-2 text-sm text-primary hover:underline text-center"
                >
                  See all results in directory →
                </button>
              )}
              {!hasContributed && (
                <div className="mt-2 rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-sm font-semibold text-foreground">Rate a manager to unlock ratings</p>
                  <p className="mt-1 text-xs text-muted-foreground">It's anonymous and takes 2 minutes.</p>
                  <button
                    onClick={() => navigate("/add")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                  >
                    ⭐ Rate a manager
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm font-semibold text-foreground">No manager found</p>
              {user ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try checking the spelling or add them yourself.
                  </p>
                  <button
                    onClick={() => navigate("/add")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    + Add manager
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sign in to add this manager and rate to unlock profiles.
                  </p>
                  <button
                    onClick={() => navigate("/signin", { state: { returnTo: window.location.pathname } })}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
