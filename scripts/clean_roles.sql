-- clean_roles.sql
-- Extracts canonical job titles from messy manager_roles.job_title values,
-- deletes rows with no recognisable title, then deduplicates.

BEGIN;

-- ── Step 1: extract canonical title into a staging column ────────────────────

ALTER TABLE manager_roles ADD COLUMN IF NOT EXISTS _clean_title TEXT;

UPDATE manager_roles
SET _clean_title = (regexp_match(job_title,
  'Executive Vice President[[:space:]]+and[[:space:]]+(Chief Executive Officer|CEO)'
  '|Executive Vice President'
  '|Senior Vice President'
  '|Vice President'
  '|Chief Executive Officer'
  '|Chief Financial Officer'
  '|Chief Operating Officer'
  '|Chief Technology Officer'
  '|Chief Information Officer'
  '|Chief Marketing Officer'
  '|Chief Legal Officer'
  '|Chief Revenue Officer'
  '|Chief Risk Officer'
  '|Chief Human Resources Officer'
  '|Chief People Officer'
  '|Chief Data Officer'
  '|Chief Commercial Officer'
  '|Chief Administrative Officer'
  '|Chief Strategy Officer'
  '|Chief Scientific Officer'
  '|Chief Medical Officer'
  '|Chief Compliance Officer'
  '|Chief Accounting Officer'
  '|Chief Digital Officer'
  '|Chief Sustainability Officer'
  '|Chief Security Officer'
  '|Chief Product Officer'
  '|Chief Supply Chain Officer'
  '|Chief Transformation Officer'
  '|Chief Analytics Officer'
  '|Chief Business Officer'
  '|Chief Growth Officer'
  '|Chief Innovation Officer'
  '|Chief Investment Officer'
  '|Chief Procurement Officer'
  '|Chief Sales Officer'
  '|Chief[[:space:]]+[A-Za-z]+[[:space:]]+Officer'
  '|President[[:space:]]+and[[:space:]]+(Chief Executive Officer|CEO)'
  '|President[[:space:]]+and[[:space:]]+(Chief Operating Officer|COO)'
  '|President'
  '|CEO|CFO|COO|CTO|CIO|CMO|CLO|CHRO|CPO|CDO|CRO|CCO|CSO|CAO|CBO|CXO'
  '|Chairman of the Board'
  '|Chairman|Chairwoman|Chairperson'
  '|Chair'
  '|Managing Director|Executive Director|Independent Director'
  '|Director'
  '|General Counsel'
  '|Treasurer'
  '|Secretary',
  'i'
))[1];

-- ── Step 2: delete rows with no recognisable canonical title ─────────────────

DELETE FROM manager_roles WHERE _clean_title IS NULL;

-- ── Step 3: delete duplicate roles that now share the same canonical title ───
-- Keep the row with the lowest id (oldest insert) per (manager_id, company_name, canonical_title, source_url)

DELETE FROM manager_roles
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY manager_id, company_name, lower(_clean_title), source_url
             ORDER BY id
           ) AS rn
    FROM manager_roles
  ) ranked
  WHERE rn > 1
);

-- ── Step 4: apply the cleaned title and remove staging column ────────────────

UPDATE manager_roles SET job_title = _clean_title;

ALTER TABLE manager_roles DROP COLUMN _clean_title;

COMMIT;

-- ── Summary ──────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS total_roles FROM manager_roles;
SELECT job_title, COUNT(*) AS cnt
FROM manager_roles
GROUP BY job_title
ORDER BY cnt DESC
LIMIT 30;
