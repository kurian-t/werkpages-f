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
 * A logo URL for a company we only know by name.
 *
 * The domain is *guessed* from the name - "Zehrs Markets" becomes zehrsmarkets.com - so for any
 * company whose name is not its domain this request cannot succeed. Callers should treat a
 * failure as expected and fall back to an initial rather than retrying.
 */
export function logoDevUrl(companyName: string): string {
  return logoDevUrlForDomain(companyLogoDomain(companyName));
}
