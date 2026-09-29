import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Every internal destination in the app must be a route the app actually serves.
 *
 * <p>Reported from production: a brand-new account finished signing up and landed on a 404.
 * `AuthCallback` sent people to `/explore`, which is a Werkpages page - RateMyManagers has no such
 * route and never did. The same purpose lived at `/find` here and `/explore` there, so a
 * destination copied between the two products pointed at nothing.
 *
 * <p>Nothing caught it because every piece was individually valid: the redirect was a string, the
 * route table was correct, and no test navigated the whole way through sign-in. It surfaced when a
 * real person hit it.
 *
 * <p>This reads the route table and every hard-coded path in the source, and fails when one names
 * a destination the other does not have. It is a lint, deliberately - it needs no browser, makes
 * no request, and runs in milliseconds.
 */

const CLIENT = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : walk(full);
    return /\.tsx?$/.test(entry) && !/\.(spec|test)\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Paths the router serves, including the ones it only redirects. */
function declaredRoutes(): Set<string> {
  const app = readFileSync(join(CLIENT, "App.tsx"), "utf8");
  const routes = new Set<string>();
  for (const m of app.matchAll(/path="([^"]+)"/g)) routes.add(m[1]);
  return routes;
}

/**
 * A declared route matches a destination when it is identical, or when it is the same shape with
 * its parameters filled in - `/manager/:id` serves `/manager/6`.
 */
function isServed(dest: string, routes: Set<string>): boolean {
  if (routes.has(dest)) return true;
  if (routes.has("*")) {
    // A catch-all exists, but it renders NotFound - so it is not "served" for this purpose.
  }
  const parts = dest.split("/").filter(Boolean);
  for (const route of routes) {
    const rp = route.split("/").filter(Boolean);
    if (rp.length !== parts.length) continue;
    if (rp.every((seg, i) => seg.startsWith(":") || seg === parts[i])) return true;
  }
  return false;
}

describe("Every internal destination is a route this app serves", () => {
  const routes = declaredRoutes();

  it("the route table was read", () => {
    expect(routes.size).toBeGreaterThan(5);
  });

  it("no redirect or link points at a path that does not exist", () => {
    /*
      Only literal, unparameterised paths. A destination built at runtime - `/manager/${id}` -
      cannot be checked this way and is left to the tests that exercise those flows.
    */
    const broken: string[] = [];

    for (const file of walk(CLIENT)) {
      if (file.endsWith("App.tsx")) continue;          // the table itself
      const src = readFileSync(file, "utf8");

      /*
        Every internal path LITERAL, however it is written.

        An earlier version matched only `to=` / `navigate(` / `href=` and missed the line that
        actually shipped the bug:

            const returnTo = sessionStorage.getItem("oauth_return_to") || "/explore";

        A destination is a destination wherever it appears, so this matches the string itself and
        filters out the things that merely look like one.
      */
      const destinations: string[] = [];
      for (const line of src.split("\n")) {
        /*
          A path is a DESTINATION only if the line navigates with it. Paths are also used as
          fragments - prefix lists, startsWith guards, string building - and those are not places
          anybody lands:

              const NOINDEX_PREFIXES = ["/admin", "/auth", ...];
              if (path === "/manager" || path.startsWith("/manager/")) ...

          So the line is filtered first, then every path literal on it is taken. That keeps what
          shipped the bug, which no narrower pattern matched:

              const returnTo = sessionStorage.getItem("oauth_return_to") || "/explore";
        */
        if (/startsWith|endsWith|includes|indexOf|replace|match|PREFIX|SUFFIX/i.test(line)) continue;
        if (!/navigate|Navigate|\bto=|href=|returnTo|redirect|window\.location/i.test(line)) continue;

        for (const m of line.matchAll(/["'`](\/[A-Za-z0-9\-_/]*)["'`]/g)) {
          const d = m[1];
          if (d === "/" || d.startsWith("/api/") || d.startsWith("/assets/")) continue;
          destinations.push(d);
        }
      }

      for (const dest of new Set(destinations)) {
        if (dest === "/" || dest.includes("${")) continue;
        if (!isServed(dest, routes)) {
          broken.push(`${file.replace(CLIENT, "client")} -> ${dest}`);
        }
      }
    }

    expect(
      broken,
      "these destinations are not routes this app serves:\n" + broken.join("\n"),
    ).toHaveLength(0);
  });

  it("does not point at the other product's page", () => {
    /*
      Named explicitly because this is the one that shipped. /explore is Werkpages; a destination
      here must never be a page only the other product has.
    */
    const offenders: string[] = [];
    for (const file of walk(CLIENT)) {
      const src = readFileSync(file, "utf8");
      if (/["']\/explore["']/.test(src) && !routes.has("/explore")) {
        offenders.push(file.replace(CLIENT, "client"));
      }
    }
    expect(offenders, "reference a route this product does not have").toHaveLength(0);
  });
});
