-- ============================================================
-- Werkpages — Delete All Seeded Data
-- ============================================================
-- Run this in your DB console when you want to remove seed data.
--
-- What it deletes:
--   • All managers tagged external_id LIKE 'seed_%'
--     (cascades to their reviews, career_history, reports)
--   • All seed user accounts tagged auth0_id LIKE 'seed|%'
--     (cascades to any remaining reviews, notifications, etc.)
--
-- Nothing else is touched.
-- ============================================================

BEGIN;

DELETE FROM managers WHERE external_id LIKE 'seed_%';
DELETE FROM users    WHERE auth0_id    LIKE 'seed|%';

COMMIT;
