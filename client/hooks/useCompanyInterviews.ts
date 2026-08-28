import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import API_BASE from "@/lib/api";
import type { CompanyInterviewStats, InterviewOutcome } from "@/lib/interviews";

/**
 * Query descriptor for a company's interview stats.
 *
 * Shared rather than duplicated because two callers need it at once: the panel, which slices by
 * outcome and role, and the tab strip, which needs only the unfiltered total. With both filters
 * null the two produce the same key, so React Query serves the tab count from the panel's own
 * request instead of issuing a second one.
 */
export function companyInterviewsQuery(
  companySlug: string,
  outcome: InterviewOutcome | null = null,
  role: string | null = null,
) {
  return {
    queryKey: ["company-interviews", companySlug, outcome, role] as const,
    queryFn: async (): Promise<CompanyInterviewStats> => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/interviews`, {
        params: { outcome: outcome ?? undefined, role: role ?? undefined },
        withCredentials: true,
      });
      return res.data as CompanyInterviewStats;
    },
    enabled: !!companySlug,
    retry: false,
  };
}

export function useCompanyInterviews(
  companySlug: string,
  outcome: InterviewOutcome | null = null,
  role: string | null = null,
) {
  return useQuery(companyInterviewsQuery(companySlug, outcome, role));
}
