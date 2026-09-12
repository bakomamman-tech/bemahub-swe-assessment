-- 002_fix_withdrawal_reference.sql
-- Fix withdrawal idempotency uniqueness.
--
-- The original unique key included cancelled_at, which is nullable.
-- MySQL permits multiple NULL values in a UNIQUE key, so duplicate
-- payout references could be inserted while cancelled_at was NULL.
--
-- Before replacing the index, remove duplicate references deterministically,
-- keeping the earliest row for each instructor/reference pair.

DELETE newer
FROM wp_bl_withdrawals AS newer
JOIN wp_bl_withdrawals AS older
  ON older.instructor_id = newer.instructor_id
 AND older.payout_reference = newer.payout_reference
 AND older.id < newer.id
WHERE newer.payout_reference IS NOT NULL;

ALTER TABLE wp_bl_withdrawals
    DROP INDEX uq_reference,
    ADD UNIQUE KEY uq_reference (instructor_id, payout_reference);
