import { adjectives, animals } from "unique-names-generator";

/**
 * A stand-in handle for a contribution whose byline is missing, derived from its own id.
 *
 * <h2>Why a card may never say "Anonymous"</h2>
 *
 * REPORTED, 2026-11-26: a company profile showed two opinions side by side, one signed
 * "WiseCrane53" and the next signed "Anonymous employee". That literal is worn by no live
 * contribution, so it marked out exactly the rows whose author was unknown, and every rating
 * written by somebody who had since deleted their account was one of them. A reader could tell
 * which opinion belonged to a deleted account, which is the one fact the erasure exists to remove.
 *
 * The server now writes a minted handle on every path and substitutes one at read time, so a null
 * byline should never arrive here at all. This is the last line of defence: if one does, the card
 * shows a name shaped exactly like its neighbours instead of a label that singles it out.
 *
 * <h2>Why it is derived from the id</h2>
 *
 * A random name would differ on every render, so the same opinion would be signed differently each
 * time the page loaded, which is more obviously invented than the label it replaces. The id is
 * already public, already in the payload, and says nothing about the author.
 *
 * <h2>Why these word lists</h2>
 *
 * The SAME dictionaries `generateUsername()` draws from in `validators.ts`, which is what the
 * signup form offers people, so a name from here is indistinguishable in form from a handle
 * somebody chose. The backend's `Pseudonyms` holds its own list for the names it stores; a third
 * vocabulary invented here is precisely how one surface ends up looking different from the rest.
 */
export function stablePseudonym(seed: string): string {
  const h = hash(seed ?? "");
  const adjective = capitalize(adjectives[h % adjectives.length]);
  // Divided before the second lookup, so the two words do not move together across neighbouring
  // ids - without it, ids one apart would often share an animal and differ only in adjective.
  const animal = capitalize(animals[Math.floor(h / adjectives.length) % animals.length]);
  // 10 to 99, matching generateUsername: a leading zero never appears in a handle people are
  // offered, so a two-digit tail starting at 10 is part of looking ordinary.
  const number = 10 + (Math.floor(h / 7919) % 90);
  return `${adjective}${animal}${number}`;
}

/**
 * FNV-1a, 32-bit. Chosen because it is four lines, has no dependency and is stable forever:
 * the same id must give the same name in every browser and across every deployment, or a reader
 * who returns to a page sees an opinion signed by somebody new.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    // imul, not *: the product overflows 2^53 and plain multiplication silently loses the low
    // bits, which collapses the distribution.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
