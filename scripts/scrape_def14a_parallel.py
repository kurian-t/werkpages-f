#!/usr/bin/env python3
"""
Parallel wrapper for scrape_def14a.py.
Splits the SEC company list into N chunks and runs each in a separate process.

Usage:
    python scripts/scrape_def14a_parallel.py --workers 4
"""

import argparse
import multiprocessing
import sys
import time
import re
from datetime import date

import psycopg2
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

# ── Import shared logic from the main scraper ─────────────────────────────────
sys.path.insert(0, "scripts")
from scrape_def14a import (
    DB_CONFIG, HEADERS, COMPANY_TICKERS_URL, SUBMISSIONS_URL,
    MAX_FILINGS_PER_COMPANY,
    clean_title, normalize_name, make_person_id,
    looks_like_real_name, extract_people_from_text,
    get_companies, get_def14a_urls, fetch_text,
    upsert_manager, insert_role, count_totals,
)


def scrape_chunk(worker_id: int, company_chunk: list):
    """Scrape a slice of companies in a single process."""
    conn = psycopg2.connect(**DB_CONFIG)
    added_roles = 0
    scanned = 0
    extracted = 0

    print(f"[worker {worker_id}] Starting — {len(company_chunk)} companies")

    for idx, company in enumerate(company_chunk):
        try:
            filing_urls = get_def14a_urls(company)
            time.sleep(0.1)

            for url in filing_urls[:MAX_FILINGS_PER_COMPANY]:
                scanned += 1
                try:
                    text = fetch_text(url)
                except Exception as e:
                    print(f"[worker {worker_id}] fetch error: {e}")
                    continue

                people = extract_people_from_text(text)
                extracted += len(people)

                for first, last, title in people:
                    role = {
                        "company_name": company["company_name"],
                        "job_title": title,
                        "country": "United States",
                        "industry": "",
                        "source_url": url,
                        "source_type": "filing",
                        "filing_type": "DEF 14A",
                        "date_collected": str(date.today()),
                        "confidence_score": 0.85,
                    }
                    manager_id = upsert_manager(conn, first, last)
                    if insert_role(conn, manager_id, role):
                        added_roles += 1

                conn.commit()
                time.sleep(0.1)

        except KeyboardInterrupt:
            break
        except Exception as e:
            conn.rollback()
            print(f"[worker {worker_id}] skipping {company['company_name']}: {e}")

        if (idx + 1) % 100 == 0:
            managers, roles = count_totals(conn)
            print(
                f"[worker {worker_id}] {idx+1}/{len(company_chunk)} companies — "
                f"added roles: {added_roles}, extracted: {extracted}, "
                f"total managers: {managers}, total roles: {roles}"
            )

    conn.close()
    print(f"[worker {worker_id}] Done — added {added_roles} roles from {scanned} filings")
    return added_roles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4, help="Number of parallel workers (default: 4)")
    args = parser.parse_args()

    print("Fetching company list from SEC...")
    companies = get_companies()
    total = len(companies)
    print(f"Total companies: {total}")

    # Split into equal chunks
    chunk_size = (total + args.workers - 1) // args.workers
    chunks = [companies[i:i + chunk_size] for i in range(0, total, chunk_size)]
    print(f"Splitting into {len(chunks)} chunks of ~{chunk_size} companies each")

    with multiprocessing.Pool(processes=args.workers) as pool:
        results = pool.starmap(scrape_chunk, enumerate(chunks))

    print(f"\nAll workers done. Total roles added: {sum(results)}")

    # Final count
    conn = psycopg2.connect(**DB_CONFIG)
    managers, roles = count_totals(conn)
    conn.close()
    print(f"Total managers in DB: {managers}")
    print(f"Total roles in DB:    {roles}")


if __name__ == "__main__":
    main()
