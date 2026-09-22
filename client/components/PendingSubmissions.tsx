import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import API_BASE from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import ManagerCard from "@/components/ManagerCard";
import { TILE_GRID } from "@/components/ManagerTile";

/**
 * A manager you submitted that an admin has not yet looked at.
 *
 * <p>Pending rows are invisible to the public directory by design — but not to the person who
 * filed them. Somebody who has just added a manager and is told it went for review needs to see
 * it somewhere, or the submission simply vanishes and they file it again.
 */
export interface PendingSubmission {
  id: number;
  name: string;
  company: string;
  /** Which company row it actually belongs to. The name is a label; this is the identity. */
  companyId?: number | null;
  title?: string;
  approvalStatus?: string;
  companyLogoUrl?: string;
  reviews?: number;
  overallRating?: number;
}

/**
 * The caller's own pending submissions, optionally narrowed to one company.
 *
 * <p><b>Scoped by company id, never by name.</b> "Revvity" and "Revvity Inc." are the same
 * employer and two strings; matching on the label would drop a tile from the page it belongs on
 * and, worse, could show one on a page it does not. The company row is the identity.
 *
 * <p>The query key is shared with every other caller, so the two surfaces that show these tiles
 * fetch once between them and always agree on what is pending.
 */
export function useMyPendingSubmissions(companyId?: number | null): PendingSubmission[] {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-submitted-managers"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/users/me/submitted-managers`);
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!user) return [];
  const pending = ((data ?? []) as PendingSubmission[])
    .filter(m => m.approvalStatus === "pending_approval");
  if (companyId == null) return pending;
  return pending.filter(m => m.companyId === companyId);
}

/**
 * The "Your Pending Submissions" strip, identical wherever it appears.
 *
 * <p>One implementation rather than a copy per page. The directory grew this block first and the
 * company profile did not have it at all, so a manager you had just added was listed on one page
 * and missing from the other — the same submission, two answers about whether it existed.
 */
export default function PendingSubmissions({
  submissions,
  /** A rule beneath the strip, when live managers follow it. */
  dividerBelow = false,
  /** Per-tile destination, for surfaces with canonical manager URLs. */
  linkFor,
}: {
  submissions: PendingSubmission[];
  dividerBelow?: boolean;
  linkFor?: (m: PendingSubmission) => string | undefined;
}) {
  if (submissions.length === 0) return null;
  return (
    <div className="mb-8" data-testid="pending-submissions">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        Your Pending Submissions
      </p>
      <div className={TILE_GRID}>
        {submissions.map(boss => (
          <ManagerCard key={`pending-${boss.id}`} boss={boss as any} isPending to={linkFor?.(boss)} />
        ))}
      </div>
      {dividerBelow && <div className="mt-8 border-t border-border" />}
    </div>
  );
}
