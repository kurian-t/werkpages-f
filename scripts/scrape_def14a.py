#!/usr/bin/env python3
"""
Scrapes DEF 14A proxy filings from SEC EDGAR to extract named executives.

Resumes from saved offset in scrape_state table.
Delete managers + manager_roles to re-scrape; scrape_state offset is preserved.
"""

import re
import time
from datetime import date

import psycopg2
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "data",
    "user": "postgres",
    "password": "postgres",
}

BATCH_SIZE = 3000
MAX_FILINGS_PER_COMPANY = 5

HEADERS = {
    "User-Agent": "RateMyManagers data collection kuriant@protonmail.com"
}

def _make_session():
    s = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=2,        # waits 2, 4, 8, 16, 32s between retries
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

_SESSION = _make_session()

COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"

# Words that disqualify a token from being a valid first or last name.
# Covers: corporate entity words, financial/legal terms, geographic words,
# proxy-statement boilerplate, titles, and common gerunds from table headers.
BAD_NAME_TOKENS = {
    # Proxy / legal boilerplate
    "annual", "meeting", "proxy", "statement", "board", "committee",
    "compensation", "governance", "audit", "security", "holders",
    "shareholders", "stockholder", "stockholders", "proposal", "proposals",
    "table", "information", "fiscal", "performance", "corporate", "affairs",
    "beneficial", "owner", "ownership", "item", "section", "page", "part",
    "class", "series", "voting", "shares", "options", "awards", "grants",
    "plan", "program", "policy", "policies", "form", "exhibit", "appendix",
    "amendment", "registration", "notice", "circular", "management",
    # Financial / action gerunds and participles
    "pledging", "restricting", "hedging", "trading", "purchasing", "selling",
    "granting", "exercising", "vesting", "holding", "reporting", "filing",
    "managing", "operating", "serving", "effective", "continued", "continuing",
    "appointed", "eligible", "eligibility", "consolidated", "distributed",
    "developed", "established", "earned", "required", "securitized",
    "restated", "revised", "related", "interested", "talented", "allocated",
    "authorized", "awarded", "calculated", "classified", "combined",
    "committed", "converted", "credited", "deemed", "defined", "derived",
    "designated", "determined", "disclosed", "distributed", "divided",
    "estimated", "excluded", "expected", "extended", "forfeited", "funded",
    "identified", "included", "incurred", "issued", "listed", "maintained",
    "measured", "modified", "offered", "outstanding", "paid", "performed",
    "permitted", "presented", "provided", "purchased", "received",
    "recognized", "recorded", "reduced", "reflected", "satisfied", "settled",
    "sold", "submitted", "transferred", "treated", "used", "valued", "waived",
    # Titles / honorifics
    "director", "executive", "officer", "counsel", "secretary", "president",
    "vice", "chair", "chairman", "chairwoman", "senior", "chief", "general",
    "auditor", "founder", "treasurer", "manager", "partner", "associate",
    "principal", "independent", "lead", "emeritus",
    "mr", "mrs", "ms", "dr", "prof",
    # Org / entity type words (last names that are really org names)
    "inc", "corp", "corporation", "ltd", "llc", "plc", "group", "co",
    "company", "holdings", "ventures", "systems", "services", "solutions",
    "electronics", "technologies", "industries", "partners", "associates",
    "enterprises", "capital", "management", "resources", "properties",
    "limited", "manufacturing", "transportation", "publishing", "mining",
    "utilities", "telecom", "electric", "agriculture", "software", "networks",
    "orchestra", "reimbursement", "theater", "theatre", "sourcing",
    "aftermarket", "brothers", "housing", "county", "origins", "resource",
    "property", "complex", "collective", "estate", "strategies",
    "association", "foundation", "commission", "institute", "university",
    "college", "council", "academy", "authority", "bureau", "agency",
    "department", "programme", "initiative", "forum", "society", "federation",
    "alliance", "coalition", "church", "temple", "school", "hospital",
    "centre", "laboratory", "laboratories", "organization", "network",
    "trust", "charities", "cooperative", "subdivision", "sub-committee",
    "co-founder", "trustee", "beneficiary", "participant", "recipient",
    "registrant", "administration", "region", "zone", "district", "division",
    # Document / legal phrase words
    "agreement", "agreements", "arrangement", "arrangements", "employees",
    "employee", "officers", "officer", "positions", "position", "programs",
    "incentives", "activities", "transactions", "provisions", "requirements",
    "obligations", "multiplier", "markets", "containers", "highlights",
    "zoo", "force", "holidays", "center", "formerly", "currently",
    "generally", "fund", "funds", "payout", "retainer", "bonuses", "bonus",
    "salary", "fee", "amounts", "amount", "pay", "neos", "bylaws", "by-laws",
    "comp", "analyst", "non-chairman", "arrangements-",
    # Common non-name adjectives / nouns
    "common", "stock", "financial", "technology", "legal", "investment",
    "research", "scientist", "global", "international", "national",
    "american", "north", "south", "east", "west", "new", "old",
    "all", "any", "each", "every", "no", "certain", "various", "several",
    "multiple", "additional", "following", "prior", "applicable", "specific",
    "particular", "special", "individual", "collective", "aggregate",
    "combined", "integrated", "comprehensive", "complete", "partial",
    "temporary", "permanent", "interim", "final", "initial", "preliminary",
    # Countries / regions that appear as names in filings
    "spain", "france", "germany", "china", "japan", "canada", "australia",
    "mexico", "brazil", "india", "europe", "asia", "africa",
    "hawaii", "florida", "arizona", "idaho", "oklahoma", "michigan",
    "portugal", "ireland", "england",
    # Misc words found as junk in prior scrapes
    "former", "retired", "member", "other", "united", "states", "wind",
    "energy", "non", "and", "be", "co-ceo", "the", "an", "only", "sole",
    "key", "base", "cash", "equity", "target", "total", "gross", "net",
    "award", "change", "transition", "consulting", "repayment", "security",
    "subscription", "indemnification", "gorgas", "taskus", "akron",
    "holomua", "homeaid", "rwjbarnabas", "puretech", "matillion",
    "livongo", "wipro", "terebellum", "siemens", "stratex",
}


def normalize(value):
    return re.sub(r"\s+", " ", value.strip().lower())


def normalize_name(first, last):
    return f"{normalize(first)} {normalize(last)}"


def make_person_id(first, last):
    return re.sub(r"[^a-z0-9]+", "_", normalize_name(first, last)).strip("_")


def looks_like_real_name(first, last):
    f = first.lower()
    l = last.lower()

    if f in BAD_NAME_TOKENS or l in BAD_NAME_TOKENS:
        return False

    # Must be at least 2 chars each
    if len(first) < 2 or len(last) < 2:
        return False

    # Reject suspiciously long tokens (not real name parts)
    if len(first) > 25 or len(last) > 25:
        return False

    # Must start with capital, only letters/hyphens/apostrophes
    if not re.match(r"^[A-Z][a-zA-Z'-]+$", first):
        return False
    if not re.match(r"^[A-Z][a-zA-Z'-]+$", last):
        return False

    # Reject all-caps tokens (acronyms / entity abbreviations)
    if first.isupper() or last.isupper():
        return False

    # Reject tokens that are entirely consonants (likely abbreviations)
    vowels = set("aeiouAEIOU")
    if not any(c in vowels for c in first) or not any(c in vowels for c in last):
        return False

    # Reject last names ending in org/entity suffixes
    if re.search(r"(ing|tion|ment|ness|ship|hood|ance|ence|ology|ware|ering|ering|ering)$", l):
        # Allow only if it looks like a genuine surname pattern (short, common)
        # Real surnames: Manning, Fleming, Armstrong, Wellington, Harrington etc.
        # Fake: Manufacturing, Transportation, Reimbursement, Engineering (dept name)
        if len(last) > 12:
            return False

    # Reject if last name contains a digit or special char (except hyphen/apostrophe)
    if re.search(r"[^a-zA-Z'-]", last):
        return False

    # Reject possessives (e.g. "Carvana's")
    if "'" in last and last.endswith("s"):
        return False

    return True


def connect_db():
    return psycopg2.connect(**DB_CONFIG)


def init_db(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scrape_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS managers (
                id BIGSERIAL PRIMARY KEY,
                person_id TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS manager_roles (
                id BIGSERIAL PRIMARY KEY,
                manager_id BIGINT NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
                company_name TEXT NOT NULL,
                job_title TEXT NOT NULL,
                country TEXT,
                industry TEXT,
                source_url TEXT,
                source_type TEXT NOT NULL,
                filing_type TEXT,
                date_collected DATE NOT NULL,
                confidence_score NUMERIC(3,2) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (manager_id, company_name, job_title, source_url)
            );
        """)

        cur.execute("CREATE INDEX IF NOT EXISTS idx_manager_roles_company ON manager_roles (company_name);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_manager_roles_title ON manager_roles (job_title);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_managers_last_name ON managers (last_name);")

    conn.commit()


def get_state(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM scrape_state WHERE key = 'sec_company_offset'")
        row = cur.fetchone()
    return int(row[0]) if row else 0


def save_state(conn, offset):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO scrape_state (key, value)
            VALUES ('sec_company_offset', %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
        """, (str(offset),))
    conn.commit()


def get_companies():
    res = _SESSION.get(COMPANY_TICKERS_URL, headers=HEADERS, timeout=30)
    res.raise_for_status()
    return [
        {"cik": str(item["cik_str"]).zfill(10), "company_name": item["title"], "ticker": item.get("ticker")}
        for item in res.json().values()
    ]


def get_def14a_urls(company):
    url = SUBMISSIONS_URL.format(cik=company["cik"])
    res = _SESSION.get(url, headers=HEADERS, timeout=30)
    res.raise_for_status()

    filings = res.json()["filings"]["recent"]
    urls = []
    for form, accession, doc in zip(filings["form"], filings["accessionNumber"], filings["primaryDocument"]):
        if form == "DEF 14A":
            accession_clean = accession.replace("-", "")
            urls.append(
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{int(company['cik'])}/{accession_clean}/{doc}"
            )
    return urls[:MAX_FILINGS_PER_COMPANY]


_CANONICAL_TITLE_RE = re.compile(
    r"Executive Vice President|Senior Vice President|Vice President"
    r"|Chief Executive Officer|Chief Financial Officer|Chief Operating Officer"
    r"|Chief Technology Officer|Chief Information Officer|Chief Marketing Officer"
    r"|Chief Legal Officer|Chief Revenue Officer|Chief Risk Officer"
    r"|Chief Human Resources Officer|Chief People Officer|Chief Data Officer"
    r"|Chief Commercial Officer|Chief Administrative Officer|Chief Strategy Officer"
    r"|Chief Scientific Officer|Chief Medical Officer|Chief Compliance Officer"
    r"|Chief Accounting Officer|Chief Digital Officer|Chief Sustainability Officer"
    r"|Chief Security Officer|Chief Product Officer|Chief Supply Chain Officer"
    r"|Chief Transformation Officer|Chief Analytics Officer|Chief Business Officer"
    r"|Chief Growth Officer|Chief Innovation Officer|Chief Investment Officer"
    r"|Chief Procurement Officer|Chief Sales Officer"
    r"|President\s+(?:and|&)\s+(?:Chief Executive Officer|CEO)"
    r"|President"
    r"|CEO|CFO|COO|CTO|CIO|CMO|CLO|CHRO|CPO|CDO|CRO|CCO|CSO|CAO|CBO|CXO"
    r"|Chairman of the Board|Chairman|Chairwoman|Chair"
    r"|Managing Director|Executive Director|Independent Director|Director"
    r"|General Counsel|Treasurer|Secretary",
    re.IGNORECASE,
)


def clean_title(raw: str) -> str:
    m = _CANONICAL_TITLE_RE.search(raw)
    return m.group(0).strip() if m else ""


_TITLE_WORDS = (
    r"Chief|President|CEO|CFO|COO|CTO|CIO|"
    r"Executive Vice President|Senior Vice President|Vice President|"
    r"Director|Chair|Chairman|Chairwoman|General Counsel|Treasurer|Secretary"
)
_NAME_TITLE_RE = re.compile(
    rf"\b([A-Z][a-zA-Z'-]+)\s+([A-Z][a-zA-Z'-]+)\s*[,–—-]\s*"
    rf"((?:{_TITLE_WORDS})[^.\n\r;]{{0,120}})",
    re.IGNORECASE,
)


def extract_people_from_text(text):
    people = []
    for match in _NAME_TITLE_RE.finditer(text):
        first = match.group(1)
        last = match.group(2)
        title = clean_title(match.group(3))

        if not looks_like_real_name(first, last):
            continue

        people.append((first, last, title))

    return people


def fetch_text(url):
    res = _SESSION.get(url, headers=HEADERS, timeout=45)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    return soup.get_text(" ")


def upsert_manager(conn, first_name, last_name):
    normalized = normalize_name(first_name, last_name)
    person_id = make_person_id(first_name, last_name)
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO managers (person_id, first_name, last_name, normalized_name)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (normalized_name) DO UPDATE SET updated_at = now()
            RETURNING id;
        """, (person_id, first_name, last_name, normalized))
        return cur.fetchone()[0]


def insert_role(conn, manager_id, role):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO manager_roles (
                manager_id, company_name, job_title, country, industry,
                source_url, source_type, filing_type, date_collected, confidence_score
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (manager_id, company_name, job_title, source_url) DO NOTHING
            RETURNING id;
        """, (
            manager_id, role["company_name"], role["job_title"],
            role["country"], role["industry"], role["source_url"],
            role["source_type"], role["filing_type"],
            role["date_collected"], role["confidence_score"],
        ))
        return cur.fetchone() is not None


def count_totals(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM managers")
        managers = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM manager_roles")
        roles = cur.fetchone()[0]
    return managers, roles


def main():
    conn = connect_db()
    init_db(conn)

    companies = get_companies()
    start_offset = get_state(conn)

    if start_offset >= len(companies):
        start_offset = 0
        save_state(conn, 0)

    end_offset = min(start_offset + BATCH_SIZE, len(companies))
    batch = companies[start_offset:end_offset]

    print(f"Company offset: {start_offset} to {end_offset} of {len(companies)}")
    print(f"Batch size: {len(batch)}")

    added_roles = 0
    scanned_filings = 0
    extracted_people = 0

    try:
        for local_idx, company in enumerate(batch, start=1):
            global_idx = start_offset + local_idx - 1
            try:
                print(f"[{local_idx}/{len(batch)}] {company['company_name']}")

                filing_urls = get_def14a_urls(company)
                time.sleep(0.12)

                for filing_url in filing_urls:
                    scanned_filings += 1
                    text = fetch_text(filing_url)
                    people = extract_people_from_text(text)
                    extracted_people += len(people)
                    print(f"  filing extracted people: {len(people)}")

                    for first, last, title in people:
                        role = {
                            "company_name": company["company_name"],
                            "job_title": title,
                            "country": "USA",
                            "industry": "",
                            "source_url": filing_url,
                            "source_type": "filing",
                            "filing_type": "DEF 14A",
                            "date_collected": str(date.today()),
                            "confidence_score": 0.75,
                        }
                        manager_id = upsert_manager(conn, first, last)
                        if insert_role(conn, manager_id, role):
                            added_roles += 1

                    conn.commit()
                    time.sleep(0.12)

                save_state(conn, global_idx + 1)

                if local_idx % 25 == 0:
                    managers, roles = count_totals(conn)
                    print(
                        f"Checkpoint. Added roles: {added_roles}. "
                        f"Extracted people: {extracted_people}. "
                        f"Total managers: {managers}. Total roles: {roles}."
                    )

            except KeyboardInterrupt:
                raise
            except Exception as e:
                conn.rollback()
                print(f"Skipping {company['company_name']}: {e}")
                save_state(conn, global_idx + 1)

        if end_offset >= len(companies):
            save_state(conn, 0)
            print("Reached end of SEC company list. Offset reset to 0.")

    except KeyboardInterrupt:
        conn.rollback()
        print("\nStopped by user. Progress saved.")

    finally:
        managers, roles = count_totals(conn)
        conn.close()
        print(f"\nDone.")
        print(f"Scanned filings:        {scanned_filings}")
        print(f"Extracted people:       {extracted_people}")
        print(f"Added roles this run:   {added_roles}")
        print(f"Total managers:         {managers}")
        print(f"Total roles:            {roles}")


if __name__ == "__main__":
    main()
