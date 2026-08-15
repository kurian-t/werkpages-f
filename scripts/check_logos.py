#!/usr/bin/env python3
"""
Populates company_logo_url for DEF14A-seeded managers in ratemymanagers.

For each seeded manager (external_id LIKE 'DEF14A_%') whose company_logo_url
is NULL, constructs the logo.dev domain, makes a HEAD request with
?fallback=404, and writes the URL back if a real logo exists (HTTP 200).

Run after seed_managers.sql has been applied:
  python3 scripts/check_logos.py
"""

import os, re, subprocess, sys, time
import requests

LOGO_DEV_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA"
LOGO_DEV_BASE  = "https://img.logo.dev"

DB_ARGS = ["psql", "-h", "localhost", "-U", "postgres", "-d", "ratemymanagers",
           "--no-psqlrc", "-t", "-A", "-F", "\t"]
DB_ENV  = {**os.environ, "PGPASSWORD": "postgres"}

HEADERS = {"User-Agent": "RateMyManager logo-check/1.0 kuriant@protonmail.com"}
REQUEST_DELAY   = 0.15   # stay well within logo.dev rate limits
REQUEST_TIMEOUT = 10

CORP_SUFFIX_RE = re.compile(
    r"[\s,]+(?:inc\.?|incorporated|corp\.?|corporation|llc\.?|ltd\.?|limited|"
    r"co\.?|plc\.?|lp\.?|l\.p\.|l\.l\.c\.|companies|company|group|holdings|"
    r"enterprises|international|worldwide)\.?$",
    re.IGNORECASE,
)


def company_logo_domain(company: str) -> str:
    cleaned = company.strip()
    while True:
        stripped = CORP_SUFFIX_RE.sub("", cleaned).strip()
        if stripped == cleaned:
            break
        cleaned = stripped
    return re.sub(r"[^a-z0-9]", "", cleaned.lower().replace(" ", "")) + ".com"


def db_query(sql: str):
    r = subprocess.run(DB_ARGS + ["-c", sql], capture_output=True, text=True, env=DB_ENV)
    if r.returncode != 0:
        print(f"DB ERROR: {r.stderr.strip()}", file=sys.stderr)
        return []
    return [l.split("\t") for l in r.stdout.strip().split("\n") if l.strip()]


def db_exec(sql: str) -> bool:
    r = subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "ratemymanagers",
         "--no-psqlrc", "-c", sql],
        capture_output=True, text=True, env=DB_ENV,
    )
    return r.returncode == 0


def logo_exists(domain: str) -> bool:
    url = f"{LOGO_DEV_BASE}/{domain}?token={LOGO_DEV_TOKEN}&fallback=404"
    try:
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=True, stream=True)
        r.close()
        return r.status_code == 200
    except Exception:
        return False


def main():
    rows = db_query("""
        SELECT id, company
        FROM managers
        WHERE external_id LIKE 'DEF14A_%'
          AND company_logo_url IS NULL
        ORDER BY company
    """)

    if not rows:
        print("Nothing to do — all seeded managers already have logo URLs checked.")
        return

    print(f"{len(rows)} seeded managers to check...")

    # Deduplicate by domain so we only hit logo.dev once per unique company domain
    domain_result: dict[str, bool] = {}
    checked = 0
    found   = 0
    updated = 0

    for i, (mgr_id, company) in enumerate(rows, 1):
        domain = company_logo_domain(company)

        if domain not in domain_result:
            exists = logo_exists(domain)
            domain_result[domain] = exists
            checked += 1
            time.sleep(REQUEST_DELAY)
            if i % 100 == 0:
                print(f"  [{i}/{len(rows)}] checked {checked} unique domains | {found} logos found so far")

        if domain_result[domain]:
            logo_url = f"{LOGO_DEV_BASE}/{domain}?token={LOGO_DEV_TOKEN}"
            sql = f"UPDATE managers SET company_logo_url = '{logo_url}' WHERE id = {mgr_id};"
            if db_exec(sql):
                found  += 1
                updated += 1

    print(f"\nDone.")
    print(f"  Unique domains checked : {checked}")
    print(f"  Real logos found       : {found}")
    print(f"  Managers updated       : {updated}")
    print(f"  No logo (stays NULL)   : {len(rows) - updated}")


if __name__ == "__main__":
    main()
