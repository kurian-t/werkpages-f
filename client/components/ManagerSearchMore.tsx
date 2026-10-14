/**
 * The "there are more of them" control, shared by every manager-search surface.
 *
 * Search returns eight at a time. With thirty credible matches, twenty-two of them were simply
 * unreachable: the server had been reporting `hasMore` since the four-field matcher landed and
 * nothing in the interface read it. Somebody looking for a particular Aaron Yip could be shown
 * eight others and no way to go on.
 *
 * It lives here rather than on each page because all three surfaces owe the reader the same
 * answer, and because the distinction below is easy to get wrong once and then copy twice.
 */
interface Props {
  /** Another PAGE of the matches we found exists. */
  hasMore: boolean;
  /** The candidate scan hit its budget, so there may be matches we never examined. */
  mayBeIncomplete: boolean;
  loading: boolean;
  onLoadMore: () => void;
  className?: string;
}

export default function ManagerSearchMore({
  hasMore, mayBeIncomplete, loading, onLoadMore, className = "",
}: Props) {
  if (!hasMore && !mayBeIncomplete) return null;

  return (
    <div className={`mt-4 flex flex-col items-center gap-2 ${className}`}>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading…" : "Show more results"}
        </button>
      )}

      {/*
        SAID SEPARATELY, AND SAID HONESTLY.

        `hasMore` means "there are more of the matches we found". `moreMatchesMayExist` means
        something weaker and quite different: the candidate scan reached its budget, so there may
        be people we never got as far as examining. Presenting the second as though it were the
        first would promise a complete answer we did not produce, and the reader would stop
        looking believing they had seen everything.
      */}
      {mayBeIncomplete && (
        <p className="text-center text-xs text-muted-foreground">
          There may be more matches than we were able to check. Narrowing the company or job title
          will give a more complete answer.
        </p>
      )}
    </div>
  );
}
