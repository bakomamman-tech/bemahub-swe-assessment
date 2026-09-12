# Task 5 — Database

The local `mysql` CLI was not installed, so I connected to the assessment MySQL instance on port 3307 using Python/PyMySQL and executed the SQL directly against the running `bemalearn` database.

## 5.1 — Investigate NULL versus 0

### Query

```sql
SELECT
    id,
    title,
    enrolment_count,
    enrolment_count IS NULL AS enrolment_is_null,
    average_rating,
    average_rating IS NULL AS rating_is_null
FROM wp_bl_courses
ORDER BY id;
```

### Terminal output

```text
('id', 'title', 'enrolment_count', 'enrolment_is_null', 'average_rating', 'rating_is_null')
(1, 'Introduction to Bread Baking', 128, 0, Decimal('4.60'), 0)
(2, 'Sourdough Starters', 64, 0, Decimal('4.20'), 0)
(3, 'Pastry Fundamentals', None, 1, None, 1)
(4, 'Cake Decorating Basics', 9, 0, Decimal('0.00'), 0)
(5, 'Advanced Laminated Dough', 0, 0, None, 1)
```

### Interpretation

`Pastry Fundamentals` has `enrolment_count = NULL` and `average_rating = NULL`.

`Cake Decorating Basics` has a genuine measured `average_rating = 0.00`.

`Advanced Laminated Dough` has a genuine `enrolment_count = 0`, while its `average_rating` is NULL.

`NULL` means the value is not yet known or has not yet been measured, whereas `0` is a real measured value. Treating `NULL` as `0` would mislead users into thinking a course has been measured as having zero enrolments or a zero rating when the data actually does not exist yet.

## 5.2 — Withdrawal reference constraint

The original schema used:

```sql
UNIQUE KEY uq_reference (instructor_id, payout_reference, cancelled_at)
```

### Proof — duplicate inserts before the fix

I inserted two rows using the same `instructor_id` and `payout_reference`, with `cancelled_at = NULL`.

```sql
INSERT INTO wp_bl_withdrawals
    (instructor_id, amount_minor, status, payout_reference, cancelled_at)
VALUES
    (2, 50000, 'completed', 'task5_dup_probe', NULL);
```

The same insert was executed a second time.

### Terminal output before the fix

```text
DUPLICATE REFERENCE: task5_dup_probe
first insert succeeded, id = 4
second insert succeeded, id = 5
ROWS:
(4, 2, 50000, 'completed', 'task5_dup_probe', None)
(5, 2, 50000, 'completed', 'task5_dup_probe', None)
```

The unique key did not prevent the duplicate. MySQL permits multiple `NULL` values in a UNIQUE index because `NULL` values are not treated as equal for uniqueness comparisons. Since `cancelled_at` was part of the composite unique key and was `NULL` in both rows, the otherwise identical `(instructor_id, payout_reference)` values did not collide.

### The fix — `database/migrations/002_fix_withdrawal_reference.sql`

The corrective migration contains:

```sql
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
```

### Why a new migration rather than editing `001_initial.sql`

I created a new migration because `001_initial.sql` had already been applied; editing an applied migration would not update the running database and would rewrite migration history.

### Existing duplicates

The duplicate rows created during the test would have blocked creation of the new unique index. The migration therefore removes later duplicate rows while keeping the earliest row for each `(instructor_id, payout_reference)` pair.

### Applying the migration

```text
APPLYING: database\migrations\002_fix_withdrawal_reference.sql
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

OK: -- 002_fix_withdrawal_reference.sql | affected rows: 1
OK: ALTER TABLE wp_bl_withdrawals | affected rows: 0
MIGRATION APPLIED SUCCESSFULLY
```

### `SHOW CREATE TABLE wp_bl_withdrawals;` after the migration

```text
SHOW CREATE TABLE wp_bl_withdrawals:
CREATE TABLE `wp_bl_withdrawals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instructor_id` bigint unsigned NOT NULL,
  `amount_minor` int unsigned NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'pending',
  `payout_reference` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reference` (`instructor_id`,`payout_reference`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci
```

### Duplicate insert after the fix

I repeated the duplicate test using a fresh payout reference.

```text
DUPLICATE REFERENCE AFTER FIX: task5_dup_probe_after
first insert succeeded, id = 6
second insert rejected as expected
ERROR CODE: 1062
ERROR MESSAGE: Duplicate entry '2-task5_dup_probe_after' for key 'wp_bl_withdrawals.uq_reference'
ROWS AFTER TEST:
(6, 2, 50000, 'completed', 'task5_dup_probe_after', None)
```

The corrected unique index now prevents the same instructor from creating two withdrawals with the same payout reference.

## 5.3 — Course enrolments and non-refunded revenue

### Query

```sql
SELECT
    c.id,
    c.title,
    COUNT(e.id) AS non_refunded_enrolments,
    COALESCE(SUM(e.amount_paid_minor), 0) AS non_refunded_revenue_minor
FROM wp_bl_courses AS c
LEFT JOIN wp_bl_enrolments AS e
    ON e.course_id = c.id
   AND e.refunded_at IS NULL
GROUP BY c.id, c.title
ORDER BY c.id;
```

### Terminal output

```text
QUERY:

SELECT
    c.id,
    c.title,
    COUNT(e.id) AS non_refunded_enrolments,
    COALESCE(SUM(e.amount_paid_minor), 0) AS non_refunded_revenue_minor
FROM wp_bl_courses AS c
LEFT JOIN wp_bl_enrolments AS e
    ON e.course_id = c.id
   AND e.refunded_at IS NULL
GROUP BY c.id, c.title
ORDER BY c.id;

OUTPUT:
('id', 'title', 'non_refunded_enrolments', 'non_refunded_revenue_minor')
(1, 'Introduction to Bread Baking', 2, Decimal('9000'))
(2, 'Sourdough Starters', 0, Decimal('0'))
(3, 'Pastry Fundamentals', 0, Decimal('0'))
(4, 'Cake Decorating Basics', 0, Decimal('0'))
(5, 'Advanced Laminated Dough', 0, Decimal('0'))
```

### Join choice

I used a `LEFT JOIN` so every course remains in the result even when there are no non-refunded enrolments. An `INNER JOIN` would remove courses with no matching enrolment rows, so courses with zero enrolments would disappear instead of showing `0`.