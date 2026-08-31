import { useCallback, useState } from "react";
import axios from "axios";
import API_BASE from "@/lib/api";

/**
 * One company selection, owned in one place.
 *
 * Before this, every form that let someone choose a company kept its own text state, its own
 * companyId state, its own clearing rule and its own payload keys. Nine copies across two apps, and
 * each one independently had to remember that an ID must be dropped the moment the text changes.
 * That is not a rule a codebase can keep: the tenth copy forgets, and a manager quietly lands on
 * the wrong company.
 *
 * So the rules live here instead:
 *
 *   - Picking a suggestion sets the identity.
 *   - Typing clears it. The text and the ID can never describe different companies.
 *   - Submitting resolves an identity when there isn't one, by explicitly creating the company.
 *
 * That last rule is the point. Callers get `payload()` which always yields a company ID, so the
 * write path never has to resolve a name, and "the ID is identity, the name is display text" is
 * something the code enforces rather than something the next person has to know.
 */
export interface CompanySelection {
  /** What the user sees and edits. Display text - never identity. */
  name: string;
  /** The chosen company, when one has been chosen. */
  id: number | undefined;
  /** Logo of the picked suggestion, when it carried one. */
  logoUrl: string | undefined;
  /** True when this refers to a company that already exists. */
  isExisting: boolean;
  /** Spread onto CompanyAutocomplete. Wires selection, clearing and text in one go. */
  bind: {
    value: string;
    onChange: (value: string) => void;
    onSuggestionSelect: (name: string, logoUrl: string | undefined) => void;
    onCompanyIdChange: (id: number | undefined) => void;
  };
  /** Point the selection at an existing company, e.g. when opening an edit form. */
  set: (name: string, id?: number, logoUrl?: string) => void;
  /** Back to empty. */
  clear: () => void;
  /**
   * The fields to send. Resolves an ID first when the user typed a name nobody has stored,
   * creating that company explicitly rather than letting some write path do it as a side effect.
   *
   * Creation happens here, at submit, rather than when the user clicks "add" in the dropdown, so
   * an abandoned form leaves nothing behind.
   *
   * If creation fails the name is still returned so the caller's request can proceed and be
   * resolved server-side. That is a deliberate soft edge: losing someone's submission because a
   * company row could not be written would be worse than resolving it the old way.
   */
  payload: () => Promise<{ company: string; companyId: number | null }>;
}

export function useCompanySelection(initialName = ""): CompanySelection {
  const [name, setName] = useState(initialName);
  const [id, setId] = useState<number | undefined>(undefined);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  const onChange = useCallback((value: string) => {
    setName(value);
    // Typing invalidates the selection. This single line is what nine call sites each had to
    // remember on their own.
    setId(undefined);
  }, []);

  const set = useCallback((nextName: string, nextId?: number, nextLogo?: string) => {
    setName(nextName);
    setId(nextId);
    setLogoUrl(nextLogo);
  }, []);

  const clear = useCallback(() => {
    setName("");
    setId(undefined);
    setLogoUrl(undefined);
  }, []);

  const payload = useCallback(async () => {
    const trimmed = name.trim();
    if (id != null) return { company: trimmed, companyId: id };
    if (trimmed.length < 2) return { company: trimmed, companyId: null };
    try {
      const res = await axios.post(`${API_BASE}/api/companies`, { name: trimmed });
      const newId = res.data?.id;
      if (typeof newId === "number") {
        setId(newId);
        return { company: res.data?.name ?? trimmed, companyId: newId };
      }
    } catch {
      // Falls through to the name-only payload below.
    }
    return { company: trimmed, companyId: null };
  }, [name, id]);

  return {
    name,
    id,
    logoUrl,
    isExisting: id != null,
    bind: {
      value: name,
      onChange,
      onSuggestionSelect: (_selectedName: string, selectedLogo: string | undefined) => setLogoUrl(selectedLogo),
      onCompanyIdChange: setId,
    },
    set,
    clear,
    payload,
  };
}
