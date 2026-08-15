import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Strips common corporate suffixes so "Lemonade Inc" → "lemonade.com" rather than "lemonadeinc.com".
const CORP_SUFFIX_RE = /[\s,]+(?:inc\.?|incorporated|corp\.?|corporation|llc\.?|ltd\.?|limited|co\.?|plc\.?|lp\.?|l\.p\.|l\.l\.c\.|companies|company|group|holdings|enterprises|international|worldwide)\.?$/i;

export function companyLogoDomain(company: string): string {
  let cleaned = company.trim();
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(CORP_SUFFIX_RE, "").trim();
  } while (cleaned !== prev);
  const lower = cleaned.toLowerCase();
  // If the name already looks like a domain (e.g. "Priceline.com"), return it directly
  if (/^[a-z0-9][a-z0-9-]*\.[a-z]{2,}(\.[a-z]{2,})?$/.test(lower)) {
    return lower;
  }
  return lower.replace(/\s+/g, "").replace(/[^a-z0-9]/g, "") + ".com";
}

// Job title abbreviations that should stay fully uppercase.
const TITLE_ABBREVIATIONS = new Set([
  "CEO","CFO","CTO","COO","CMO","CPO","CRO","CCO","CHRO","CLO","CSO","CDO","CIO",
  "VP","EVP","SVP","AVP","DVP",
  "HR","IT","AI","ML","PM","QA","UX","UI","BD","PR","IR","MD","JD","CPA","MBA",
  "SRE","HRBP","GTM","B2B","B2C",
]);

/** Capitalises a person's name: "AL VALADO" → "Al Valado", handles hyphenated names. */
export function toNameCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(?:^|[\s-])[a-z]/g, c => c.toUpperCase());
}

/**
 * Title-cases a job title, keeping known abbreviations uppercase.
 * "ceo" → "CEO", "chief executive officer" → "Chief Executive Officer",
 * "vp engineering" → "VP Engineering"
 */
export function toJobTitleCase(title: string): string {
  return title
    .trim()
    .split(/\s+/)
    .map(word => {
      const upper = word.toUpperCase();
      if (TITLE_ABBREVIATIONS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function getRelativeTime(dateString?: string): string {
  if (!dateString) return "Unknown";

  try {
    const date = new Date(dateString);

    // Validate that date is a valid Date object
    if (isNaN(date.getTime())) {
      return "Unknown";
    }

    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    // Handle cases where the timestamp might be in the future (should never happen but let's be safe)
    if (seconds < 0) {
      return "just now";
    }

    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

    const hours = Math.floor(seconds / 3600);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

    const days = Math.floor(seconds / 86400);
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

    const weeks = Math.floor(seconds / 604800);
    if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;

    const months = Math.floor(seconds / 2592000);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;

    const years = Math.floor(seconds / 31536000);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  } catch {
    return "Unknown";
  }
}
