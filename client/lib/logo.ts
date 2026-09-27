import { companyLogoDomain } from "@/lib/utils";

/**
 * Company logos, from logo.dev.
 *
 * One place, because the token was written out in five spots across four files. That is fine
 * until you need to change it - and there are two reasons to. It is a publishable key sitting in
 * a public bundle, so anyone can spend the quota; logo.dev answers that with referrer
 * restrictions, which are configured against a key you can actually rotate. And the quota is
 * finite: at 331k of 500k, knowing every request originates here is what makes it measurable.
 *
 * Publishable by design - this is not a secret, and it is meant to ship to the browser. It is
 * still worth having exactly one of.
 */
export const LOGO_DEV_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA";

/** A logo URL for a domain we actually know, e.g. one the picker returned. */
export function logoDevUrlForDomain(domain: string): string {
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}`;
}

/**
 * Brandfetch, the second real provider - used when logo.dev will not serve.
 *
 * PASTE YOUR CLIENT ID HERE. Until it is set, Brandfetch is skipped entirely and the chain
 * behaves exactly as it did before: an empty id is not a broken request, it is one fewer rung.
 * Without it the CDN 302s to their documentation rather than an image, and a wrong one 403s -
 * neither of which should reach an <img>.
 *
 * Publishable, like LOGO_DEV_TOKEN: it ships in this bundle by design. Brandfetch scopes these
 * by referrer, so set that on their dashboard rather than treating the id as a secret.
 */
export const BRANDFETCH_CLIENT_ID = "1idGAWvFIWVaPxuT8Vl";

/** A previously resolved Brandfetch asset, when a caller happens to hold one. Never required. */
export function brandfetchIconUrl(storedIconUrl?: string | null): string | null {
  return storedIconUrl && storedIconUrl.trim() ? storedIconUrl.trim() : null;
}

/**
 * Brandfetch's Logo API - the automatic fallback when logo.dev cannot serve.
 *
 * <p>This is the LOGO API (cdn.brandfetch.io), not the Brand API (api.brandfetch.io). They are
 * different products with different limits: the Brand API is a metered server-side JSON endpoint,
 * while the Logo API is a CDN with a 1M/month fair-use allowance that Brandfetch documents as
 * being embedded directly in an <img> tag. That is exactly what a failover rung is.
 *
 * <p>Built from the SAME domain logo.dev is given, so it works for any company - including a
 * picker suggestion that has never existed in our database. No stored brand id, no resolution,
 * no per-company lookup.
 *
 * <p><b>fallback/404 is deliberate.</b> Brandfetch otherwise answers an unknown brand with a
 * generic image and HTTP 200, which an <img> cannot distinguish from a real logo - the exact
 * trap DuckDuckGo set, where every unrecognised company rendered the same grey placeholder
 * instead of falling through. Asking for 404 makes a miss a real miss, so the chain reaches the
 * letter tile.
 *
 * <p><b>Programmatic requests are refused by design.</b> curl and headless browsers come back
 * 302 with {@code x-bf-error: automated_traffic}, whatever the client id - so this rung can only
 * be verified in a real browser, from a real page, with a Referer. Nothing here is broken when a
 * script says it is.
 */
export function brandfetchLogoUrl(domain: string): string | null {
  if (!BRANDFETCH_CLIENT_ID || !domain) return null;
  return `https://cdn.brandfetch.io/${domain}/w/128/h/128/fallback/404/icon.webp`
       + `?c=${BRANDFETCH_CLIENT_ID}`;
}

/**
 * The company identity carried by anything the API returns.
 *
 * <p>One reader for every shape, because the shapes differ and the call sites do not care: a
 * company row calls them {@code domain} / {@code brandfetchIconUrl}, while a manager row carries
 * the same facts about its employer as {@code companyDomain} / {@code companyBrandfetchIconUrl}.
 *
 * This exists because the alternative was threading two props through every render site by hand,
 * and it was wrong every time - the company tiles got them, then the manager cards, then the
 * locked cards, and the pending-submission cards still rendered blank. Two props that must travel
 * together are one prop.
 */
export interface CompanyIdentity {
  domain?: string | null;
  brandfetchIconUrl?: string | null;
}

export function companyIdentityOf(source: unknown): CompanyIdentity {
  const s = (source ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = s[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  return {
    domain:            pick("domain", "companyDomain"),
    brandfetchIconUrl: pick("brandfetchIconUrl", "companyBrandfetchIconUrl"),
  };
}

/**
 * Every logo URL worth trying for a company, best first.
 *
 * <b>Nothing here is guessed.</b> Logos used to be found by deriving a domain from the company
 * name - "Zehrs Markets" becomes zehrsmarkets.com - and handing that to a provider. Measured
 * across twelve companies, seven guesses were wrong, and the wrong ones that SUCCEEDED were the
 * damaging kind: "Lime" guesses lime.com, a real and unrelated company, so the page served a
 * confident logo for the wrong business.
 *
 * So a provider is only ever given an identity somebody established:
 *
 *   1. an explicit logo stored against the company (an admin chose it);
 *   2. logo.dev, but only with a RESOLVED domain - never a guess;
 *   3. the Brandfetch icon resolved for this company on the server.
 *
 * Running out means the letter tile, which is the honest answer to "we do not know who this is".
 * A missing logo is cosmetic; a confident wrong one is a data-integrity problem.
 *
 * DuckDuckGo used to sit at the bottom. It was removed: it answers 404 with a valid placeholder
 * icon, so the chain could never fall through to the letter, and it happily returns a real icon
 * for a wrong guessed domain.
 */
/**
 * The domain inside a stored logo.dev URL.
 *
 * <p>Not a guess. A stored `img.logo.dev/<domain>` URL was built from a domain somebody
 * established - the company picker, which is Clearbit-backed - so the domain is recoverable
 * from it exactly, and is as trustworthy as the URL itself.
 *
 * <p>This exists because the two halves of a deploy can land apart. The browser bundle shipped
 * with the Brandfetch failover while the API was still serving the older payload with no
 * `domain` field, so every tile had a logo.dev URL that could not be served and nothing to hand
 * Brandfetch - a letter on every company whose domain we had known all along.
 */
export function domainFromLogoDevUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = /^https?:\/\/img\.logo\.dev\/([^/?#]+)/i.exec(url.trim());
  const d = m?.[1] ? decodeURIComponent(m[1]).toLowerCase() : null;
  return d && d.includes(".") ? d : null;
}

export function logoCandidates(
  companyName: string,
  storedUrl?: string | null,
  resolvedDomain?: string | null,
  storedBrandfetchIcon?: string | null,
): string[] {
  const explicit = resolvedDomain && resolvedDomain.trim() ? resolvedDomain.trim().toLowerCase() : null;
  // The resolved domain when we have one; otherwise the one the stored URL was built from.
  const domain = explicit ?? domainFromLogoDevUrl(storedUrl);
  const ordered = [
    storedUrl || null,
    domain ? logoDevUrlForDomain(domain) : null,
    // Brandfetch's Logo API, from the same domain. Generic - no stored anything required.
    domain ? brandfetchLogoUrl(domain) : null,
    // A previously resolved Brandfetch asset, when one happens to exist. Not required.
    brandfetchIconUrl(storedBrandfetchIcon),
  ].filter((u): u is string => !!u);
  return ordered.filter((u, i) => ordered.indexOf(u) === i);
}

/**
 * A logo URL for a company we only know by name.
 *
 * The domain is *guessed* from the name - "Zehrs Markets" becomes zehrsmarkets.com - so for any
 * company whose name is not its domain this request cannot succeed. Callers should treat a
 * failure as expected and fall back to an initial rather than retrying.
 */
export function logoDevUrl(companyName: string): string {
  return logoDevUrlForDomain(companyLogoDomain(companyName));
}
