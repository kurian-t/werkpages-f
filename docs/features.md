# Werkpages — Feature Documentation

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authentication](#2-authentication)
3. [Manager Profiles](#3-manager-profiles)
4. [Reviews](#4-reviews)
5. [Edit Requests](#5-edit-requests)
6. [Reports](#6-reports)
7. [Notifications](#7-notifications)
8. [Admin Operations](#8-admin-operations)
9. [Security & Infrastructure](#9-security--infrastructure)
10. [Database Schema](#10-database-schema)
11. [Error Reference](#11-error-reference)

---

## 1. System Overview

**Frontend:** React + Vite (TypeScript), served via Nginx in Docker  
**Backend:** Java 21, Eclipse Vert.x (async/reactive), single-threaded event loop  
**API Spec:** OpenAPI 3.0.3 — routes registered via `OpenAPI3RouterFactory`  
**Database:** PostgreSQL 17, accessed via Vert.x reactive SQL client; schema managed by Flyway (V1–V10)  
**Authentication:** Auth0 (JWT-based)  
**Secrets:** AWS Secrets Manager  
**Infrastructure:** EC2 (backend + nginx), RDS (PostgreSQL), ECR (Docker images), deployed via GitHub Actions CI/CD  
**Production domain:** `werkpages.com`

---

## 2. Authentication

### Overview

Handles email/password registration and sign-in via Auth0's database connection, OAuth social login (Google, Facebook, Apple), session management via HttpOnly cookies, and account deletion.

### Endpoints

---

#### `GET /api/auth/check-username`

Checks if a username is available before registration.

**Auth required:** No

**Query parameters:**

| Parameter  | Type   | Required | Description         |
|------------|--------|----------|---------------------|
| `username` | string | Yes      | Username to check   |

**Response `200`:**
```json
{ "available": true }
```

**Errors:**
- `400` — `username` query parameter missing

---

#### `POST /api/auth/signup`

Registers a new user with email and password.

**Auth required:** No

**Request body:**

| Field            | Type   | Required | Validation                                                                       |
|------------------|--------|----------|----------------------------------------------------------------------------------|
| `email`          | string | Yes      | Valid email format; max 254 chars; must not be a disposable domain               |
| `username`       | string | Yes      | 3–30 characters                                                                  |
| `firstName`      | string | Yes      | Non-blank; max 50 chars                                                          |
| `lastName`       | string | Yes      | Non-blank; max 50 chars                                                          |
| `password`       | string | Yes      | 8–128 characters                                                                 |
| `turnstileToken` | string | Yes*     | Cloudflare Turnstile CAPTCHA token; required when `TURNSTILE_SECRET_KEY` is set  |

**Flow:**
1. Turnstile CAPTCHA verified
2. Username uniqueness checked in local DB
3. Auth0 `/dbconnections/signup` called with email, password, and user metadata
4. Auth0 returns an ID; backend prepends `"auth0|"` to form the `auth0_id`
5. User inserted into local `users` table

**Response `201`:**
```json
{ "id": "...", "email": "...", "username": "...", "firstName": "...", "lastName": "...", "createdAt": "..." }
```

**Errors:**
- `400` — missing fields, invalid email, email too long, disposable email (`"disposable_email"`), name too long, username length invalid, password length invalid, CAPTCHA missing or failed, `"registration_failed"` or `"invalid_password"` forwarded from Auth0
- `409` — `"username_taken"` or `"email_already_registered"`

**Assumption:** Disposable email blocking uses a hardcoded list of 200+ known domains (e.g. mailinator.com, guerrillamail.com, yopmail.com). Auth0 sends a verification email automatically; the account cannot be used until the email is verified — signin returns `403 "email_not_verified"` until verification is complete.

---

#### `POST /api/auth/signin`

Signs in with email or username and password.

**Auth required:** No

**Request body:**

| Field        | Type   | Required | Description                          |
|--------------|--------|----------|--------------------------------------|
| `identifier` | string | Yes      | Email address or username            |
| `password`   | string | Yes      | Account password                     |

**Flow:**
1. If `identifier` has no `@`, the backend looks up the associated email by username
2. Auth0 `/oauth/token` called with `grant_type: "password"`
3. Returned `access_token` decoded to extract `auth0Id`
4. User looked up in local DB
5. `auth_token` HttpOnly cookie set (24-hour lifetime)

**Response `200`:**
```json
{ "user": { "email": "...", "username": "...", "firstName": "...", "lastName": "...", "role": "user", "isBanned": false } }
```

**Errors:**
- `400` — missing credentials
- `401` — `"authentication_failed"` (invalid credentials or username not found)
- `403` — `"email_not_verified"`

---

#### `POST /api/auth/callback`

Exchanges an OAuth authorization code for a session (social login).

**Auth required:** No

**Request body:**

| Field         | Type   | Required | Description                    |
|---------------|--------|----------|--------------------------------|
| `code`        | string | Yes      | OAuth authorization code       |
| `redirectUri` | string | Yes      | OAuth redirect URI             |

**Flow:**
1. Auth0 `/oauth/token` called with `grant_type: "authorization_code"`
2. `id_token` decoded (preferred) or `access_token` for `auth0Id`
3. User profile fetched from Auth0 `/userinfo`
4. If user already exists in local DB: returns existing record
5. If new user: username auto-generated as `"user_"` + 8 random hex characters; user inserted into DB
6. `auth_token` cookie set using `id_token` if available, else `access_token`

**Response `200`:**
```json
{ "user": { ... }, "isNewUser": true }
```

**Errors:**
- `400` — missing `code` or `redirectUri`; social account did not share email (`"no_email"`)
- `401` — `"token_exchange_failed"`
- `403` — `"account_suspended"` (banned user)
- `409` — `"email_already_registered"` (email exists under an email/password account)

---

#### `GET /api/auth/me`

Returns the authenticated user's profile.

**Auth required:** Yes

**Response `200`:**
```json
{ "id": "...", "auth0Id": "...", "email": "...", "username": "...", "firstName": "...", "lastName": "...", "role": "user", "isBanned": false, "createdAt": "..." }
```

**Errors:**
- `401` — not authenticated
- `404` — user not found in local DB

---

#### `POST /api/auth/signout`

Signs out the current user.

**Auth required:** No

Clears the `auth_token` cookie by setting `Max-Age=0`.

**Response `200`:**
```json
{ "success": true }
```

---

#### `DELETE /api/auth/me`

Deletes the authenticated user's account.

**Auth required:** Yes

All reviews written by the user remain in the database but the `author` field is anonymized.

**Response `200`:**
```json
{ "success": true, "message": "Account deleted and reviews anonymized" }
```

**Errors:**
- `401` — not authenticated
- `404` — user not found

---

#### Cookie Properties

| Property   | Value                   |
|------------|-------------------------|
| Name       | `auth_token`            |
| HttpOnly   | Yes                     |
| Path       | `/`                     |
| Max-Age    | 86400 (24 hours)        |
| SameSite   | `Lax`                   |
| Secure     | Yes (production only)   |

---

## 3. Manager Profiles

### Overview

CRUD for manager profiles. All new submissions enter a `pending_approval` state and go live only after admin approval. Manager profiles capture current company and title, career history, an overall rating, and per-category rating averages aggregated from reviews.

### Endpoints

---

#### `GET /api/managers`

Returns a paginated, searchable list of approved manager profiles.

**Auth required:** No

**Query parameters:**

| Parameter | Type   | Required | Default | Constraints          |
|-----------|--------|----------|---------|----------------------|
| `limit`   | int    | No       | 20      | 1–100                |
| `offset`  | int    | No       | 0       | ≥ 0                  |
| `search`  | string | No       | —       | Max 100 chars; ILIKE match on manager name |
| `company` | string | No       | —       | Max 100 chars; ILIKE match on company |

**Response `200`:**
```json
{ "data": [...managers], "limit": 20, "offset": 0, "total": 150 }
```

Each manager object includes: `id`, `name`, `company`, `title`, `image`, `overallRating`, `reviews`, `bio`, `status`, `approvalStatus`, `categoryAverages`, `linkedinUrl`, `companyLogoUrl`, `createdAt`, `careerHistory`.

**Errors:**
- `400` — `search` or `company` exceeds 100 characters

**Notes:**
- The `company` parameter is used by the frontend Directory page's debounced company autocomplete: as the user types, the client calls this endpoint with `company=<input>&limit=20`, extracts the distinct company names from the results, and presents them as suggestions

---

#### `GET /api/managers/:id`

Returns a single manager profile.

**Auth required:** No (auth optional)

**Path parameters:**

| Parameter | Type | Description    |
|-----------|------|----------------|
| `id`      | long | Manager ID     |

**Business rules:**
- If `approval_status` is `pending_approval`: only the submitting user can view the profile; all others receive `404`
- If `approval_status` is `rejected`: returns `404` for everyone including the submitter; the submitter is informed via a notification containing the manager name, company, and rejection reason
- The response includes `hasReported: boolean` indicating whether the authenticated user has already reported this manager

**Errors:**
- `400` — invalid ID format
- `404` — not found, or pending/rejected profile accessed by non-submitter

---

#### `GET /api/managers/similar`

Returns approved managers matching a name and optional company. Used in two places: duplicate detection on the Add Manager page (passes both `name` and `company`), and the admin Merge Duplicates tab (passes `name` only).

**Auth required:** No

**Query parameters:**

| Parameter | Type   | Required | Description                         |
|-----------|--------|----------|-------------------------------------|
| `name`    | string | Yes      | Name to search (ILIKE)              |
| `company` | string | No       | Company to narrow the match (ILIKE) |

**Response `200`:**
```json
{ "data": [{ "id": 1, "name": "...", "company": "...", "title": "...", "overallRating": 4.2, "companyLogoUrl": "...", "approvalStatus": "approved" }] }
```

**Errors:**
- `400` — `name` is blank

---

#### `GET /api/companies`

Returns up to 100 distinct company names for approved managers, sorted alphabetically.

**Auth required:** No

**Response `200`:**
```json
{ "data": ["Acme Corp", "Big Tech Inc", ...] }
```

**Notes:**
- Hard-capped at 100 results regardless of how many distinct companies exist
- The frontend Directory page company filter uses a debounced autocomplete backed by `GET /api/managers?company=...` (not this endpoint). This endpoint is available for other consumers that need the full distinct-company list

---

#### `GET /api/stats`

Returns site-wide counts.

**Auth required:** No

**Response `200`:**
```json
{ "totalManagers": 320, "totalReviews": 1540 }
```

Both counts are scoped to approved managers only.

---

#### `POST /api/managers`

Creates a new manager profile with an embedded first review.

**Auth required:** Yes

**Manager fields:**

| Field         | Type   | Required | Validation                                                                       |
|---------------|--------|----------|----------------------------------------------------------------------------------|
| `name`        | string | Yes      | Non-blank; max 100 chars                                                         |
| `company`     | string | Yes      | Non-blank; max 100 chars                                                         |
| `title`       | string | Yes      | Non-blank; max 100 chars                                                         |
| `image`       | string | Yes      | Single character (used as avatar initial)                                        |
| `bio`         | string | No       | Max 1000 chars                                                                   |
| `status`      | string | No       | `"active"` or `"retired"`; defaults to `"active"`                               |
| `linkedinUrl` | string | No       | Max 500 chars; must start with `https://www.linkedin.com/` or `https://linkedin.com/` |
| `startDate`   | string | Yes      | Format `"YYYY-MM"`; must not be in the future                                    |
| `endDate`     | string | Cond.    | Required if `status = "retired"`; format `"YYYY-MM"`; not in the future; ≥ `startDate` |

**Embedded review fields:**

| Field            | Type   | Required | Validation                                                    |
|------------------|--------|----------|---------------------------------------------------------------|
| `overallRating`  | double | Yes      | 1.0–5.0                                                       |
| `ratings`        | object | Yes      | 10 category keys, each 1.0–5.0 (see rating categories below) |
| `managerCompany` | string | Yes      | Max 100 chars                                                 |
| `managerTitle`   | string | Yes      | Max 100 chars                                                 |
| `text`           | string | No       | Max 2000 chars                                                |
| `workedFrom`     | string | Yes      | Format `"YYYY-MM"`; not in the future; not before `startDate` |
| `workedUntil`    | string | No       | Format `"YYYY-MM"`; not in the future; not before `workedFrom`; required if `status = "retired"` |
| `authorType`     | string | No       | `"username"`, `"real_name"`, or `"anonymous"`                 |
| `author`         | string | No       | Display name; max 100 chars; falls back to username if blank or exceeds limit |

**Business rules:**
- Caller must not be banned
- Max 6 manager submissions per user per day
- Manager is created with `approval_status = "pending_approval"` and is only visible to the submitter until approved
- A `career_history` entry is automatically created matching the submitted company, title, and dates
- After the transaction, manager ratings are recalculated asynchronously
- Company logo is resolved automatically from `CompanyLogoUtils`

**Response `201`:** Full manager object with `careerHistory: []`

**Errors:**
- `400` — validation failure
- `401` — not authenticated
- `403` — `"account_suspended"`
- `429` — `"daily_limit_reached"` or rate limit

---

#### `PUT /api/managers/:id`

Partially updates a manager profile.

**Auth required:** Yes

**Request body (all optional, at least one required):**

| Field         | Type   | Validation                                                         |
|---------------|--------|--------------------------------------------------------------------|
| `company`     | string | 1–100 chars                                                        |
| `title`       | string | 1–100 chars                                                        |
| `image`       | string | Single character                                                   |
| `bio`         | string | Max 1000 chars                                                     |
| `status`      | string | `"active"` or `"retired"`                                          |
| `linkedinUrl` | string | Max 500 chars; valid linkedin.com URL                              |
| `startDate`   | string | Format `"YYYY-MM"`; used for career history tracking on change     |

**Business rules:**
- Caller must not be banned
- If `company` or `title` changes: the current open `career_history` entry is closed (sets `end_date = now()`); a new entry is created for the new company/title
- Company logo is re-resolved when company changes

**Response `200`:** Updated manager object with `careerHistory` array

**Errors:**
- `400` — validation failure, or no fields provided
- `401` — not authenticated
- `403` — `"account_suspended"`
- `404` — manager not found

---

#### Rating Categories

The 10 rating categories used in both reviews and manager aggregates:

| Key                              | Label                         |
|----------------------------------|-------------------------------|
| `communicationStyle`             | Communication Style           |
| `perceivedApproachability`       | Approachability               |
| `perceivedClarityOfExpectations` | Clarity of Expectations       |
| `feedbackStyle`                  | Feedback Style                |
| `perceivedSupportiveness`        | Supportiveness                |
| `decisionMakingStyle`            | Decision Making               |
| `organizationAndPlanningStyle`   | Organization & Planning       |
| `delegationStyle`                | Delegation                    |
| `perceivedProfessionalDemeanor`  | Professional Demeanor         |
| `overallWorkingExperience`       | Overall Working Experience    |

---

## 4. Reviews

### Overview

Authenticated users can submit reviews for manager profiles. Reviews capture ratings across 10 categories, the company and title the manager held at the time, and the dates the reviewer worked under that manager. Complex business rules prevent duplicate or conflicting reviews.

### Endpoints

---

#### `POST /api/managers/:id/reviews`

Submits a new review for a manager.

**Auth required:** Yes

**Request body:**

| Field              | Type   | Required | Validation                                                                 |
|--------------------|--------|----------|----------------------------------------------------------------------------|
| `overallRating`    | double | Yes      | 1.0–5.0                                                                    |
| `ratings`          | object | Yes      | 10 category keys, each 1.0–5.0                                             |
| `managerCompany`   | string | Yes      | Max 100 chars                                                              |
| `managerTitle`     | string | Yes      | Max 100 chars                                                              |
| `text`             | string | No       | Max 2000 chars                                                             |
| `workedFrom`       | string | Yes      | Format `"YYYY-MM"`; not in the future                                      |
| `workedUntil`      | string | No       | Format `"YYYY-MM"`; not in the future; not before `workedFrom`             |
| `managerRoleStart` | string | No       | Format `"YYYY-MM"`; not in the future; `workedFrom` must not be before it  |
| `managerRoleEnd`   | string | No       | Format `"YYYY-MM"`; ≥ `managerRoleStart`; `workedFrom` and `workedUntil` must not exceed it |
| `authorType`       | string | No       | `"username"`, `"real_name"`, or `"anonymous"`                              |
| `author`           | string | No       | Max 100 chars; falls back to username if blank or over limit               |

**Business rules (enforced in order):**

1. Caller must not be banned
2. **Daily cap:** max 6 reviews per user per day → `429 "daily_limit_reached"`
3. **Cooldown:** if the user deleted a prior review for this manager, a 30-day cooldown applies → `409 "review_cooldown:YYYY-MM-DD"`
4. **Per-manager cap:** max 5 reviews per user per manager → `409 "role_limit_reached"`
5. **Role uniqueness:** one review per user per manager per role (normalized `LOWER(TRIM(title))` + `LOWER(TRIM(company))`) → `409 "already_reviewed_this_role"`
6. **Manager role period overlap:** if `managerRoleStart` is provided, no two reviews for the same user+manager may have overlapping role periods → `409 "manager_role_overlap:{title}:{company}:{start}:{end|present}"`
7. Manager's `company`, `title`, and `companyLogoUrl` are always resynced within the same transaction to the most-current review across **all** reviews for this manager (null `workedUntil` wins; tiebreak by latest `workedFrom`)
8. Manager ratings recalculated asynchronously after commit

**Response `201`:** Full review object

**Errors:**
- `400` — validation failure
- `401` — not authenticated
- `403` — `"account_suspended"`
- `404` — manager not found
- `409` — conflict codes listed above
- `429` — daily limit or rate limit

---

#### `GET /api/managers/:id/reviews`

Returns reviews for a manager.

**Auth required:** No

**Query parameters:**

| Parameter | Type   | Default | Constraints       |
|-----------|--------|---------|-------------------|
| `limit`   | int    | 50      | Max 200           |
| `offset`  | int    | 0       | ≥ 0               |
| `sortBy`  | string | `recent` | —                |
| `userId`  | UUID   | —       | Filter to specific user |

**Response `200`:**
```json
{ "data": [...reviews], "total": 12, "limit": 50, "offset": 0 }
```

---

#### `GET /api/managers/:id/career-segments`

Returns aggregated career segments derived from reviews, paginated.

**Auth required:** No

Each segment groups reviews by company and role and calculates per-segment rating averages.

**Query parameters:**

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `limit`   | int  | No       | 20      | 1–50        |
| `offset`  | int  | No       | 0       | ≥ 0 (negative values normalised to 0) |

**Response `200`:**
```json
{
  "data": [{
    "company": "Acme Corp",
    "role": "Engineering Manager",
    "startDate": "2020-01",
    "endDate": "2022-06",
    "isCurrent": false,
    "averageRating": 3.8,
    "reviewCount": 4,
    "categoryAverages": { ... },
    "managerRoleStart": "2020-01",
    "managerRoleEnd": "2022-06"
  }],
  "total": 3,
  "limit": 20,
  "offset": 0
}
```

Category averages are rounded to 1 decimal place.

---

#### `PUT /api/managers/:managerId/reviews/:reviewId`

Updates an existing review owned by the caller.

**Auth required:** Yes

Same fields and validation as `POST /api/managers/:id/reviews`, with these differences:
- Role uniqueness check excludes the review being updated
- Manager role period overlap check excludes the review being updated
- Daily cap is not re-enforced (editing is not a new submission)
- Cooldown check is not re-enforced

**Response `200`:** Updated review object

**Errors:**
- `400` — validation failure
- `401` — not authenticated
- `403` — `"account_suspended"` or review not owned by caller
- `404` — review not found
- `409` — conflict

---

#### `DELETE /api/managers/:managerId/reviews/:reviewId`

Deletes a review owned by the caller.

**Auth required:** Yes

**Business rules:**
- A deletion record is written to `review_deletions`, triggering a 30-day cooldown before the user can re-review this manager
- Manager ratings recalculated asynchronously after deletion

**Response `200`:**
```json
{ "success": true, "message": "Review deleted" }
```

**Errors:**
- `401` — not authenticated
- `403` — `"account_suspended"` or review not owned by caller
- `404` — review not found

---

#### `POST /api/managers/:managerId/reviews/:reviewId/replace`

Deletes an existing review and immediately creates a replacement. Used when a user wants to substantially rewrite their review.

**Auth required:** Yes

**Request body:** Same fields as `POST /api/managers/:id/reviews`

**Business rules:**
- The deleted review does **not** trigger a cooldown entry (unlike a standalone delete)
- Full review validation is run **before** the old review is deleted — an invalid request body returns `400` and the original review is preserved
- Daily cap and cooldown checks are still enforced
- After the replacement is inserted, the manager's `company`, `title`, and `companyLogoUrl` are always resynced to reflect whichever review is now the most current (determined by `workedUntil = NULL` first, then latest `workedFrom`). This means if the replacement has earlier dates and another reviewer's review is now the most current, the manager profile reflects that other review's company and title

**Response `200`:**
```json
{ "success": true }
```

**Errors:** Same as `POST /api/managers/:id/reviews`; also `404` if the review to replace does not exist or is not owned by the caller

---

#### `GET /api/users/me/reviews`

Returns reviews written by the authenticated user, paginated.

**Auth required:** Yes

**Query parameters:**

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `limit`   | int  | No       | 50      | 1–50 (capped; was previously uncapped at 500) |
| `offset`  | int  | No       | 0       | ≥ 0 (negative values normalised to 0) |

**Response `200`:**
```json
{
  "data": [{
    "id": "...",
    "managerName": "...",
    "managerImage": "...",
    "managerStatus": "active",
    "managerRoleStart": "...",
    "managerRoleEnd": null,
    ...
  }],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

The frontend Account Settings page uses this endpoint with infinite scroll — the first 50 reviews load on arrival and additional pages are fetched as the user scrolls.

---

## 5. Edit Requests

### Overview

Community members can propose changes to existing manager profiles. Proposals enter a queue and are applied only after admin approval. At most one pending edit per user per manager is allowed at any time — submitting again overwrites the previous pending proposal.

### Endpoints

---

#### `POST /api/managers/:id/edit-requests`

Submits a proposed change to a manager profile.

**Auth required:** Yes

**Request body (at least one field required):**

| Field         | Type   | Validation                         |
|---------------|--------|------------------------------------|
| `company`     | string | Max 100 chars                      |
| `title`       | string | Max 100 chars                      |
| `status`      | string | `"active"` or `"retired"`          |
| `linkedinUrl` | string | Max 500 chars                      |
| `startDate`   | string | Format `"YYYY-MM"`                 |
| `endDate`     | string | Format `"YYYY-MM"`                 |

**Business rules:**
- Caller must not be banned
- Max 6 edit requests per user per day
- Manager must exist
- If the user already has a pending edit for this manager, the existing record is updated (UPSERT)

**Response `201`:**
```json
{ "id": "...", "managerId": 1, "newCompany": "...", "newTitle": "...", "newStatus": "...", "newLinkedinUrl": "...", "status": "pending", "createdAt": "..." }
```

**Errors:**
- `400` — no fields provided, validation failure
- `401` — not authenticated
- `403` — `"account_suspended"`
- `404` — manager not found
- `429` — daily limit or rate limit

---

#### `GET /api/managers/:id/pending-edits`

Returns the authenticated user's own pending edit for a manager, if one exists.

**Auth required:** No (returns empty array if unauthenticated)

**Response `200`:**
```json
{ "data": [{ "id": "...", "newCompany": "...", "newTitle": "...", "newStatus": "...", "newLinkedinUrl": "...", "createdAt": "..." }] }
```

---

## 6. Reports

### Overview

Users can flag a manager profile for admin review. Anonymous (unauthenticated) reports are accepted. Authenticated users may only report a given manager once.

### Endpoints

---

#### `POST /api/managers/:id/report`

Reports a manager profile.

**Auth required:** Yes (auth0Id must be present; anonymous reports accepted via null user lookup)

**Request body:**

| Field     | Type   | Required | Validation                                                                                                  |
|-----------|--------|----------|-------------------------------------------------------------------------------------------------------------|
| `reason`  | string | Yes      | One of: `incorrect_person`, `never_worked_here`, `duplicate_profile`, `incorrect_information`, `other`      |
| `comment` | string | No       | Max 500 chars                                                                                               |

**Business rules:**
- If the caller's `auth0Id` resolves to a user in the DB: duplicate reports are blocked (`409`)
- If the caller's `auth0Id` does not resolve to a user in the DB: report is recorded with `user_id = NULL` (treated as anonymous)
- Anonymous reports have no duplicate restriction — the same manager can be reported multiple times without an account

**Response `201`:**
```json
{ "success": true, "reportId": "...", "createdAt": "..." }
```

**Errors:**
- `400` — missing or invalid reason, comment too long
- `404` — manager not found
- `409` — `"already_reported"` (authenticated user only)

---

## 7. Notifications

### Overview

In-app notifications inform users of actions taken on their submissions or account. Notifications are created server-side as a side effect of admin operations. Creation is fire-and-forget (async); the user-facing read operations are synchronous.

### When Notifications Are Sent

| Event                        | Recipient        | Type                | Title                      |
|------------------------------|------------------|---------------------|----------------------------|
| Manager approved             | Submitter        | `manager_approved`  | Manager Approved           |
| Manager rejected             | Submitter        | `manager_rejected`  | Manager Not Approved — message includes manager name, company, and rejection reason if provided |
| Edit request approved        | Proposer         | `review_accepted`   | Edit Request Approved      |
| Edit request rejected        | Proposer         | `review_rejected`   | Edit Request Rejected      |
| User banned                  | Banned user      | `user_banned`       | Account Suspended          |

Notifications with type `manager_approved` or `review_accepted` include a `managerId` field linking to the relevant profile.

### Endpoints

---

#### `GET /api/notifications`

Returns all notifications for the authenticated user.

**Auth required:** Yes

**Response `200`:**
```json
{ "data": [{ "id": "...", "type": "manager_approved", "title": "Manager Approved", "message": "...", "read": false, "createdAt": "...", "managerId": 42 }] }
```

`managerId` is only present when applicable.

**Errors:**
- `401` — user not found

---

#### `GET /api/notifications/unread-count`

Returns the count of unread notifications.

**Auth required:** Yes

**Response `200`:**
```json
{ "unreadCount": 3 }
```

**Errors:**
- `401` — user not found

---

#### `PUT /api/notifications/read-all`

Marks all notifications as read.

**Auth required:** Yes

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `401` — user not found

---

#### `PUT /api/notifications/:id/read`

Marks a single notification as read.

**Auth required:** Yes

**Path parameters:**

| Parameter | Type | Description      |
|-----------|------|------------------|
| `id`      | UUID | Notification ID  |

**Business rules:** Only the owning user's notifications are marked. Attempting to mark another user's notification is silently ignored.

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
- `400` — invalid UUID
- `401` — user not found

---

## 8. Admin Operations

### Overview

Admin-only endpoints for reviewing manager submissions, processing edit requests, managing user bans, and merging duplicate profiles. All endpoints verify that the caller has `role = "admin"` in the database in addition to a valid JWT.

**Auth required:** Yes (admin role enforced on all endpoints below)

### Errors common to all admin endpoints

- `401` — not authenticated
- `403` — authenticated but not an admin

---

### Manager Approval

#### `GET /api/admin/pending-managers`

Returns paginated pending manager submissions.

**Query parameters:** `limit` (default 50, max 200), `offset` (default 0)

**Response `200`:**
```json
{ "data": [{ "id": 1, "name": "...", "company": "...", "title": "...", "image": "...", "submittedBy": "username", "createdAt": "..." }], "limit": 50, "offset": 0 }
```

---

#### `POST /api/admin/pending-managers/:managerId/approve`

Approves a pending manager submission.

**Business rules:**
- Sets `approval_status = "approved"`
- Backfills company logo if not already set
- Sends `manager_approved` notification to the submitter (async)

**Response `200`:** `{ "success": true, "message": "Manager approved" }`

**Errors:** `404` — pending manager not found

---

#### `POST /api/admin/pending-managers/:managerId/reject`

Rejects a pending manager submission.

**Request body:**

| Field    | Type   | Required | Description                               |
|----------|--------|----------|-------------------------------------------|
| `reason` | string | No       | Optional explanation included in notification |

**Business rules:**
- Sets `approval_status = "rejected"`
- Sends `manager_rejected` notification to the submitter (async); reason appended if provided

**Response `200`:** `{ "success": true }`

**Errors:** `404` — pending manager not found

---

### Edit Request Processing

#### `GET /api/admin/pending-edits`

Returns paginated pending edit requests.

**Query parameters:** `limit` (default 50, max 200), `offset` (default 0)

**Response `200`:**
```json
{
  "data": [{
    "id": "...",
    "managerId": 1,
    "managerName": "...",
    "currentCompany": "...",
    "currentTitle": "...",
    "requestedBy": "username",
    "newCompany": "...",
    "newTitle": "...",
    "status": "pending",
    "createdAt": "..."
  }]
}
```

---

#### `POST /api/admin/pending-edits/:editId/approve`

Approves and applies an edit request.

**Business rules:**
1. Current open `career_history` entry is closed (`end_date = now()`)
2. If no open entry existed: the manager's original company/title is archived as a historical entry
3. A new `career_history` entry is created for the new company/title
4. Manager profile fields are updated
5. Edit status set to `"approved"`
6. Company logo updated if company changed
7. Sends `review_accepted` notification to the proposer (async), including `manager_id`

**Response `200`:** `{ "success": true, "message": "Edit approved and applied", "managerId": 1, "newCompany": "..." }`

**Errors:** `404` — edit not found; `409` — edit not in `"pending"` status

---

#### `POST /api/admin/pending-edits/:editId/reject`

Rejects an edit request.

**Business rules:**
- Edit status set to `"rejected"`
- Sends `review_rejected` notification to the proposer (async)

**Response `200`:** `{ "success": true }`

**Errors:** `404` — edit not found

---

### User Management

#### `GET /api/admin/users`

Returns a paginated list of non-admin users.

**Query parameters:** `limit` (default 50, max 200), `offset` (default 0)

**Response `200`:**
```json
{ "data": [{ "id": "...", "username": "...", "firstName": "...", "lastName": "...", "isBanned": false }] }
```

---

#### `GET /api/admin/banned-users`

Returns a paginated list of banned users.

**Query parameters:** `limit` (default 50, max 200), `offset` (default 0)

**Response `200`:**
```json
{ "data": [{ "id": "...", "userId": "...", "username": "...", "reason": "...", "bannedBy": "adminUsername", "bannedAt": "..." }] }
```

---

#### `POST /api/admin/users/:userId/ban`

Bans a user.

**Path parameters:** `userId` (UUID)

**Request body:**

| Field    | Type   | Required | Validation         |
|----------|--------|----------|--------------------|
| `reason` | string | Yes      | Non-blank; max 500 chars |

**Business rules:**
- User must not already be banned
- Sends `user_banned` notification to the user (async); reason and appeal email (`contact@werkpages.com`) included in message

**Response `201`:** `{ "success": true }`

**Errors:** `400` — missing or too-long reason; `409` — user is already banned

---

#### `DELETE /api/admin/users/:userId/ban`

Removes a ban.

**Path parameters:** `userId` (UUID)

**Response `200`:** `{ "success": true }`

**Errors:** `404` — ban not found

---

### Manager Merge

#### `POST /api/admin/managers/:keepId/merge/:mergeId`

Merges two manager profiles, keeping one and deleting the other.

**Path parameters:** `keepId` (long), `mergeId` (long)

**Business rules:**
1. `keepId` and `mergeId` must be different
2. Both managers must exist
3. All reviews from `mergeId` are moved to `keepId`
4. All remaining data for `mergeId` is deleted
5. `mergeId` manager record is deleted
6. `keepId` manager's overall rating and category averages are recalculated inline

**Response `200`:** `{ "success": true, "keepId": 1 }`

**Errors:** `400` — same ID; `404` — one or both managers not found

---

## 9. Security & Infrastructure

### Authentication Flow

- Auth0 issues JWT access tokens and ID tokens
- Backend validates tokens using JWKS fetched from Auth0 at startup
- Tokens accepted via `Authorization: Bearer <token>` header or `auth_token` HttpOnly cookie
- On validation: the `auth0Id` (JWT subject claim) is extracted and passed to handlers

### Role Enforcement

- `role` is stored in the local `users` table (`"user"` or `"admin"`)
- Admin access: `AdminService.requireAdmin()` looks up the caller by `auth0Id` and checks `role = "admin"` in the DB
- Returns `401` if `auth0Id` is null; `403` if the user is not an admin
- Frontend admin page also redirects non-admin users client-side as a UX layer (not a security boundary)

### Ban Enforcement

- Checked via `UserRepository.findByAuth0IdWithBan()` which JOINs the `banned_users` table
- Banned users receive `403 "account_suspended"` on any write operation (create manager, create review, edit request, etc.)
- Banned users can still read (GET) public data
- Frontend disables edit/delete buttons for banned users with visual indication

### Rate Limiting

Three independent sliding-window rate limiters, keyed per IP address:

| Limiter   | Limit             | Applied to                            |
|-----------|-------------------|---------------------------------------|
| Global    | 200 req/min       | All routes                            |
| Auth      | 10 req/min        | `POST /api/auth/*` only               |
| Write     | 30 req/min        | All POST, PUT, DELETE under `/api/*`  |

- IP resolution order: `CF-Connecting-IP` (Cloudflare) → `X-Forwarded-For` first entry → remote address
- Response: `429` with `{"error": "Too many requests. Please try again later."}` and `Retry-After` header
- Hard cap of 50,000 tracked IPs before eviction sweep

### Security Headers

Applied to all responses:

| Header                      | Value                                              |
|-----------------------------|----------------------------------------------------|
| `X-Content-Type-Options`    | `nosniff`                                          |
| `X-Frame-Options`           | `DENY`                                             |
| `X-XSS-Protection`          | `0`                                                |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                  |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (prod only)  |

### CORS

- Development origin: `http://localhost:8080`
- Production origins: `https://werkpages.com`, `https://www.werkpages.com`
- Allowed headers: `Authorization`, `Content-Type`, `Accept`, `Cookie`
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS
- Credentials: allowed

### Company Logo Resolution

A utility class (`CompanyLogoUtils`) maps known company names to logo URLs via the logo.dev API. Coverage includes ~100 companies: Canadian banks, major tech companies, consulting firms, telecoms, and large retailers. If a company is not in the map, the utility derives a best-effort domain as `{name}.com`. Logo resolution happens at the HTTP handler layer before reaching service logic.

---

## 10. Database Schema

### `users`

| Column       | Type                   | Notes                                    |
|--------------|------------------------|------------------------------------------|
| `id`         | UUID PK                | `uuid_generate_v4()`                     |
| `auth0_id`   | TEXT UNIQUE NOT NULL   |                                          |
| `email`      | TEXT UNIQUE NOT NULL   |                                          |
| `username`   | TEXT UNIQUE NOT NULL   |                                          |
| `first_name` | TEXT                   |                                          |
| `last_name`  | TEXT                   |                                          |
| `role`       | TEXT NOT NULL          | `CHECK IN ('user', 'admin')` default `'user'` |
| `created_at` | TIMESTAMPTZ            | Default `now()`                          |

---

### `managers`

| Column             | Type           | Notes                                                    |
|--------------------|----------------|----------------------------------------------------------|
| `id`               | BIGSERIAL PK   |                                                          |
| `name`             | TEXT NOT NULL  |                                                          |
| `company`          | TEXT NOT NULL  |                                                          |
| `title`            | TEXT NOT NULL  |                                                          |
| `image`            | TEXT           | Single character (avatar initial)                        |
| `overall_rating`   | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                                  |
| `reviews_count`    | INTEGER        | Default 0                                                |
| `bio`              | TEXT           |                                                          |
| `status`           | TEXT NOT NULL  | `CHECK IN ('active', 'retired')`                         |
| `linkedin_url`     | TEXT           |                                                          |
| `category_averages`| JSONB          |                                                          |
| `approval_status`  | VARCHAR(20)    | `CHECK IN ('pending_approval', 'approved', 'rejected')` default `'approved'` |
| `submitted_by`     | UUID FK        | References `users(id)` ON DELETE SET NULL                |
| `company_logo_url` | VARCHAR(500)   |                                                          |
| `external_id`      | TEXT UNIQUE    |                                                          |
| `created_at`       | TIMESTAMPTZ    |                                                          |
| `updated_at`       | TIMESTAMPTZ    |                                                          |

---

### `career_history`

| Column       | Type          | Notes                                              |
|--------------|---------------|----------------------------------------------------|
| `id`         | BIGSERIAL PK  |                                                    |
| `manager_id` | BIGINT FK     | References `managers(id)` ON DELETE CASCADE        |
| `company`    | TEXT NOT NULL |                                                    |
| `title`      | TEXT NOT NULL |                                                    |
| `start_date` | TIMESTAMPTZ   |                                                    |
| `end_date`   | TIMESTAMPTZ   | NULL = current; `CHECK end_date >= start_date`     |
| `created_at` | TIMESTAMPTZ   |                                                    |
| `updated_at` | TIMESTAMPTZ   |                                                    |

---

### `reviews`

| Column                              | Type           | Notes                                      |
|-------------------------------------|----------------|--------------------------------------------|
| `id`                                | UUID PK        |                                            |
| `manager_id`                        | BIGINT FK      | References `managers(id)` ON DELETE CASCADE |
| `user_id`                           | UUID FK        | References `users(id)` ON DELETE CASCADE   |
| `author`                            | TEXT NOT NULL  | Snapshot of display name at review time    |
| `overall_rating`                    | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `communication_style`               | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `perceived_approachability`         | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `perceived_clarity_of_expectations` | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `feedback_style`                    | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `perceived_supportiveness`          | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `decision_making_style`             | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `organization_and_planning_style`   | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `delegation_style`                  | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `perceived_professional_demeanor`   | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `overall_working_experience`        | NUMERIC(2,1)   | `CHECK BETWEEN 0 AND 5`                    |
| `manager_company`                   | TEXT NOT NULL  | Snapshot of manager's company at review time |
| `manager_title`                     | TEXT NOT NULL  | Snapshot of manager's title at review time |
| `text`                              | TEXT           | Optional free-text                         |
| `verified`                          | BOOLEAN        | Default false                              |
| `helpful_count`                     | INTEGER        | Default 0                                  |
| `worked_from`                       | DATE           |                                            |
| `worked_until`                      | DATE           | NULL = currently working                   |
| `manager_role_start`                | DATE           | Optional; when manager started this role   |
| `manager_role_end`                  | DATE           | Optional; NULL = still in role             |
| `created_at`                        | TIMESTAMPTZ    |                                            |
| `updated_at`                        | TIMESTAMPTZ    |                                            |

**Unique index:** `(user_id, manager_id, LOWER(TRIM(manager_title)), LOWER(TRIM(manager_company)))`

---

### `reports`

| Column       | Type           | Notes                                                                                       |
|--------------|----------------|---------------------------------------------------------------------------------------------|
| `id`         | UUID PK        |                                                                                             |
| `manager_id` | BIGINT FK      | References `managers(id)` ON DELETE CASCADE                                                 |
| `user_id`    | UUID FK        | References `users(id)` ON DELETE SET NULL; nullable (anonymous reports)                    |
| `reason`     | TEXT NOT NULL  | `CHECK IN ('incorrect_person', 'never_worked_here', 'duplicate_profile', 'incorrect_information', 'other')` |
| `comment`    | TEXT           |                                                                                             |
| `created_at` | TIMESTAMPTZ    |                                                                                             |

---

### `banned_users`

| Column      | Type          | Notes                                              |
|-------------|---------------|----------------------------------------------------|
| `id`        | UUID PK       |                                                    |
| `user_id`   | UUID FK       | References `users(id)` ON DELETE CASCADE; UNIQUE   |
| `reason`    | TEXT NOT NULL |                                                    |
| `banned_by` | TEXT NOT NULL | Username of the admin who issued the ban           |
| `banned_at` | TIMESTAMPTZ   |                                                    |

---

### `manager_edits`

| Column           | Type           | Notes                                              |
|------------------|----------------|----------------------------------------------------|
| `id`             | UUID PK        |                                                    |
| `manager_id`     | BIGINT FK      | References `managers(id)` ON DELETE CASCADE        |
| `proposed_by`    | UUID FK        | References `users(id)` ON DELETE CASCADE           |
| `new_company`    | TEXT           |                                                    |
| `new_title`      | TEXT           |                                                    |
| `new_status`     | VARCHAR(20)    |                                                    |
| `new_linkedin_url`| TEXT          |                                                    |
| `new_start_date` | TIMESTAMPTZ    |                                                    |
| `new_end_date`   | TIMESTAMPTZ    |                                                    |
| `status`         | TEXT NOT NULL  | `CHECK IN ('pending', 'approved', 'rejected')` default `'pending'` |
| `reviewed_at`    | TIMESTAMPTZ    |                                                    |
| `reviewed_by`    | UUID FK        | References `users(id)` ON DELETE SET NULL          |
| `created_at`     | TIMESTAMPTZ    |                                                    |

**Unique partial index:** `(manager_id, proposed_by) WHERE status = 'pending'` — enforces one pending edit per user per manager; enables UPSERT

---

### `notifications`

| Column       | Type           | Notes                                              |
|--------------|----------------|----------------------------------------------------|
| `id`         | UUID PK        |                                                    |
| `user_id`    | UUID FK        | References `users(id)` ON DELETE CASCADE           |
| `type`       | VARCHAR(50)    |                                                    |
| `title`      | TEXT NOT NULL  |                                                    |
| `message`    | TEXT NOT NULL  |                                                    |
| `read`       | BOOLEAN        | Default false                                      |
| `manager_id` | BIGINT FK      | References `managers(id)` ON DELETE SET NULL; optional |
| `created_at` | TIMESTAMPTZ    |                                                    |

---

### `review_deletions`

| Column       | Type        | Notes                                              |
|--------------|-------------|----------------------------------------------------|
| `id`         | UUID PK     |                                                    |
| `user_id`    | UUID FK     | References `users(id)` ON DELETE CASCADE           |
| `manager_id` | BIGINT FK   | References `managers(id)` ON DELETE CASCADE        |
| `deleted_at` | TIMESTAMPTZ | Default `now()`                                    |

Used to enforce the 30-day cooldown before a user can re-review a manager after deleting their review.

---

## 11. Error Reference

| Status | Description                                                                                          |
|--------|------------------------------------------------------------------------------------------------------|
| `400`  | Validation error — missing required field, invalid format, or value out of range                    |
| `401`  | Missing or invalid JWT / auth cookie; user not found in local DB after valid token                  |
| `403`  | Banned account (`"account_suspended"`); non-admin accessing an admin endpoint; email not verified   |
| `404`  | Resource not found; pending/rejected manager accessed by non-submitter                              |
| `409`  | Conflict — see table below                                                                           |
| `429`  | `"daily_limit_reached"` (business rule cap) or IP-based rate limit exceeded                         |
| `500`  | Unexpected server error                                                                              |

### `409` Conflict Codes

| `error` value                              | Meaning                                                  |
|--------------------------------------------|----------------------------------------------------------|
| `"already_reported"`                       | Authenticated user already reported this manager         |
| `"already_reviewed_this_role"`             | User already reviewed this manager at this company/title |
| `"role_limit_reached"`                     | User has reached the 5-review limit for this manager     |
| `"review_cooldown:YYYY-MM-DD"`             | 30-day cooldown active after deleting a review; date is when the cooldown expires |
| `"manager_role_overlap:{title}:{company}:{start}:{end\|present}"` | Submitted `managerRoleStart`/`managerRoleEnd` overlaps an existing review's role period |
| `"email_already_registered"`               | Email is already associated with an account              |
| `"username_taken"`                         | Username already in use                                  |
| `"User is already banned"`                 | Attempting to ban a user who is already banned           |
