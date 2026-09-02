/**
 * Is this plausibly a real person's name?
 *
 * A cheap client-side filter, not a security control - the server validates independently. Its
 * job is to stop the obvious junk ("test test", "asdf") before it becomes a manager row, and to
 * tell the person why while they are still looking at the field.
 *
 * There were two copies of this, in CompanyProfile and FindManagerForm, and they had silently
 * diverged: the copy on the company page rejected "Mary Jane" and "Anne-Marie" as "not letters"
 * while /find accepted both, because its character class had been corrupted into one containing
 * literal asterisks and backslashes but neither whitespace nor a hyphen. Two copies of a rule
 * cannot be one rule; this is the rule.
 */

/**
 * Letters, accents, apostrophes, hyphens, spaces.
 *
 * Deliberately permissive about accents and punctuation: names are not ASCII, and rejecting
 * "Ferré" or "O'Brien" or "Anne-Marie" is a worse failure than admitting an odd one.
 */
const NAME_LETTERS_ONLY = /^[a-zA-ZÀ-ÖØ-öø-ÿ'\-\s]+$/;

/** Words that are never somebody's name, checked against either part on its own. */
const FAKE_NAME_PARTS = new Set([
  "test", "fake", "admin", "null", "undefined", "anonymous",
  "unknown", "none", "nope", "asdf", "qwerty", "aaaa", "xxxx", "blah", "lorem", "ipsum",
]);

/** Placeholder names that are only obvious as a pair - "John" and "Doe" are each fine alone. */
const FAKE_FULL_NAMES = new Set([
  "john doe", "jane doe", "john smith", "jane smith",
  "test user", "test manager", "test test",
  "foo bar", "foo foo", "bar baz",
  "first last", "firstname lastname",
]);

/** The problem with this name, or null when there isn't one. */
export function validateManagerName(firstName: string, lastName: string): string | null {
  const f = firstName.trim();
  const l = lastName.trim();

  if (!NAME_LETTERS_ONLY.test(f) || !NAME_LETTERS_ONLY.test(l)) {
    return "Name should only contain letters";
  }

  const fl = f.toLowerCase();
  const ll = l.toLowerCase();
  if (FAKE_NAME_PARTS.has(fl) || FAKE_NAME_PARTS.has(ll)) {
    return "This doesn't appear to be a real person's name";
  }
  if (FAKE_FULL_NAMES.has(`${fl} ${ll}`)) {
    return "This doesn't appear to be a real person's name";
  }

  return null;
}
