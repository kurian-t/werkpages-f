/**
 * Turning a company selection into the fields a write path receives.
 *
 * Split out of `useCompanySelection` so the rule can be tested directly. It is the part that has
 * been wrong: everything around it is React state plumbing, but this decides what identity and
 * what text a submission carries, and getting it wrong silently discards what somebody typed.
 */

export interface CompanyPayload {
  /** Display text. Always what the user typed. */
  company: string;
  /** Identity, when one could be established. */
  companyId: number | null;
}

/**
 * @param trimmed  the typed name, already trimmed
 * @param id       an already-chosen company, when a suggestion was picked
 * @param create   posts the name and returns the stored row, or throws
 */
export async function resolveCompanyPayload(
  trimmed: string,
  id: number | undefined,
  create: (name: string) => Promise<{ id?: unknown; name?: unknown }>,
): Promise<CompanyPayload> {
  // A picked suggestion is already identity. Nothing to resolve.
  if (id != null) return { company: trimmed, companyId: id };

  // Too short to be a company. Let the server decide what to do with it.
  if (trimmed.length < 2) return { company: trimmed, companyId: null };

  try {
    const row = await create(trimmed);
    if (typeof row?.id === "number") {
      // Deliberately `trimmed`, not `row.name`. Company names are unique case-insensitively, so
      // creating "Central Rock Gym" when "Central rock gym" exists returns the *existing* row
      // under its original casing. Returning that sent an admin's correction straight back to
      // them - the save persisted the value they already had and the page did not change.
      return { company: trimmed, companyId: row.id };
    }
  } catch {
    // Falls through. Losing a submission because a company row could not be written would be
    // worse than resolving the name server-side the old way.
  }

  return { company: trimmed, companyId: null };
}
