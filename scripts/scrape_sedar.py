#!/usr/bin/env python3
"""
Scrapes Management Information Circulars from SEDAR+ using Playwright
browser automation (handles JSF/PrimeFaces + Cloudflare bot protection).

Setup:
    pip install playwright psycopg2-binary beautifulsoup4
    playwright install firefox

Resumes from saved offset in scrape_state table (key: sedar_page_offset).
"""

import re
import time
from datetime import date

import psycopg2
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "data",
    "user": "postgres",
    "password": "postgres",
}

MAX_FILINGS_PER_COMPANY = 3

SEDAR_SEARCH_URL = "https://www.sedarplus.ca/csa-party/party/document.html"

# Document type filter text as it appears on SEDAR+
DOC_TYPE_LABEL = "Management information circular"

# ── Name/title extraction (same as SEC scraper) ───────────────────────────────

BAD_NAME_TOKENS = {
    "annual", "meeting", "proxy", "statement", "board", "committee",
    "compensation", "governance", "audit", "security", "holders",
    "shareholders", "stockholder", "stockholders", "proposal", "proposals",
    "table", "information", "fiscal", "performance", "corporate", "affairs",
    "beneficial", "owner", "ownership", "item", "section", "page", "part",
    "class", "series", "voting", "shares", "options", "awards", "grants",
    "plan", "program", "policy", "policies", "form", "exhibit", "appendix",
    "amendment", "registration", "notice", "circular", "management",
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
    "director", "executive", "officer", "counsel", "secretary", "president",
    "vice", "chair", "chairman", "chairwoman", "senior", "chief", "general",
    "auditor", "founder", "treasurer", "manager", "partner", "associate",
    "principal", "independent", "lead", "emeritus",
    "mr", "mrs", "ms", "dr", "prof",
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
    "agreement", "agreements", "arrangement", "arrangements", "employees",
    "employee", "officers", "officer", "positions", "position", "programs",
    "incentives", "activities", "transactions", "provisions", "requirements",
    "obligations", "multiplier", "markets", "highlights", "zoo", "force",
    "holidays", "center", "formerly", "currently", "generally", "fund",
    "funds", "payout", "retainer", "bonuses", "bonus", "salary", "fee",
    "amounts", "amount", "pay", "neos", "bylaws", "by-laws", "comp",
    "common", "stock", "financial", "technology", "legal", "investment",
    "research", "scientist", "global", "international", "national",
    "american", "north", "south", "east", "west", "new", "old",
    "all", "any", "each", "every", "no", "certain", "various", "several",
    "multiple", "additional", "following", "prior", "applicable", "specific",
    "individual", "aggregate", "combined", "comprehensive", "partial",
    "temporary", "permanent", "interim", "final", "initial", "preliminary",
    "spain", "france", "germany", "china", "japan", "canada", "australia",
    "mexico", "brazil", "india", "europe", "asia", "africa",
    "hawaii", "florida", "arizona", "idaho", "oklahoma", "michigan",
    "portugal", "ireland", "england",
    "former", "retired", "member", "other", "united", "states", "wind",
    "energy", "non", "and", "be", "co-ceo", "the", "an", "only", "sole",
    "key", "base", "cash", "equity", "target", "total", "gross", "net",
    "award", "change", "transition", "consulting", "repayment", "security",
    "subscription", "indemnification",
}

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
    r"|Chief\s+(?:[A-Za-z]+\s+){1,3}Officer"
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


def normalize(value):
    return re.sub(r"\s+", " ", value.strip().lower())


def normalize_name(first, last):
    return f"{normalize(first)} {normalize(last)}"


def make_person_id(first, last):
    return re.sub(r"[^a-z0-9]+", "_", normalize_name(first, last)).strip("_")


def looks_like_real_name(first, last):
    if first.lower() in BAD_NAME_TOKENS or last.lower() in BAD_NAME_TOKENS:
        return False
    if len(first) < 2 or len(last) < 2:
        return False
    if len(first) > 25 or len(last) > 25:
        return False
    if not re.match(r"^[A-Z][a-zA-Z'-]+$", first):
        return False
    if not re.match(r"^[A-Z][a-zA-Z'-]+$", last):
        return False
    if first.isupper() or last.isupper():
        return False
    vowels = set("aeiouAEIOU")
    if not any(c in vowels for c in first) or not any(c in vowels for c in last):
        return False
    # Reject last names ending in org/entity suffixes if suspiciously long
    if re.search(r"(ing|tion|ment|ness|ship|hood|ance|ence|ology|ware|ering)$", last.lower()):
        if len(last) > 12:
            return False
    # Reject possessives
    if last.endswith("'s") or last.endswith("'s"):
        return False
    return True


def extract_people_from_text(text):
    people = []
    for match in _NAME_TITLE_RE.finditer(text):
        first = match.group(1)
        last = match.group(2)
        title = clean_title(match.group(3))
        if not title:
            continue
        if not looks_like_real_name(first, last):
            continue
        people.append((first, last, title))
    return people


# ── SEDAR+ browser automation ─────────────────────────────────────────────────

def navigate_to_mic_search(page: Page):
    """Navigate to SEDAR+ document search and filter by Management Information Circular."""
    page.goto(SEDAR_SEARCH_URL, wait_until="networkidle", timeout=60_000)

    # Accept cookies if banner appears
    try:
        page.get_by_role("button", name=re.compile(r"accept|agree|ok", re.I)).click(timeout=5_000)
    except PWTimeout:
        pass

    # Look for the document type dropdown/filter
    # SEDAR+ uses PrimeFaces — the filter is likely a <select> or a p:selectOneMenu
    try:
        # Try a <select> for document type
        doc_type_select = page.locator("select").filter(
            has=page.locator(f"option:text('{DOC_TYPE_LABEL}')")
        ).first
        doc_type_select.select_option(label=DOC_TYPE_LABEL)
    except Exception:
        # Fallback: try PrimeFaces dropdown widget
        page.get_by_label(re.compile(r"document type|type", re.I)).click(timeout=10_000)
        page.get_by_role("option", name=DOC_TYPE_LABEL).click(timeout=5_000)

    # Click Search/Apply
    try:
        page.get_by_role("button", name=re.compile(r"^search$", re.I)).click(timeout=10_000)
    except PWTimeout:
        page.get_by_role("button", name=re.compile(r"apply|filter|go", re.I)).click(timeout=5_000)

    page.wait_for_load_state("networkidle", timeout=30_000)


def get_filing_rows(page: Page) -> list[dict]:
    """Extract filing rows from the current search results page."""
    rows = []
    # Each row in the results table contains a company link and document link
    result_rows = page.locator("table tbody tr").all()
    for row in result_rows:
        try:
            company_el = row.locator("td a").first
            company_name = company_el.inner_text(timeout=3_000).strip()
            # Strip the SEDAR ID in parentheses: "Acme Corp (000012345)" → "Acme Corp"
            company_name = re.sub(r"\s*\(\d+\)\s*$", "", company_name).strip()

            doc_el = row.locator("td a").nth(1)
            doc_href = doc_el.get_attribute("href", timeout=3_000)
            doc_text = doc_el.inner_text(timeout=3_000).strip()

            if not company_name or not doc_href:
                continue

            rows.append({
                "company": company_name,
                "doc_url": doc_href if doc_href.startswith("http") else f"https://www.sedarplus.ca{doc_href}",
                "doc_name": doc_text,
            })
        except Exception:
            continue
    return rows


def has_next_page(page: Page) -> bool:
    """Return True if a Next page button is present and not disabled."""
    try:
        nxt = page.locator("a, button").filter(has_text=re.compile(r"^next$|›|»", re.I)).last
        disabled = nxt.get_attribute("aria-disabled") or nxt.get_attribute("disabled") or ""
        cls = nxt.get_attribute("class") or ""
        return "disabled" not in cls and disabled not in ("true", "disabled")
    except Exception:
        return False


def go_to_next_page(page: Page):
    nxt = page.locator("a, button").filter(has_text=re.compile(r"^next$|›|»", re.I)).last
    nxt.click()
    page.wait_for_load_state("networkidle", timeout=30_000)
    time.sleep(1)


def fetch_document_text(page: Page, url: str) -> str:
    """Open a document URL in a new tab and return its text content."""
    ctx = page.context
    doc_page = ctx.new_page()
    try:
        doc_page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        content_type = ""
        try:
            # For HTML pages extract text via BS4
            html = doc_page.content()
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style"]):
                tag.decompose()
            return soup.get_text(" ")
        except Exception:
            return doc_page.inner_text("body")
    except Exception as e:
        print(f"    fetch error: {e}")
        return ""
    finally:
        doc_page.close()


# ── Database helpers ──────────────────────────────────────────────────────────

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
    conn.commit()


def get_state(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM scrape_state WHERE key = 'sedar_page_offset'")
        row = cur.fetchone()
    return int(row[0]) if row else 0


def save_state(conn, page_num: int):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO scrape_state (key, value)
            VALUES ('sedar_page_offset', %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
        """, (str(page_num),))
    conn.commit()


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


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    conn = connect_db()
    init_db(conn)
    start_page = get_state(conn)

    added_roles = 0
    scanned_docs = 0
    extracted_people = 0

    with sync_playwright() as pw:
        browser = pw.firefox.launch(headless=False)  # headed so Cloudflare passes
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) "
                "Gecko/20100101 Firefox/125.0"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-CA",
        )
        page = context.new_page()

        try:
            print("Navigating to SEDAR+ document search...")
            navigate_to_mic_search(page)
            print("Filter applied. Starting pagination...")

            current_page = 0

            # Skip to resume page
            if start_page > 0:
                print(f"Skipping to page {start_page}...")
                for _ in range(start_page):
                    if not has_next_page(page):
                        print("Reached end before resume offset — resetting.")
                        save_state(conn, 0)
                        current_page = 0
                        break
                    go_to_next_page(page)
                    current_page += 1

            while True:
                rows = get_filing_rows(page)
                print(f"Page {current_page}: {len(rows)} filings")

                for filing in rows:
                    scanned_docs += 1
                    company = filing["company"]
                    doc_url = filing["doc_url"]

                    print(f"  [{scanned_docs}] {company} — {filing['doc_name']}")
                    text = fetch_document_text(page, doc_url)
                    if not text:
                        continue

                    people = extract_people_from_text(text)
                    extracted_people += len(people)
                    print(f"    found {len(people)} executives")

                    for first, last, title in people:
                        role = {
                            "company_name": company,
                            "job_title": title,
                            "country": "Canada",
                            "industry": "",
                            "source_url": doc_url,
                            "source_type": "filing",
                            "filing_type": "Management information circular",
                            "date_collected": str(date.today()),
                            "confidence_score": 0.75,
                        }
                        manager_id = upsert_manager(conn, first, last)
                        if insert_role(conn, manager_id, role):
                            added_roles += 1

                    conn.commit()
                    time.sleep(0.5)

                save_state(conn, current_page + 1)

                if current_page % 10 == 0:
                    managers, roles = count_totals(conn)
                    print(
                        f"Checkpoint — page {current_page}, added roles: {added_roles}, "
                        f"people extracted: {extracted_people}, "
                        f"total managers: {managers}, total roles: {roles}"
                    )

                if not has_next_page(page):
                    print("No more pages.")
                    break

                go_to_next_page(page)
                current_page += 1
                time.sleep(1)

            save_state(conn, 0)
            print("Reached end of results. Offset reset to 0.")

        except KeyboardInterrupt:
            conn.rollback()
            print("\nStopped by user. Progress saved.")

        finally:
            managers, roles = count_totals(conn)
            browser.close()
            conn.close()
            print(f"\nDone.")
            print(f"Scanned documents:      {scanned_docs}")
            print(f"Extracted people:       {extracted_people}")
            print(f"Added roles this run:   {added_roles}")
            print(f"Total managers:         {managers}")
            print(f"Total roles:            {roles}")


if __name__ == "__main__":
    main()
