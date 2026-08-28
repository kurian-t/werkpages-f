import API_BASE from "@/lib/api";
import { inferCountry } from "@/lib/inferCountry";

export interface Geo {
  country: string;        // always populated (falls back to timezone inference)
  state: string | null;   // province/region, when known
  city: string | null;    // captured silently; not shown in the UI yet
}

const CACHE_KEY = "rmm_geo";

/**
 * Resolves the visitor's geo once per browser session. Calls the same-origin
 * `/api/geo` endpoint (backed by Cloudflare visitor-location headers), caches the
 * result in sessionStorage, and falls back to timezone-based country inference when
 * the endpoint is unavailable or returns nothing (e.g. local dev with no Cloudflare).
 */
export async function fetchGeo(): Promise<Geo> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Geo;
  } catch {
    // sessionStorage unavailable (private mode) - just fetch fresh.
  }

  let geo: Geo = { country: "", state: null, city: null };
  try {
    const res = await fetch(`${API_BASE}/api/geo`);
    if (res.ok) {
      const data = await res.json();
      geo = {
        country: typeof data.country === "string" ? data.country : "",
        state: data.state ?? null,
        city: data.city ?? null,
      };
    }
  } catch {
    // Network/offline - fall through to timezone inference below.
  }

  if (!geo.country) geo.country = inferCountry();

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(geo));
  } catch {
    // Non-fatal - we just won't cache this session.
  }
  return geo;
}
