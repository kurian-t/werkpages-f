#!/usr/bin/env python3
"""
Generates:
  scripts/schema_changes.sql  — DDL: manager_sources table + career_history additions
  scripts/seed_managers.sql   — Self-contained seed for ratemymanagers

Rules:
  - One career_history row per (manager, company) — deduped from multiple filings
  - Best start year = modal year across filings, preferring def14a_month over def14a_year
  - Years before 1970 discarded as scraping noise (birth years etc.)
  - end_date = NULL for all (current/active)
  - Only managers with at least one datable role are imported
"""

import os, re, subprocess, sys
from collections import Counter
from datetime import date

DB_ARGS = ["psql", "-h", "localhost", "-U", "postgres", "-d", "data",
           "--no-psqlrc", "-t", "-A", "-F", "\x1f"]
DB_ENV  = {**os.environ, "PGPASSWORD": "postgres"}
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

MIN_YEAR = 1970  # discard years before this as likely noise


def _capitalize_name_word(word: str) -> str:
    if not word:
        return word
    if '-' in word:
        return '-'.join(_capitalize_name_word(p) for p in word.split('-'))
    ap = word.find("'")
    if 0 < ap < len(word) - 1:
        before, after = word[:ap], word[ap + 1:]
        return (before[0].upper() + before[1:].lower() + "'" +
                after[0].upper() + after[1:].lower())
    return word[0].upper() + word[1:].lower()


def to_proper_name_case(name: str) -> str:
    """'TIM COOK' / 'tIM cOOk' → 'Tim Cook'. Handles hyphens and apostrophes."""
    if not name:
        return name
    return ' '.join(_capitalize_name_word(w) for w in name.strip().split())


def db_query(sql):
    r = subprocess.run(DB_ARGS + ["-c", sql], capture_output=True, text=True, env=DB_ENV)
    if r.returncode != 0:
        print(f"DB ERROR: {r.stderr.strip()}", file=sys.stderr)
        return []
    return [l.split("\x1f") for l in r.stdout.strip().split("\n") if l.strip()]


# ── Job title cleaning ─────────────────────────────────────────────────────────

_JUNK_CUTS = [
    re.compile(r'\s*\$[\s\d,\.]+.*$'),
    re.compile(r'\s+\d{1,3}(?:,\d{3})+.*$'),
    re.compile(r'\s+\*.*$'),
    re.compile(r'\s+\(\d+\).*$'),
    re.compile(r'\s+\d+x\s.*$'),
    re.compile(r',?\s+(?:Mr|Ms|Mrs|Dr)\.?\s+[A-Z][a-z].*$'),
    re.compile(r'\s*[•■●].*$'),
    re.compile(r',\s+(?:is|will|informed|having)\s+.*$', re.IGNORECASE),
    re.compile(r'\s+[A-Z]{2,5}-\d+.*$'),
    re.compile(r',?\s+(?:P\.O\.|Suite|Floor|DEP)\s*[-\d].*$'),
    re.compile(r'\s+(?:Age:|Since)\s+\d+.*$', re.IGNORECASE),
    re.compile(r'\s+\d{4}\s*[-–]\s*(?:present|\d{4}).*$', re.IGNORECASE),
]

def clean_title(raw: str) -> str:
    t = raw.strip()
    for pat in _JUNK_CUTS:
        t = pat.sub('', t)
    if len(t) > 120:
        t = t[:120].rsplit(' ', 1)[0]
    t = re.sub(r'[\s,;•■●\-–—/\\|]+$', '', t).strip()
    if len(t) < 2 or re.search(r'\d{5,}', t):
        return ''
    return t


def accession_no(url: str):
    m = re.search(r'/edgar/data/\d+/(\d{18})/', url)
    if not m:
        return None
    raw = m.group(1)
    return f"{raw[:10]}-{raw[10:12]}-{raw[12:]}"


def q(v) -> str:
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


# ── Deduplication: best role per (manager_id, company_name) ───────────────────

def best_role(rows: list[dict]) -> dict | None:
    """
    Given all scraped rows for one (manager, company), return the single best one.

    Selection logic:
      1. Discard rows with role_start_year < MIN_YEAR
      2. Find the modal year (most frequent), with def14a_month rows weighted x2
      3. Among rows with that year, prefer def14a_month source
      4. Pick the most recent title (from the latest filing = lowest source_url sort
         as a proxy, or just first def14a_month row)
    """
    # Discard noise years
    valid = [r for r in rows if r['year'] and int(r['year']) >= MIN_YEAR]
    if not valid:
        return None

    # Weighted modal year: month sources count double
    year_weights: Counter = Counter()
    for r in valid:
        yr = int(r['year'])
        w = 2 if r['source'] == 'def14a_month' else 1
        year_weights[yr] += w

    best_year = year_weights.most_common(1)[0][0]

    # Among rows with best_year, prefer month-precise then any
    candidates = [r for r in valid if int(r['year']) == best_year]
    month_first = [r for r in candidates if r['source'] == 'def14a_month']
    chosen = (month_first or candidates)[0]

    # Pick cleanest title from all rows at this company (prefer month-source)
    all_titles = [(clean_title(r['title']) or r['title'][:120], r['source']) for r in valid]
    month_titles = [(t, s) for t, s in all_titles if s == 'def14a_month' and len(t) >= 2]
    title = (month_titles or all_titles)[0][0]

    return {
        'person_id':    chosen['person_id'],
        'company':      chosen['company'],
        'title':        title,
        'start_date':   chosen['start_date'],
        'date_source':  chosen['source'],
        'source_url':   chosen['url'],
        'year':         best_year,
    }


def main():
    print("Reading from data DB...")

    # 1. Unique source URLs
    src_rows = db_query("""
        SELECT DISTINCT source_url, source_type, filing_type, date_collected,
               ROUND(AVG(confidence_score)::numeric, 2), country
        FROM manager_roles
        WHERE role_start_date IS NOT NULL AND source_url IS NOT NULL
        GROUP BY source_url, source_type, filing_type, date_collected, country
        ORDER BY source_url
    """)
    print(f"  {len(src_rows)} unique source documents")
    url_to_id = {row[0]: idx + 1 for idx, row in enumerate(src_rows)}

    # 2. All managers with at least one datable role
    mgr_rows = db_query("""
        SELECT DISTINCT m.id, m.person_id, m.first_name, m.last_name
        FROM managers m
        JOIN manager_roles mr ON mr.manager_id = m.id
        WHERE mr.role_start_date IS NOT NULL
        ORDER BY m.id
    """)
    print(f"  {len(mgr_rows)} managers to import")
    data_id_to_person_id = {row[0]: row[1] for row in mgr_rows}

    # 3. All datable roles
    role_rows = db_query("""
        SELECT mr.manager_id, m.person_id, mr.company_name, mr.job_title,
               mr.role_start_date, mr.role_start_year, mr.start_date_source, mr.source_url
        FROM manager_roles mr
        JOIN managers m ON m.id = mr.manager_id
        WHERE mr.role_start_date IS NOT NULL AND mr.source_url IS NOT NULL
        ORDER BY mr.manager_id, mr.company_name
    """)
    print(f"  {len(role_rows)} total role rows before dedup")

    # 4. Group by (manager_id, company) and deduplicate
    groups: dict[tuple, list] = {}
    for row in role_rows:
        mid, pid, company, title, start_date, year, source, url = row
        key = (mid, company.strip().upper())  # case-insensitive company grouping
        groups.setdefault(key, []).append({
            'person_id':  pid,
            'company':    company.strip(),
            'title':      title,
            'start_date': start_date,
            'year':       year,
            'source':     source,
            'url':        url,
        })

    deduped_roles: list[dict] = []
    discarded_noise = 0
    for key, rows in groups.items():
        result = best_role(rows)
        if result:
            deduped_roles.append(result)
        else:
            discarded_noise += 1

    print(f"  {len(deduped_roles)} roles after dedup (discarded {discarded_noise} noise-only groups)")

    # Primary role per manager for managers table (most roles, latest year)
    mgr_primary: dict[str, dict] = {}  # person_id -> role dict
    for role in sorted(deduped_roles, key=lambda r: r['year'], reverse=True):
        pid = role['person_id']
        if pid not in mgr_primary:
            mgr_primary[pid] = role

    # ── schema_changes.sql ────────────────────────────────────────────────────
    schema_path = os.path.join(SCRIPTS_DIR, "schema_changes.sql")
    with open(schema_path, "w") as f:
        f.write(f"""\
-- Schema changes for ratemymanagers
-- Run BEFORE seed_managers.sql
-- Generated {date.today()}

BEGIN;

-- Provenance table: one row per unique DEF14A source document
CREATE TABLE IF NOT EXISTS manager_sources (
    id               BIGSERIAL    PRIMARY KEY,
    source_type      VARCHAR(50)  NOT NULL DEFAULT 'filing',
    filing_type      VARCHAR(20),
    source_url       TEXT         NOT NULL UNIQUE,
    accession_no     VARCHAR(25),
    date_collected   DATE         NOT NULL,
    confidence_score NUMERIC(3,2),
    country          VARCHAR(5)   DEFAULT 'US',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manager_sources_accession
    ON manager_sources(accession_no);

-- Link each career_history row to its source document
ALTER TABLE career_history
    ADD COLUMN IF NOT EXISTS source_id   BIGINT
        REFERENCES manager_sources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS date_source VARCHAR(20)
        NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_career_history_source_id
    ON career_history(source_id);

COMMIT;
""")
    print(f"\nWritten: {schema_path}")

    # ── seed_managers.sql ─────────────────────────────────────────────────────
    seed_path = os.path.join(SCRIPTS_DIR, "seed_managers.sql")

    with open(seed_path, "w") as f:
        f.write(f"""\
-- Seed: managers from DEF14A scrape
-- Run schema_changes.sql first, then this file
-- Generated {date.today()}
--
-- Stats:
--   Source documents : {len(src_rows)}
--   Managers         : {len(mgr_primary)}
--   Career history   : {len(deduped_roles)} rows (one per manager per company, deduped)

BEGIN;

""")

        # ── manager_sources ───────────────────────────────────────────────────
        f.write("-- ── manager_sources ────────────────────────────────────────────────────\n")
        f.write("INSERT INTO manager_sources\n")
        f.write("    (id, source_type, filing_type, source_url, accession_no,\n")
        f.write("     date_collected, confidence_score, country)\nVALUES\n")

        src_vals = []
        for row in src_rows:
            url, src_type, filing_type, date_coll, conf, country = row
            sid  = url_to_id[url]
            acc  = accession_no(url)
            conf = q(conf) if conf else 'NULL'
            src_vals.append(
                f"  ({sid}, {q(src_type)}, {q(filing_type)}, {q(url)},\n"
                f"   {q(acc)}, {q(date_coll)}, {conf}, {q(country or 'US')})"
            )
        f.write(",\n".join(src_vals))
        f.write("\nON CONFLICT (source_url) DO NOTHING;\n\n")
        f.write(f"SELECT setval('manager_sources_id_seq', {len(src_rows)}, true);\n\n")

        # ── managers ─────────────────────────────────────────────────────────
        f.write("-- ── managers ───────────────────────────────────────────────────────────\n")
        f.write("INSERT INTO managers\n")
        f.write("    (external_id, name, company, title, status, approval_status, reviews_count)\nVALUES\n")

        imported_pids: set[str] = set()
        pid_to_external_id: dict[str, str] = {}
        mgr_vals = []
        ext_counter = 1
        for row in mgr_rows:
            data_id, person_id, first, last = row
            if person_id not in mgr_primary:
                continue
            primary = mgr_primary[person_id]
            external_id = f"DEF14A_{ext_counter}"
            ext_counter += 1
            mgr_vals.append(
                f"  ({q(external_id)}, {q(to_proper_name_case(first + ' ' + last))},\n"
                f"   {q(primary['company'])}, {q(primary['title'])},\n"
                f"   'active', 'approved', 0)"
            )
            imported_pids.add(person_id)
            pid_to_external_id[person_id] = external_id

        f.write(",\n".join(mgr_vals))
        f.write("\nON CONFLICT (external_id) DO NOTHING;\n\n")

        # ── career_history ────────────────────────────────────────────────────
        f.write("-- ── career_history ─────────────────────────────────────────────────────\n")
        f.write("-- Joins via external_id (DEF14A_{n}) and source_url to avoid hardcoding IDs\n")
        f.write("INSERT INTO career_history\n")
        f.write("    (manager_id, company, title, start_date, end_date, source_id, date_source)\n")
        f.write("SELECT m.id, v.company, v.title,\n")
        f.write("       v.start_date::timestamptz, NULL, ms.id, v.date_source\n")
        f.write("FROM (VALUES\n")

        ch_vals = []
        for role in deduped_roles:
            pid = role['person_id']
            if pid not in imported_pids:
                continue
            if role['source_url'] not in url_to_id:
                continue
            ext_id = pid_to_external_id[pid]
            ch_vals.append(
                f"  ({q(ext_id)}, {q(role['company'])}, {q(role['title'])},\n"
                f"   {q(role['start_date'])}, {q(role['source_url'])}, {q(role['date_source'])})"
            )

        f.write(",\n".join(ch_vals))
        f.write("""
) AS v(external_id, company, title, start_date, source_url, date_source)
JOIN managers m        ON m.external_id  = v.external_id
JOIN manager_sources ms ON ms.source_url = v.source_url
ON CONFLICT DO NOTHING;

COMMIT;
""")

    print(f"Written: {seed_path}")
    print(f"\nSummary:")
    print(f"  manager_sources rows : {len(src_rows)}")
    print(f"  managers rows        : {len(imported_pids)}")
    print(f"  career_history rows  : {len(ch_vals)}")
    print(f"  Noise groups dropped : {discarded_noise}")
    print(f"\nTo run locally:")
    print(f"  PGPASSWORD=postgres psql -h localhost -U postgres -d ratemymanagers -f scripts/schema_changes.sql")
    print(f"  PGPASSWORD=postgres psql -h localhost -U postgres -d ratemymanagers -f scripts/seed_managers.sql")


if __name__ == "__main__":
    main()
