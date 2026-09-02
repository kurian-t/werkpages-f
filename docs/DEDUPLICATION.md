# Werkpages: de-duplicating the core product

> **Status.** Phases 1–5 and B-1 are done and ported to RMM. Phases 6, 7, 8 and B-2..B-7
> remain. Both apps green: Werkpages 790 chromium / 404 unit / 1001 IT; RMM 660 chromium
> (+14 known Auth0 env failures) / 389 unit / 850 IT.
>
> | Phase | State |
> |---|---|
> | 1 — orphaned helpers deleted | done, both apps |
> | 2 — one logo rule (backend) | done, both apps — *also fixed two behaviour gaps in the by-name route* |
> | 3 — `components/Stars.tsx` | done, both apps |
> | 4 — `lib/logo.ts` | done, both apps |
> | 5 — `lib/managerName.ts` | done, both apps — *fixed a live bug, see below* |
> | B-1 — review limit bypass | done, both apps |
> | 6 — approval filter | **done differently.** The string substitution was rejected: all 39 sites sit in text blocks, many containing `%` for LIKE, so `.formatted()` corrupts them and concatenation makes 39 queries less readable. The intent — a surface cannot silently change which statuses it admits — was already met for 9 of 10 methods by `ApprovalStatusFilterIntegrationTest` and `CompanyListingIntegrationTest`. Closed the last gap with a guard test for `findManagersByCompanyId`. |
> | 7 — locked tile | **not done, deliberately.** `LockedManagerCard` blurs a real manager; `GhostManagerCard` invents fictional ones to pad the grid. Same markup, different jobs. Folding costs the ghost tiles their avatar colours and their `pointer-events-none`, and RMM's badge can read "Narrow search", so it is not even identical. Left as two. |
> | 8 — unused shadcn | deferred pending a look at why they were added |
> | B-2..B-7 | not started |

## Context

Today produced a run of bugs that all had one cause: the same UI existed in several
hand-written copies, and fixes landed in some copies and not others.

- The "hide zero counts" rule had to be applied **three times** (companies directory,
  industry profile, group grid) because there were three copies of the company tile.
- BlackBerry QNX showed its logo on its own page and a bare letter **"B"** in its parent's
  group list, with no review count, because that copy read `companies.logo_url` only while
  every other surface resolved `stats_logo_url → logo_url → resolver`.
- `ManagerCard.tsx` already carries a comment recording the same class of bug:
  *"this file kept its own [copy], which is how it ended up being the one surface that
  awarded the badge off a single five-star review."*

Two extractions are already done and green (`CompanyTile`, and `ManagerCard` gaining a `to`
prop so `CompanyProfile` stops hand-rolling manager tiles). This plan covers what is left.

**Out of scope:** the resume builder (user's decision), and the Werkpages/RMM fork
duplication (separate, much larger question — see Appendix).

## What is duplicated, measured

| # | Cluster | Copies | Size | Demonstrated cost |
|---|---|---|---|---|
| 1 | Helpers orphaned by today's extraction | 4 defs in 2 files | ~40 lines | dead code right now |
| 2 | Backend logo precedence written inline | 7 sites | ~35 lines | **caused the QNX letter-B bug** |
| 3 | Star / locked-star primitives | 10 defs across 8 files | ~120 lines | star size and colour already differ per surface |
| 4 | `logo.dev` publishable token hardcoded | 4 core files | — | key cannot be rotated; no single place to add a referrer lock |
| 5 | `validateManagerName` + fake-name lists | 2 copies | ~54 lines | /find and the company page can diverge on what a valid name is |
| 6 | `approval_status IN ('approved','ghost')` | 39 sites | — | the CLAUDE.md filter table is enforced by convention only |
| 7 | `GhostManagerCard` vs `LockedManagerCard` | 2 blurred-tile designs | ~60 lines | two different "locked" looks |
| 8 | Unused shadcn `ui/*` components | 36 files | 4,108 lines | dead weight only — no behaviour risk |

## Plan

Ordered by demonstrated cost, not by size. Each phase is independently shippable and
verified by suites that already exist.

### Phase 1 — Delete what is already dead (no behaviour change)

Today's `CompanyTile` extraction orphaned four local helpers:

- `client/pages/Companies.tsx` — `StarRating`, `LockedStars` (defined, used 0×)
- `client/pages/IndustryProfile.tsx` — `StarRating`, `LockedStars` (defined, used 0×)

Delete them. Verified by `companies.spec.ts` (41 tests) and `industry-profile.spec.ts` (6).

### Phase 2 — One logo resolution rule (backend)

`bestCompanyLogo(row, name)` already exists in `ManagerService.java` — added today for the
group tiles. Seven other sites still inline the same
`stats → stored → resolver` precedence, including `getCompanyBySlug` and
`getCompanyProfile`.

Collapse all of them onto the helper. This is the cluster that produced a user-visible bug,
so it goes before the cosmetic ones.

- `Api/src/main/java/org/werkpages/service/ManagerService.java` (majority of sites)
- `Api/src/main/java/org/werkpages/service/IndustryService.java`

Verified by the existing company/industry integration tests plus the two group-logo tests
added today in `CompanyMergeDataLossIntegrationTest`.

### Phase 3 — One star primitive

Create `client/components/Stars.tsx` exporting `Stars` and `LockedStars`, taking `rating`
and an optional `size`. Replace the remaining definitions in:

`CompanyTile.tsx`, `CompanyProfile.tsx` (`StarDisplay`), `Industries.tsx`,
`CareerTimeline.tsx`, `AddInterview.tsx`

**Leave `client/components/StarRating.tsx` alone** — despite the name it is an *input*
(takes `value`/`onChange`), not a display, and is correctly separate.

### Phase 4 — One logo.dev entry point

Move the token to `client/lib/logo.ts` alongside a `logoDevUrl(company, logoUrl?)` helper.
Four core files hardcode `pk_MXSjJV-uTC6-L5D_FbXZUA`: `ManagerCard.tsx`,
`CompanyAutocomplete.tsx`, `CareerTimeline.tsx`, `BossProfile.tsx`.

This is what makes the outstanding quota work possible — rotating the key or adding a
referrer restriction currently means editing four files and hoping none were missed.

### Phase 5 — One name validator

`validateManagerName` and the `FAKE_NAME_PARTS` / `FAKE_FULL_NAMES` sets are copied in
`client/pages/CompanyProfile.tsx` and `client/components/FindManagerForm.tsx`. Move to
`client/lib/managerName.ts` (sits beside the existing `client/lib/interviews.ts`, which has
its own unit spec — the same pattern applies here).

### Phase 6 — Name the approval filter (backend)

39 sites spell out `approval_status IN ('approved','ghost')`. CLAUDE.md holds the
authoritative table of which surface admits which statuses, but nothing enforces it.

Introduce named SQL fragments (`PUBLIC_STATUSES`, `PENDING_STATUSES`, `ADMIN_QUEUE_STATUSES`)
in the repositories so a surface's filter is stated once and referenced by name. **Mechanical
substitution only — no filter changes.** The CLAUDE.md table stays authoritative.

### Phase 7 — One locked tile

`GhostManagerCard` (in `CompanyProfile.tsx`) and `LockedManagerCard` both render a blurred
placeholder tile with a "Rate to unlock" badge, with different markup. Fold the ghost variant
into `LockedManagerCard` behind a prop.

Lowest priority: both are already visually close and neither has produced a bug.

### Phase 8 — Unused shadcn components (optional)

36 files, 4,108 lines in `client/components/ui/` are never imported (`sidebar` 769,
`chart` 363, `carousel` 260, `menubar` 234…). Pure dead weight, zero behaviour risk.

Only worth doing if you consider them noise rather than a kit you may draw on later.

## Verification

No new test infrastructure needed — the existing suites already cover every surface touched.

Per phase:

```
# frontend, from /home/noragrats/code-workspace/Werkpages/werkpages
pnpm build:client
npx playwright test companies industry-profile company-manager-tiles company-group \
                   find-manager directory --project=chromium

# backend, from RateMyManagerBackend/WerkpagesBackend/WerkpagesBackend
mvn verify -DskipITs=false -pl Api -am
```

Then the full sweep before shipping:

```
npx playwright test --project=chromium     # expect 790 passed
mvn verify -DskipITs=false -pl Api -am     # expect 404 unit / 999 IT
```

**Known pre-existing failures, unrelated to this work** — do not treat as regressions:
- Werkpages: 14 Mobile Chrome failures (tests assume desktop layout), 1 `find-manager`
  flake (strict-mode collision with an open autocomplete dropdown, ~1 in 3).
- RMM: 14 Auth0/Turnstile failures — RMM has no `.env`, so `VITE_AUTH0_*` is unset at
  build time and the social-login elements never render.

The bar for each phase is **the existing tests pass unchanged**. That is what proves an
extraction preserved behaviour rather than quietly redefining it — the same check that
validated `CompanyTile` (56 tests) and `ManagerCard` (112 tests) today.

## Appendix — the larger duplication, deliberately not in scope

Werkpages and RMM are forks sharing one database, and near-identical backend files:

| File | Werkpages | RMM | Differing lines |
|---|---|---|---|
| `ReviewRepository.java` | 419 | 419 | **0** |
| `AdminService.java` | 789 | 787 | 14 |
| `ManagerRepository.java` | 983 | 980 | 27 |
| `ManagerService.java` | 2,590 | 2,534 | 74 |
| `CompanyRepository.java` | 1,261 | 1,101 | 228 |

Roughly 6,000 lines duplicated at 95–100% similarity. Every backend fix today had to be
written twice, and the mirroring has slipped before.

This is a real problem and a much bigger one — a shared module, published artifact, or
monorepo. Worth planning separately; noted here so the scale is on record.


---

# Werkpages backend inventory

10,026 lines across 33 files. Smaller than the client, and the duplication is less about markup
than about **rules restated in several places, where one copy has learned something the others
have not.**

## What is duplicated

| # | Cluster | Copies | Demonstrated cost |
|---|---|---|---|
| B1 | Daily-limit + cooldown enforcement | 4 sites | **one copy is bypassable — see below** |
| B2 | `countSubmittedTodayByUser` | 4 repositories | 3 naive, 1 correct |
| B3 | `approval_status IN ('approved','ghost')` | 39 sites | CLAUDE.md table enforced by convention only |
| B4 | Soft-delete + deletions-table + cooldown | 2 repositories | Review and Interview solved it separately |
| B5 | Per-field length / blank validation written inline | 136 `badRequest` calls, 18 "too long" | a field's rules live wherever it is read |
| B6 | `isBlank`, `getEnv` | 2 each | trivial, but genuinely copied |
| B7 | Row→JSON shaping | 11 methods across 5 services | no shared shape for a manager or a company |

`ManagerService.java` is 2,587 lines and holds most of it.

## B1 — the one that is a bug, not just duplication

Four places enforce "N submissions per day, then a 30-day cooldown": managers
(`ManagerService:853`), reviews (`:1164`), edits (`:1868`), interviews
(`InterviewService:82`). They have drifted in two ways.

**The limit is a magic number in three of four.** `>= 6` appears three times;
`InterviewService` has `private static final int DAILY_LIMIT = 3`. `plusDays(30)` is written
out twice.

**The review limit is refundable by deleting.** `ReviewRepository.countSubmittedTodayByUser`
counts `WHERE user_id = $1 AND created_at >= current_date AND deleted_at IS NULL`. Delete a
review and it stops counting, so the 6/day limit resets. The 30-day cooldown does **not** close
this — it is keyed per manager, so the loop is: review manager A, delete, review manager B,
delete, and so on without limit.

`InterviewRepository` already solved exactly this and wrote down why:

> *"Deleting clears user_id, so a deleted review is invisible to the query above. Counting
> today's deletions as well is what stops delete-and-resubmit refunding the day's allowance."*

The `review_deletions` table exists (V8/V10) and `ReviewRepository.recordDeletion` already
writes to it, so the same fix applies almost verbatim. Nothing new is needed.

**Recommended order:** fix the review count first (it is a live bypass), then unify all four
onto one helper with named limits, so the next lesson any one of them learns is learned by all.

## Suggested phases

- **B-1** Close the review-count bypass by counting `review_deletions`, mirroring
  `InterviewRepository`. Add an integration test that submits, deletes, and asserts the day's
  allowance did not reset.
- **B-2** One `RateLimit` helper taking a named daily limit and cooldown, used by all four sites.
  Replaces `>= 6` ×3 and `plusDays(30)` ×2.
- **B-3** Named approval-status fragments (Phase 6 above).
- **B-4** Fold the soft-delete/cooldown pair into one shared shape across Review and Interview.
- **B-5..B-7** Lower value: shared field validators, `isBlank`/`getEnv`, and splitting
  `ManagerService`. Worth doing only alongside work that already touches them.

## Verification

Same bar as the frontend — existing suites pass unchanged:

```
mvn verify -DskipITs=false -pl Api -am    # expect 404 unit / 999 IT
```

B-1 is the exception: it *changes* behaviour deliberately, so it needs a new test proving the
allowance no longer resets, and an existing-test review to check nothing depended on the refund.
