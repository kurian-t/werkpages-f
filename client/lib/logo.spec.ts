import { describe, it, expect } from "vitest";
import { logoCandidates, brandfetchIconUrl, brandfetchLogoUrl, logoDevUrlForDomain } from "./logo";

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
});
