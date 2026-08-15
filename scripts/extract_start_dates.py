#!/usr/bin/env python3
"""
Parse DEF 14A filings from SEC EDGAR to extract role start years/dates
for each manager in the data.manager_roles table.

Strategy:
  1. Fetch each unique source_url (DEF14A HTML filing)
  2. Strip HTML, extract plain text
  3. For each manager in that filing, find a window of text near their name
  4. Apply regex patterns to find "since YYYY", "in YYYY", "appointed YYYY" etc.
  5. Write role_start_year + role_start_date back to manager_roles

SEC EDGAR rate limit: max 10 requests/second. We use 0.12s delay to be safe.
"""

import os
import re
import subprocess
import time
import json
import sys
from datetime import date
from html.parser import HTMLParser

import requests

# ── Config ─────────────────────────────────────────────────────────────────────
DB_ARGS = [
    "psql", "-h", "localhost", "-U", "postgres", "-d", "data",
    "--no-psqlrc", "-t", "-A", "-F", "\t"
]
DB_ENV = {**os.environ, "PGPASSWORD": "postgres"}

HEADERS = {
    "User-Agent": "RateMyManager research/1.0 kuriant@protonmail.com",
    "Accept-Encoding": "gzip, deflate",
}
REQUEST_DELAY = 0.12  # seconds between requests (< 10 req/s for EDGAR)
REQUEST_TIMEOUT = 30

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9,
    "oct": 10, "nov": 11, "dec": 12,
}

# ── Patterns (ordered most-specific first) ─────────────────────────────────────
# Each yields (month_or_none, year)
DATE_PATTERNS = [
    # "since January 2019" / "since January, 2019"
    re.compile(
        r'\bsince\s+(january|february|march|april|may|june|july|august|'
        r'september|october|november|december|jan|feb|mar|apr|jun|jul|aug|'
        r'sep|sept|oct|nov|dec)\.?,?\s+(\d{4})\b',
        re.IGNORECASE
    ),
    # "since 2019"
    re.compile(r'\bsince\s+(\d{4})\b'),
    # "in January 2019" preceded by appointed/elected/named/joined/became/served
    re.compile(
        r'\b(?:appointed|elected|named|joined|became|has\s+served|serving|'
        r'has\s+been|promoted|hired|chosen|designated|assumed)\b.{0,60}?'
        r'\bin\s+(january|february|march|april|may|june|july|august|'
        r'september|october|november|december|jan|feb|mar|apr|jun|jul|aug|'
        r'sep|sept|oct|nov|dec)\.?\s+(\d{4})\b',
        re.IGNORECASE | re.DOTALL
    ),
    # "appointed in 2019" (year only)
    re.compile(
        r'\b(?:appointed|elected|named|joined|became|has\s+served|serving|'
        r'has\s+been|promoted|hired|chosen|designated|assumed)\b.{0,40}?'
        r'\bin\s+(\d{4})\b',
        re.IGNORECASE | re.DOTALL
    ),
    # "as of March 2021"
    re.compile(
        r'\bas\s+of\s+(january|february|march|april|may|june|july|august|'
        r'september|october|november|december|jan|feb|mar|apr|jun|jul|aug|'
        r'sep|sept|oct|nov|dec)\.?\s+(\d{4})\b',
        re.IGNORECASE
    ),
]

YEAR_RE = re.compile(r'\b(19[6-9]\d|20[0-2]\d)\b')


# ── Helpers ────────────────────────────────────────────────────────────────────

class MLStripper(HTMLParser):
    """Fast HTML → plain text stripper."""
    def __init__(self):
        super().__init__()
        self.reset()
        self.fed = []
        self.in_script = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.in_script = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.in_script = False

    def handle_data(self, d):
        if not self.in_script:
            self.fed.append(d)

    def get_data(self):
        return " ".join(self.fed)


def html_to_text(html: str) -> str:
    s = MLStripper()
    try:
        s.feed(html)
    except Exception:
        pass
    text = s.get_data()
    text = re.sub(r'\s+', ' ', text)
    return text


def db_query(sql: str) -> list[list[str]]:
    result = subprocess.run(
        DB_ARGS + ["-c", sql],
        capture_output=True, text=True, env=DB_ENV
    )
    if result.returncode != 0:
        print(f"  DB ERROR: {result.stderr.strip()}", file=sys.stderr)
        return []
    lines = result.stdout.strip().split("\n")
    return [line.split("\t") for line in lines if line.strip()]


def db_exec(sql: str) -> bool:
    result = subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "data",
         "--no-psqlrc", "-c", sql],
        capture_output=True, text=True, env=DB_ENV
    )
    if result.returncode != 0:
        print(f"  DB ERROR: {result.stderr.strip()}", file=sys.stderr)
        return False
    return True


def extract_year_month(text_window: str) -> tuple[int | None, int | None]:
    """
    Try all patterns against the text window.
    Returns (year, month) where month may be None.
    Only accepts years 1960-2025.
    """
    for pat in DATE_PATTERNS:
        m = pat.search(text_window)
        if not m:
            continue
        groups = m.groups()
        # Determine if we have (month_str, year_str) or just (year_str,)
        if len(groups) == 2:
            a, b = groups
            # Check if first group is a month name
            if isinstance(a, str) and a.lower() in MONTH_MAP:
                month = MONTH_MAP[a.lower()]
                try:
                    year = int(b)
                    if 1960 <= year <= 2025:
                        return year, month
                except (ValueError, TypeError):
                    pass
            else:
                # Both might be year candidates; try second
                try:
                    year = int(b)
                    if 1960 <= year <= 2025:
                        return year, None
                except (ValueError, TypeError):
                    pass
                try:
                    year = int(a)
                    if 1960 <= year <= 2025:
                        return year, None
                except (ValueError, TypeError):
                    pass
        elif len(groups) == 1:
            try:
                year = int(groups[0])
                if 1960 <= year <= 2025:
                    return year, None
            except (ValueError, TypeError):
                pass
    return None, None


def name_windows(text: str, first: str, last: str, window: int = 600) -> list[str]:
    """
    Find all occurrences of the manager's name in text and return
    surrounding windows of ±window chars.
    """
    # Try full name first, then last name only
    patterns = [
        re.compile(re.escape(f"{first} {last}"), re.IGNORECASE),
        re.compile(r'\b' + re.escape(last) + r'\b', re.IGNORECASE),
    ]
    windows = []
    seen_positions = set()
    for pat in patterns:
        for m in pat.finditer(text):
            pos = m.start()
            # Avoid overlapping windows
            if any(abs(pos - s) < window // 2 for s in seen_positions):
                continue
            seen_positions.add(pos)
            start = max(0, pos - window // 4)
            end = min(len(text), pos + window)
            windows.append(text[start:end])
    return windows


def fetch_filing(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if resp.status_code == 200:
            return resp.text
        print(f"  HTTP {resp.status_code} for {url}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Fetch error for {url}: {e}", file=sys.stderr)
        return None


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # Get all roles that still need start dates, grouped by source_url
    print("Loading roles from DB...")
    rows = db_query("""
        SELECT mr.id, m.first_name, m.last_name, mr.job_title, mr.source_url
        FROM manager_roles mr
        JOIN managers m ON m.id = mr.manager_id
        WHERE mr.role_start_year IS NULL
          AND mr.source_url IS NOT NULL
        ORDER BY mr.source_url, m.last_name
    """)

    if not rows:
        print("No rows to process.")
        return

    print(f"Processing {len(rows)} role rows across unique filings...")

    # Group by URL
    by_url: dict[str, list] = {}
    for row in rows:
        if len(row) < 5:
            continue
        role_id, first, last, title, url = row
        by_url.setdefault(url, []).append((role_id, first, last, title))

    total_urls = len(by_url)
    updated = 0
    not_found = 0
    errors = 0

    for idx, (url, roles) in enumerate(by_url.items(), 1):
        if idx % 100 == 0 or idx == 1:
            print(f"  [{idx}/{total_urls}] filings processed | {updated} dates found so far")

        html = fetch_filing(url)
        time.sleep(REQUEST_DELAY)

        if not html:
            errors += 1
            continue

        text = html_to_text(html)

        for (role_id, first, last, title) in roles:
            windows = name_windows(text, first, last)
            best_year = None
            best_month = None

            for window in windows:
                year, month = extract_year_month(window)
                if year:
                    # Prefer more specific (with month); prefer earlier year (role start)
                    if best_year is None or year < best_year:
                        best_year = year
                        best_month = month
                    elif year == best_year and month and best_month is None:
                        best_month = month

            if best_year:
                if best_month:
                    date_str = f"{best_year}-{best_month:02d}-01"
                    source = "def14a_month"
                else:
                    date_str = f"{best_year}-01-01"
                    source = "def14a_year"

                sql = (
                    f"UPDATE manager_roles SET "
                    f"role_start_year = {best_year}, "
                    f"role_start_date = '{date_str}', "
                    f"start_date_source = '{source}' "
                    f"WHERE id = {role_id};"
                )
                if db_exec(sql):
                    updated += 1
            else:
                not_found += 1

    print(f"\nDone.")
    print(f"  Dates found:     {updated}")
    print(f"  No date found:   {not_found}")
    print(f"  Fetch errors:    {errors}")
    print(f"  Total filings:   {total_urls}")

    # Summary breakdown
    summary = db_query("""
        SELECT start_date_source, COUNT(*)
        FROM manager_roles
        GROUP BY start_date_source
        ORDER BY COUNT(*) DESC
    """)
    print("\nstart_date_source breakdown:")
    for row in summary:
        if len(row) == 2:
            print(f"  {row[0]:<25} {row[1]}")


if __name__ == "__main__":
    main()
