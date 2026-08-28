/**
 * Which top-level nav item a URL belongs to.
 *
 * Canonical URLs nest — `/industries/technology/companies/red-hat/managers/jane-doe` — so a naive
 * `pathname.startsWith("/industries")` lights up "Industries" for every company and manager page
 * beneath it. Drilling Companies → a manager would highlight Industries, which reads as the site
 * losing track of where you are.
 *
 * The rule is the deepest entity the URL actually addresses, not its first segment.
 */
export type NavSection = "industries" | "companies" | "managers" | null;

export function activeNavSection(pathname: string): NavSection {
  if (!pathname) return null;
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";

  // Managers, deepest first. /directory is the managers listing; /manager/:id is the legacy
  // profile URL that still resolves and redirects.
  if (path === "/directory" || path.startsWith("/directory/")) return "managers";
  if (path === "/manager" || path.startsWith("/manager/")) return "managers";
  if (path.includes("/managers/")) return "managers";

  if (path === "/companies" || path.startsWith("/companies/")) return "companies";
  if (path.includes("/companies/")) return "companies";

  if (path === "/industries" || path.startsWith("/industries/")) return "industries";

  return null;
}
