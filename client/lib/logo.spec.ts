import { describe, it, expect } from "vitest";
import { logoCandidates, brandfetchIconUrl, brandfetchLogoUrl, domainFromLogoDevUrl, logoDevUrlForDomain, noMonogram } from "./logo";

/**
 * Which logo sources are tried, in what order, and - most importantly - what is NEVER tried.
 *
 * Logos used to come from a domain GUESSED from the company name. Seven of twelve guesses were
 * wrong, and the wrong ones that succeeded were the damaging kind: "Lime" guesses lime.com, a
 * real and unrelated company, so the site rendered a confident logo for the wrong business.
 *
 * DuckDuckGo briefly sat at the bottom of this chain and was removed: it answers 404 with a
 * valid placeholder icon, so nothing could ever fall through to the letter tile, and it returns
 * real icons for wrong guessed domains just as readily.
 *
 * Pure string-building - no network request, by construction.
 */
describe("logoCandidates", () => {
  const DOMAIN = "li.me";
  const ICON   = "https://cdn.brandfetch.io/id7-YBUtLk/w/128/h/128/icon.webp?c=signed";

  it("never guesses a domain from the company name", () => {
    /* The whole bug, in one assertion. With no resolved domain there is nothing to try. */
    expect(logoCandidates("Lime")).toEqual([]);
    expect(logoCandidates("Lime").some((u) => u.includes("lime.com"))).toBe(false);
  });

  it("never falls back to DuckDuckGo", () => {
    const all = [
      ...logoCandidates("Lime"),
      ...logoCandidates("Lime", null, DOMAIN),
      ...logoCandidates("Lime", "https://stored.example/l.png", DOMAIN, ICON),
    ];
    expect(all.some((u) => u.includes("duckduckgo"))).toBe(false);
  });

  it("uses logo.dev with the RESOLVED domain, not the name", () => {
    expect(logoCandidates("Lime", null, DOMAIN)[0]).toBe(logoDevUrlForDomain("li.me"));
  });

  it("falls back to Brandfetch built from the SAME domain", () => {
    /*
      The failover, and the point of it: Brandfetch needs nothing stored about this company.
      A picker suggestion that has never existed in our database still gets a second chance,
      because the URL is derived from the domain logo.dev was given.
    */
    const list = logoCandidates("Lime", null, DOMAIN);
    expect(list[1]).toBe(brandfetchLogoUrl("li.me"));
    expect(list[1]).toContain("fallback/404");
  });

  it("asks Brandfetch to 404 rather than serve a placeholder", () => {
    /*
      Brandfetch answers an unknown brand with a generic image and HTTP 200, which an <img>
      cannot tell from a real logo - the trap DuckDuckGo set, where every unrecognised company
      rendered the same grey mark instead of falling through to its letter.
    */
    expect(brandfetchLogoUrl("nosuchcompany.example")).toContain("/fallback/404/");
  });

  it("keeps logo.dev as the default, with Brandfetch beneath it", () => {
    const list = logoCandidates("Lime", null, DOMAIN, ICON);
    expect(list[0]).toBe(logoDevUrlForDomain("li.me"));
    expect(list.slice(1)).toContain(ICON);
  });

  it("prefers an explicitly stored logo over every provider", () => {
    const stored = "https://stored.example/lime.png";
    expect(logoCandidates("Lime", stored, DOMAIN, ICON)[0]).toBe(stored);
  });

  it("has nothing to try when no domain has been resolved", () => {
    /* No identity means no provider gets a guess - the letter tile is the honest answer. */
    expect(logoCandidates("Lime")).toEqual([]);
  });

  it("normalises the resolved domain rather than trusting its casing", () => {
    expect(logoCandidates("Lime", null, "  LI.ME  ")[0]).toBe(logoDevUrlForDomain("li.me"));
  });

  it("omits a blank stored logo instead of trying to load it", () => {
    expect(logoCandidates("Lime", "", DOMAIN)[0]).toBe(logoDevUrlForDomain("li.me"));
  });

  it("does not repeat a URL", () => {
    const dup = logoDevUrlForDomain("li.me");
    const list = logoCandidates("Lime", dup, DOMAIN);
    expect(new Set(list).size).toBe(list.length);
  });

  it("treats a missing Brandfetch icon as no rung, not an empty string", () => {
    expect(brandfetchIconUrl(null)).toBeNull();
    expect(brandfetchIconUrl("   ")).toBeNull();
    expect(brandfetchIconUrl(ICON)).toBe(ICON);
  });

  it("recovers the domain from a stored logo.dev URL when the API sends none", () => {
    /*
      The two halves of a deploy can land apart. The bundle shipped with the Brandfetch failover
      while the API was still serving the older payload with no `domain` field, so every tile had
      a logo.dev URL that could not be served and nothing to hand Brandfetch - a letter on every
      company whose domain had been known all along.

      Recovered, not guessed: that URL was built from a domain somebody established.
    */
    const stored = "https://img.logo.dev/amazon.com?token=pk_x";
    const list = logoCandidates("Amazon", stored);
    expect(list).toContain(brandfetchLogoUrl("amazon.com"));
  });

  it("an explicit resolved domain still wins over the stored URL", () => {
    const stored = "https://img.logo.dev/wrong.com?token=pk_x";
    const list = logoCandidates("Lime", stored, "li.me");
    expect(list).toContain(brandfetchLogoUrl("li.me"));
    expect(list.some((u) => u.includes("wrong.com") && u.includes("brandfetch"))).toBe(false);
  });

  it("ignores a stored URL that is not a logo.dev one", () => {
    expect(domainFromLogoDevUrl("https://cdn.example/acme.png")).toBeNull();
    expect(domainFromLogoDevUrl(null)).toBeNull();
  });
});

describe("logo.dev must never serve its own monogram", () => {
  /*
    THE BUG THIS EXISTS FOR.

    Two company tiles side by side in the same grid showed two different-looking initials:
    "Homeowners Financial" rendered OUR placeholder - a grey box, our font - and "Invest Alberta"
    rendered logo.dev's - a white box, its font. Both companies had no real logo. The code could
    not tell them apart because logo.dev answers an unknown domain with a GENERATED IMAGE rather
    than an error.

    Measured directly against the API: an unknown domain returns HTTP 202, image/jpeg, 2,558
    bytes. An <img> renders that as a successful load, so the candidate chain stopped there and
    never reached our own initial. With fallback=404 the same request returns 404, the candidate
    is skipped, and one placeholder is used everywhere.

    These assertions are on the URL rather than the network: the suite must never call a metered
    API - a previous run exhausted logo.dev's monthly quota and blanked production logos.
  */
  it("every logo.dev URL this module builds refuses the monogram", () => {
    expect(logoDevUrlForDomain("li.me")).toContain("fallback=404");
    expect(logoDevUrlForDomain("amazon.com")).toContain("fallback=404");
  });

  it("a STORED url built before this existed is normalised on the way out", () => {
    // The stored url is the FIRST candidate tried, so leaving it unguarded defeats the fix for
    // every company whose logo was saved earlier - which is most of them.
    const stored = "https://img.logo.dev/amazon.com?token=pk_x";
    const list = logoCandidates("Amazon", stored);
    expect(list[0]).toBe("https://img.logo.dev/amazon.com?token=pk_x&fallback=404");
    expect(list.every((u) => !u.startsWith("https://img.logo.dev/") || u.includes("fallback=404")))
      .toBe(true);
  });

  it("does not add the parameter twice", () => {
    const already = "https://img.logo.dev/li.me?token=pk_x&fallback=404";
    expect(noMonogram(already)).toBe(already);
    expect(noMonogram(noMonogram(already))).toBe(already);
  });

  it("uses ? when the url has no query, & when it does", () => {
    expect(noMonogram("https://img.logo.dev/li.me")).toBe("https://img.logo.dev/li.me?fallback=404");
    expect(noMonogram("https://img.logo.dev/li.me?token=pk_x"))
      .toBe("https://img.logo.dev/li.me?token=pk_x&fallback=404");
  });

  it("leaves urls from other providers alone", () => {
    // Brandfetch has its own guard already, in its path rather than its query.
    const bf = brandfetchLogoUrl("li.me");
    if (bf) expect(noMonogram(bf)).toBe(bf);
    expect(noMonogram("https://cdn.example/acme.png")).toBe("https://cdn.example/acme.png");
  });

  it("Lime: the real domain is used and the guessed one never renders", () => {
    /*
      The case that proves a guess is not being used. "Lime" guesses lime.com - a real and
      unrelated company - so a test asserting only "an image rendered" passes straight through
      the bug. The assertion has to be on WHICH domain.
    */
    const list = logoCandidates("Lime", null, "li.me");
    expect(list.some((u) => u.includes("li.me"))).toBe(true);
    expect(list.some((u) => u.includes("lime.com"))).toBe(false);
  });
});
