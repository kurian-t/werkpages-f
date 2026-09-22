import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Page controls, shared by every paginated listing.
 *
 * <p>Extracted rather than copied. The companies listing, the industries listing and each industry
 * profile all page through the same kind of grid, and three hand-maintained copies of this markup
 * is how one of them silently ends up with different behaviour — a different window of page
 * numbers, a disabled state that does not disable, an ellipsis that appears in the wrong place.
 *
 * <p>Renders nothing below two pages: one page is not a choice.
 */
export function Pagination({
  page,
  totalPages,
  onChange,
  className = "mt-8",
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  // First, last, and the current page's immediate neighbours. Everything else collapses to an
  // ellipsis, so 122 pages still fit on a phone.
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | "…")[]>((acc, p, idx, arr) => {
      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
      acc.push(p);
      return acc;
    }, []);

  return (
    <nav className={`${className} flex items-center justify-center gap-1`} aria-label="Pagination">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="rounded-lg border border-border bg-background p-2 text-foreground transition-all hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        <ChevronLeft size={18} />
      </button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            aria-current={page === p ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
              page === p
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="rounded-lg border border-border bg-background p-2 text-foreground transition-all hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}

/** The slice of `items` belonging to `page`, and how many pages there are. */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  // Clamped rather than trusted: a filter that shrinks the list while somebody is on page 7 would
  // otherwise leave them staring at an empty grid with no way back.
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return { visible: items.slice(start, start + perPage), totalPages, safePage };
}
