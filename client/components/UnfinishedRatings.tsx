import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";
import { FileClock, Trash2 } from "lucide-react";
import API_BASE from "@/lib/api";
import queryClient from "@/lib/queryClient";

/**
 * Where "Continue" goes, or null when there is nowhere to send them.
 *
 * <p>Returns null rather than a guess. A Continue button that leads to a page which cannot open
 * the draft is worse than no button, and that exact shape - a tile linking somewhere that refuses
 * to serve it - has been a production outage in this product before.
 */
function continueTo(d: Draft): string | null {
  if (!d.subjectSlug) return null;
  if (d.subjectType === "company")  return `/companies/${d.subjectSlug}/rate`;
  if (d.subjectType === "interview") return `/companies/${d.subjectSlug}/interview`;
  if (d.subjectType === "manager")  return `/managers/${d.subjectSlug}`;
  return null;
}

/**
 * The contributor's own unfinished ratings, in their account.
 *
 * <h2>Why this is in the account and not only on the form</h2>
 *
 * <p>A prompt on the rating page only helps somebody who goes back to that page. A person who
 * answered half a rating last week and cannot remember which employer it was about has no route
 * to it at all, and an unfinished contribution nobody can find is the same as a lost one.
 *
 * <p>Everything here is the caller's own: the endpoint resolves the owner from the session and
 * there is no route that names another person's drafts. Nothing about moderation appears, because
 * a contributor reading their own draft is not reading the review queue.
 */

interface Draft {
  id: string;
  subjectType: "manager" | "company" | "interview";
  subjectId: number;
  ordinal: number;
  payload: any;
  version: number;
  savedAt: string;
  expiresAt: string;
  available: boolean;
  unavailableReason?: string;
  redirectTo?: number;
  /** Who it is about, so the list can say so rather than repeating its own heading. */
  subjectName?: string;
  subjectSlug?: string;
}

const WHAT = {
  company: "Workplace rating",
  manager: "Manager rating",
  interview: "Interview experience",
} as const;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/** How far through the form they got, from the answers themselves. */
function progress(payload: any): string | null {
  const ratings = payload?.draft?.ratings ?? payload?.ratings;
  if (!ratings || typeof ratings !== "object") return null;
  const answered = Object.values(ratings).filter((v) => typeof v === "number" && v > 0).length;
  if (!answered) return null;
  return `${answered} ${answered === 1 ? "answer" : "answers"} so far`;
}

export function UnfinishedRatings() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-drafts"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/users/me/drafts`, { withCredentials: true });
      return res.data as { drafts: Draft[]; retentionDays: number };
    },
  });

  const discard = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_BASE}/api/users/me/drafts/${id}`, { withCredentials: true });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["my-drafts"] }); },
  });

  if (isLoading) return null;
  /*
    An error says nothing about whether drafts exist, so it must not render "you have none". That
    sentence would be a claim about somebody's own work that we are in no position to make.
  */
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="unfinished-ratings-error">
        Couldn't load your unfinished ratings just now.
      </p>
    );
  }

  const drafts = data?.drafts ?? [];
  if (drafts.length === 0) return null;

  // The card lives here, so a contributor with nothing unfinished sees no empty box at all.
  return (
    <section
      className="mb-8 space-y-3 rounded-2xl border border-border bg-background p-8 shadow-sm"
      data-testid="unfinished-ratings"
    >
      <div className="flex items-center gap-2">
        <FileClock className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground">Unfinished ratings</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Only you can see these. They're kept for {data?.retentionDays ?? 90} days after your last
        change, and publishing or deleting one ends that sooner.
      </p>
      <ul className="space-y-2">
        {drafts.map((d) => (
          <li key={d.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              data-testid="unfinished-rating">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {d.subjectName ?? WHAT[d.subjectType] ?? "Rating"}
              </p>
              <p className="text-xs text-muted-foreground">{WHAT[d.subjectType] ?? "Rating"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Last changed {when(d.savedAt)}
                {progress(d.payload) ? ` · ${progress(d.payload)}` : ""}
                {` · expires ${when(d.expiresAt)}`}
              </p>
              {!d.available && (
                /*
                  Listed but not resumable. The product decision is that these stay visible and
                  explain themselves rather than disappearing: somebody who spent time on a rating
                  deserves to be told why it cannot be finished, not to find it gone.
                */
                <p className="mt-1 text-xs text-amber-600" data-testid="unfinished-unavailable">
                  {d.unavailableReason ?? "This can no longer be rated."}
                  {d.redirectTo != null && (
                    <>
                      {" "}
                      <Link to={`/managers/${d.redirectTo}`} className="underline">
                        See the profile it was merged into
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {d.available && continueTo(d) && (
                <Link to={continueTo(d)!}
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
                  Continue
                </Link>
              )}
              <button type="button"
                      aria-label="Delete this unfinished rating"
                      disabled={discard.isPending}
                      onClick={() => discard.mutate(d.id)}
                      className="rounded-md p-2 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
