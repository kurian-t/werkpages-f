import { validateProfileUrl, validateManagerNamePart } from "@/lib/validators";

/**
 * Whether step 1 of the Add Manager form may be left, and why not.
 *
 * <h2>Why this is a module and not four booleans inside the page</h2>
 *
 * <p>It used to be inline, and it shipped a bug that lost a real submission. The country
 * {@code <select>} was replaced by the shared location control, which left {@code formData.country}
 * set from exactly one source - {@code /api/geo}, a Cloudflare header. The gate still demanded it.
 * So for any visitor that header does not reach - a stripping proxy, a VPN, a privacy browser -
 * Next stayed disabled and the form asked for a country through a control that no longer existed.
 * The submit path guards on the same value and <b>returns silently</b>, so a completed form did
 * nothing at all, with no error to explain it.
 *
 * <p>Three thousand browser tests did not catch it, because every one of them mocks {@code /api/geo}
 * with a country present. The condition was unreachable in the harness and ordinary in the world.
 *
 * <p>A rule about which fields are required is arithmetic, not interaction. As a function it can
 * be asked "what happens when the country is unknown" in a millisecond, without a browser, a
 * fixture, a draft in localStorage or a mocked endpoint to get in the way.
 */
export interface Step1Fields {
  firstName: string;
  lastName: string;
  title: string;
  /** The company as SELECTED, not as typed - the picker owns that distinction. */
  companyName: string;
  linkedinUrl?: string;
}

/**
 * Everything wrong with step 1, in the order a reader meets the fields.
 *
 * <p><b>The country is deliberately absent.</b> There is no country control on this form; the
 * country arrives attached to whatever location is chosen, and a location is not required either.
 * Nothing here may demand a value the reader has no way to supply - that is the whole bug.
 */
export function step1Errors(fields: Step1Fields): string[] {
  const errors: string[] = [];
  /*
    The manager's name is validated properly, not merely for emptiness.

    RateMyManagers already rejected single letters, digits and symbols here and Werkpages did not,
    which is drift rather than intent: it is the same question about the same kind of person. The
    strict rule is the right one - these names are published - so it is shared.
  */
  const firstName = validateManagerNamePart(fields.firstName, "First name");
  if (!firstName.valid) errors.push(firstName.error!);
  const lastName = validateManagerNamePart(fields.lastName, "Last name");
  if (!lastName.valid) errors.push(lastName.error!);
  if (!fields.title.trim())                errors.push("Title is required");

  const company = fields.companyName.trim();
  if (company.length === 0)                errors.push("Company is required");
  else if (company.length < 2)             errors.push("Company must be at least 2 characters");

  if (fields.linkedinUrl) {
    const checked = validateProfileUrl(fields.linkedinUrl);
    if (!checked.valid) errors.push(checked.error!);
  }
  return errors;
}

/** Whether step 1 may be left. The same rule as {@link step1Errors}, so they cannot disagree. */
export function isStep1Valid(fields: Step1Fields): boolean {
  return step1Errors(fields).length === 0;
}
