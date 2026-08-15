#!/usr/bin/env python3
"""
Second pass: handles filings that use date-range bullet formats instead of "since YYYY".
Targets the 3,239 roles still missing start dates.

Additional patterns:
  - "2019 - present" / "2019–present" / "2019 to present"
  - "2019 – 2022"  (first year of a range = start)
  - "(2019 – present)"
  - "Chief X Officer, 2019" (title comma year)
  - "joined in 2019" / "appointed in 2019"
  - "Director since 2019" (nearby, not necessarily after "since")
"""

import os, re, subprocess, time, sys
from html.parser import HTMLParser
import requests

DB_ARGS = ["psql", "-h", "localhost", "-U", "postgres", "-d", "data",
           "--no-psqlrc", "-t", "-A", "-F", "\t"]
DB_ENV  = {**os.environ, "PGPASSWORD": "postgres"}
HEADERS = {"User-Agent": "RateMyManager research/1.0 kuriant@protonmail.com",
           "Accept-Encoding": "gzip, deflate"}
REQUEST_DELAY   = 0.12
REQUEST_TIMEOUT = 30

MONTH_MAP = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
    "sep":9,"sept":9,"oct":10,"nov":11,"dec":12,
}

# Broader patterns for second pass
PATTERNS_P2 = [
    # "2019 - present" / "2019 – present" / "(2019-present)" / "2019 to present"
    re.compile(r'\b(19[6-9]\d|20[0-2]\d)\s*[-–—to]+\s*(?:present|current|now|date)\b', re.IGNORECASE),
    # "(2019 – 2023)" or "2019–2023" — take first year as start
    re.compile(r'\((19[6-9]\d|20[0-2]\d)\s*[-–—]\s*(19[6-9]\d|20[0-2]\d)\)'),
    re.compile(r'\b(19[6-9]\d|20[0-2]\d)\s*[-–—]\s*(19[6-9]\d|20[0-2]\d)\b'),
    # "Month YYYY – present" / "Month YYYY – Month YYYY"
    re.compile(
        r'\b(january|february|march|april|may|june|july|august|september|'
        r'october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)'
        r'\.?\s+(19[6-9]\d|20[0-2]\d)\s*[-–—]',
        re.IGNORECASE
    ),
    # "Director since 2019" (the word "since" anywhere near a year in the window)
    re.compile(r'\bsince\s+(19[6-9]\d|20[0-2]\d)\b'),
    # "Title, Company (2019)" — year in parens right after role info
    re.compile(r'\((19[6-9]\d|20[0-2]\d)\)'),
    # "has served ... since January 2019"
    re.compile(
        r'\bsince\s+(january|february|march|april|may|june|july|august|september|'
        r'october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)'
        r'\.?,?\s+(19[6-9]\d|20[0-2]\d)\b',
        re.IGNORECASE
    ),
    # "appointed/joined/became ... Month YYYY"
    re.compile(
        r'\b(?:appointed|elected|named|joined|became|promoted|hired|assumed|serving)\b'
        r'.{0,80}?\b(january|february|march|april|may|june|july|august|september|'
        r'october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)'
        r'\.?\s+(19[6-9]\d|20[0-2]\d)\b',
        re.IGNORECASE | re.DOTALL
    ),
    # "in YYYY" after action verb
    re.compile(
        r'\b(?:appointed|elected|named|joined|became|promoted|hired|assumed)\b'
        r'.{0,50}?\bin\s+(19[6-9]\d|20[0-2]\d)\b',
        re.IGNORECASE | re.DOTALL
    ),
]


class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.fed = []
        self.in_skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.in_skip = True
    def handle_endtag(self, tag):
        if tag in ("script", "style"): self.in_skip = False
    def handle_data(self, d):
        if not self.in_skip: self.fed.append(d)
    def get_data(self): return " ".join(self.fed)


def html_to_text(html):
    s = MLStripper()
    try: s.feed(html)
    except Exception: pass
    return re.sub(r'\s+', ' ', s.get_data())


def db_query(sql):
    r = subprocess.run(DB_ARGS + ["-c", sql], capture_output=True, text=True, env=DB_ENV)
    if r.returncode != 0:
        print(f"  DB ERROR: {r.stderr.strip()}", file=sys.stderr)
        return []
    lines = r.stdout.strip().split("\n")
    return [l.split("\t") for l in lines if l.strip()]


def db_exec(sql):
    r = subprocess.run(
        ["psql","-h","localhost","-U","postgres","-d","data","--no-psqlrc","-c",sql],
        capture_output=True, text=True, env=DB_ENV
    )
    return r.returncode == 0


def fetch_filing(url):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if resp.status_code == 200: return resp.text
        return None
    except Exception:
        return None


def extract_year_month_p2(window):
    """Try all second-pass patterns. Returns (year, month_or_None)."""
    candidates = []  # list of (year, month)

    for pat in PATTERNS_P2:
        for m in pat.finditer(window):
            groups = [g for g in m.groups() if g]
            year, month = None, None
            for g in groups:
                try:
                    y = int(g)
                    if 1960 <= y <= 2025:
                        if year is None or y < year:
                            year = y
                        continue
                except ValueError:
                    pass
                if g.lower() in MONTH_MAP:
                    month = MONTH_MAP[g.lower()]
            if year:
                candidates.append((year, month))

    if not candidates:
        return None, None

    # Pick earliest year (most likely start); prefer month-precise
    candidates.sort(key=lambda x: (x[0], 0 if x[1] else 1))
    return candidates[0]


def name_windows(text, first, last, window=700):
    patterns = [
        re.compile(re.escape(f"{first} {last}"), re.IGNORECASE),
        re.compile(r'\b' + re.escape(last) + r'\b', re.IGNORECASE),
    ]
    windows = []
    seen = set()
    for pat in patterns:
        for m in pat.finditer(text):
            pos = m.start()
            if any(abs(pos - s) < window // 2 for s in seen): continue
            seen.add(pos)
            start = max(0, pos - window // 4)
            end   = min(len(text), pos + window)
            windows.append(text[start:end])
    return windows


def main():
    print("Loading roles without start dates...")
    rows = db_query("""
        SELECT mr.id, m.first_name, m.last_name, mr.job_title, mr.source_url
        FROM manager_roles mr
        JOIN managers m ON m.id = mr.manager_id
        WHERE mr.role_start_year IS NULL
          AND mr.source_url IS NOT NULL
        ORDER BY mr.source_url, m.last_name
    """)
    if not rows:
        print("Nothing to do — all roles have start dates.")
        return

    print(f"  {len(rows)} roles still need dates")

    by_url = {}
    for row in rows:
        if len(row) < 5: continue
        role_id, first, last, title, url = row
        by_url.setdefault(url, []).append((role_id, first, last, title))

    total_urls = len(by_url)
    updated, not_found, errors = 0, 0, 0

    for idx, (url, roles) in enumerate(by_url.items(), 1):
        if idx % 100 == 0 or idx == 1:
            print(f"  [{idx}/{total_urls}] | {updated} new dates found")

        html = fetch_filing(url)
        time.sleep(REQUEST_DELAY)

        if not html:
            errors += 1
            continue

        text = html_to_text(html)

        for (role_id, first, last, title) in roles:
            windows = name_windows(text, first, last)
            best_year, best_month = None, None

            for w in windows:
                yr, mo = extract_year_month_p2(w)
                if yr:
                    if best_year is None or yr < best_year:
                        best_year, best_month = yr, mo
                    elif yr == best_year and mo and best_month is None:
                        best_month = mo

            if best_year:
                if best_month:
                    date_str = f"{best_year}-{best_month:02d}-01"
                    src = "def14a_month"
                else:
                    date_str = f"{best_year}-01-01"
                    src = "def14a_year"

                sql = (f"UPDATE manager_roles SET "
                       f"role_start_year={best_year}, "
                       f"role_start_date='{date_str}', "
                       f"start_date_source='{src}' "
                       f"WHERE id={role_id};")
                if db_exec(sql): updated += 1
            else:
                not_found += 1

    print(f"\nPass 2 done.")
    print(f"  New dates found:  {updated}")
    print(f"  Still unknown:    {not_found}")
    print(f"  Fetch errors:     {errors}")

    summary = db_query("""
        SELECT start_date_source, COUNT(*)
        FROM manager_roles
        GROUP BY start_date_source ORDER BY COUNT(*) DESC
    """)
    print("\nFinal breakdown:")
    for row in summary:
        if len(row) == 2: print(f"  {row[0]:<25} {row[1]}")

    total = db_query("SELECT COUNT(*), COUNT(role_start_year), ROUND(COUNT(role_start_year)::numeric/COUNT(*)*100,1) FROM manager_roles")
    if total and total[0]:
        t = total[0]
        print(f"\nOverall coverage: {t[1]}/{t[0]} roles ({t[2]}%)")


if __name__ == "__main__":
    main()
