import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import API_BASE from "@/lib/api";
import type { CompanyInterviewStats } from "@/lib/interviews";

/**
 * Query descriptor for a company's interview stats.
 *
 * <p>Role and country are the only parameters. Everything in the response except the comparison chart describes
 * all interviews on record, so narrowing by role never moves the company's headline numbers.
 *
 * <p>Shared rather than duplicated because two callers need it at once: the panel, and the tab
 * strip, which needs only the unfiltered total. With no role applied the two produce the same key,
 * so React Query serves the tab count from the panel's own request instead of issuing a second.
 */
export function companyInterviewsQuery(
  companySlug: string,
  role: string | null = null,
  country: string | null = null,
) {
  return {
    queryKey: ["company-interviews", companySlug, role, country] as const,
    queryFn: async (): Promise<CompanyInterviewStats> => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/interviews`, {
        params: { role: role ?? undefined, country: country ?? undefined },
        withCredentials: true,
      });
      return res.data as CompanyInterviewStats;
    },
    enabled: !!companySlug,
    retry: false,
    // Keep showing the previous slice while a new role loads. Without this the query key change
    // means no cached data, isLoading flips true, and the whole panel is replaced by a skeleton -
    // the first role click looked like the tab reloading.
    placeholderData: (previous: CompanyInterviewStats | undefined) => previous,
  };
}

export function useCompanyInterviews(
  companySlug: string,
  role: string | null = null,
  country: string | null = null,
) {
  return useQuery(companyInterviewsQuery(companySlug, role, country));
}
