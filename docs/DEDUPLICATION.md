# Werkpages: de-duplicating the core product

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
