# BemaHub Software Engineer Assessment — Solution

**Name:** Stephen Daniel Kurah 
**Date:** 12 September 2026  
**Actual time spent:** Approximately 6 hours, excluding setup/environment time

---

## 1. What I completed

| Task | Status | Evidence file |
|---|---|---|
| 1 — Course list | Done | `evidence/task-1-ui.png`, `evidence/task-1-network.png`, `evidence/task-1-network-response.png` |
| 2 — Authentication | Done | `evidence/task-2-signedout.png`, `evidence/task-2-signedin.png`, `evidence/task-2-network.png`, `evidence/task-2-learner-403.png`, `evidence/task-2-transport-failure.png` |
| 3 — Withdrawal form | Done | `evidence/task-3-validation.png`, `evidence/task-3-server-error.png`, `evidence/task-3-success.png`, `evidence/task-3-network.png` |
| 4 — PHP defects | 4 of 4 found and fixed | `evidence/task-4-curl.txt` |
| 5 — Database | Done | `answers/task-5.md`, `database/migrations/002_fix_withdrawal_reference.sql` |
| 6 — Infrastructure | Done | `answers/task-6.md` |
| 7 — Python | Done | `evidence/task-7-output.txt` |

## 2. What I did NOT finish, and how I would approach it

I completed the required work for Tasks 1–7.

I did not add a larger automated test suite because I prioritised the runtime evidence requested by the assessment. With more time I would add focused tests around authentication state transitions, withdrawal idempotency, money validation, the PHP permission/validation rules, the database migration, and the reconciliation script's malformed-data cases.

## 3. Task 4 — the defects

### Defect 1 — permission

**What was wrong:**  
`GET /me/earnings` required authentication but did not require the caller to be an instructor. A signed-in learner could therefore access an instructor-only earnings route.

**Why it was wrong:**  
Authentication proves who the caller is, but it does not prove they are authorised to access instructor financial information.

**What I changed:**  
I changed the route permission callback from the generic authenticated-user check to the instructor-role check.

**How I proved it:**  
Before the change, a learner request returned HTTP `200` and an earnings response. After the fix, the same learner request returned HTTP `403` with `Instructors only.`

### Defect 2 — schema mismatch

**What was wrong:**  
The course-detail code read `lessons_total`, but the query result exposed the value as `lesson_count`.

**Why it was wrong:**  
The mismatched property meant the API returned an incorrect lesson count even though the database query had the correct value.

**What I changed:**  
I changed the response mapping to read `lesson_count`.

**How I proved it:**  
Before the fix, course 1 returned `lessonCount: 0`. After the fix, the same course returned `lessonCount: 12`.

### Defect 3 — API contract

**What was wrong:**  
The public course-list endpoint returned unpublished courses.

**Why it was wrong:**  
The public API contract should never expose courses that have not been published.

**What I changed:**  
I added the published-course condition to the public course query so only rows with `is_published = 1` are returned.

**How I proved it:**  
Before the fix, the public list included `Advanced Laminated Dough` with `isPublished: false`. After the fix, the response contained only the four published courses.

### Defect 4 — validation

**What was wrong:**  
The withdrawal endpoint accepted an amount below the configured minimum withdrawal.

**Why it was wrong:**  
This allowed a request that violated the business rule controlling money movement.

**What I changed:**  
I added a server-side minimum-withdrawal check that returns a `below_minimum` error with HTTP `422`.

**How I proved it:**  
Before the fix, a withdrawal of `10000` minor units was accepted with HTTP `201`. After the fix, the same below-minimum request returned HTTP `422` with `below_minimum`.

## 4. Specific questions

### Task 1 — `previewExpiresInSeconds`

I used `previewExpiresInSeconds` from the API response to calculate React Query's `staleTime`:

```ts
staleTime: (query) =>
  (query.state.data?.previewExpiresInSeconds ?? 0) * 1000
```

This lets the API control how long the course preview may be treated as fresh rather than hardcoding a cache duration in the frontend. When that period expires, React Query can consider the cached data stale and refetch when appropriate.

### Task 3 — why `payoutReference` is generated once per attempt

`payoutReference` identifies one logical withdrawal attempt and therefore must remain stable if the request is retried after a transport failure. If the server created the withdrawal but the client never received the response, retrying with a new reference would not be recognised as the same request and could cause money to move twice.

I therefore retain the reference when the outcome is unknown because of a transport failure, and clear the attempt after a confirmed success or a definitive HTTP response.

### Task 5.2 — why the unique key failed and why I added a new migration

The original unique key was:

```sql
UNIQUE KEY uq_reference (instructor_id, payout_reference, cancelled_at)
```

It failed because `cancelled_at` is nullable and MySQL permits multiple `NULL` values in a UNIQUE index. Two rows could therefore contain the same instructor and payout reference while both had `cancelled_at = NULL`.

I created `002_fix_withdrawal_reference.sql` rather than editing `001_initial.sql` because the original migration had already been applied. Rewriting an applied migration would not repair existing databases and would make migration history inconsistent.

The new migration removes later duplicate references deterministically and replaces the old key with:

```sql
UNIQUE KEY uq_reference (instructor_id, payout_reference)
```

I verified the fix by repeating the duplicate insertion: the first insert succeeded and the second was rejected by MySQL with error `1062`.

### Task 7 — `"fee_minor": null`

I treated a missing or `null` `fee_minor` as a zero fee because the payout record is otherwise usable provider data and the operational reconciliation should not crash solely because fee information is absent. I documented this as an assumption; in a production financial reconciliation system I would confirm this interpretation with the provider/business owner before relying on it.

## 5. Anything wrong in the brief

I did not find a material contradiction in the API contract.

I did encounter one wording ambiguity in Task 3: the requirement says client-side validation should require a "positive integer", while the user-facing field represents a currency amount and the API field is `amountMinor`. I interpreted the integer requirement as applying to the submitted `amountMinor`; the UI accepts at most two decimal currency places and converts the value to integer minor units without floating-point money arithmetic.

My local environment also differed from the documented setup. The Docker CLI was unavailable even though the assessment backend and MySQL services were already running, and the frontend development server was available on a different local port than the documented default. I used the actual running services rather than changing a working environment solely to match the setup instructions.

## 6. AI Tool Usage — required

**Which tools did you use?**

I used ChatGPT as a coding, debugging, review, and documentation assistant throughout the assessment.

### 6a. Where AI was used

| Task | What AI produced or assisted with | Accepted / rejected / modified |
|---|---|---|
| 1 | Helped interpret the API contract, structure the course service/page, React Query caching, null handling, and verification steps | Accepted after running the page and checking Network evidence |
| 2 | Helped structure authentication state, Axios bearer-token handling, protected earnings flow, 401/403 handling, and failure-path testing | Accepted with runtime verification |
| 3 | Helped draft the React Hook Form/Zod validation, idempotency-reference strategy, server-field errors, and cache invalidation | Accepted and modified based on actual server behaviour |
| 4 | Helped inspect the four defect categories and reason about minimal fixes | Accepted only after curl before/after verification |
| 5 | Helped construct the SQL investigation, diagnose the nullable UNIQUE-key problem, draft migration `002`, write the aggregation join, and organise the written answer | Accepted after executing every query/migration against the running database |
| 6 | Helped organise the infrastructure incident answers in diagnostic order | Reviewed and accepted |
| 7 | Helped interpret the tracebacks, filter paid records, handle missing/null fees, implement documented exit code `2`, and create runtime evidence | Accepted after successful and deliberately failed executions; some evidence-capture suggestions were rejected when they produced incorrect/noisy output |
| 8 | Helped structure and draft this `SOLUTION.md` | Reviewed against the repository changes and evidence |

### 6b. What I accepted or rejected, and why

I did not treat AI output as evidence that something worked. I accepted implementation suggestions only after comparing them with the assessment contract and running the resulting code.

Several suggestions were modified or rejected based on the actual environment:

- The local `mysql` CLI was not installed, so rather than treating that as a blocker I used Python/PyMySQL to run the required SQL against the running MySQL instance.
- A long PowerShell here-string approach for writing the Task 5 answer was abandoned after the shell repeatedly remained in continuation mode; I edited the Markdown in VS Code instead.
- An initial PowerShell `Tee-Object` method for Task 7 captured extra `NativeCommandError` wrapper text. I did not use that output as the final evidence.
- A later `cmd` evidence-capture attempt also produced incorrect output and exit-code evidence, so I discarded it.
- I replaced those attempts with `Start-Process` using separately redirected stdout/stderr and used the process exit codes. I then manually inspected the resulting evidence file before committing it.
- I retained the Task 3 payout reference across an unknown transport failure rather than blindly creating a new reference because the latter could defeat idempotency and duplicate a financial operation.

### 6c. What I verified myself, and how

I personally executed and inspected the runtime checks rather than relying on generated explanations.

For Task 1 I loaded the course page and inspected the browser UI and DevTools Network response.

For Task 2 I verified signed-out behaviour, a successful instructor request, learner `403` behaviour, a transport-failure state, and ran the frontend TypeScript typecheck.

For Task 3 I verified client-side validation, a server refusal attached to the form field, a successful withdrawal, the POST request, the idempotency header, and the post-success earnings refresh behaviour.

For Task 4 I ran the endpoint checks and recorded full `curl -i` before/after responses. The evidence shows the learner earnings route changing from `200` to `403`, lesson count changing from `0` to `12`, the unpublished course disappearing from the public response, and a below-minimum withdrawal changing from `201` to `422`.

For Task 5 I ran the NULL/zero investigation query, reproduced the broken duplicate constraint with two successful inserts, applied migration `002`, inspected `SHOW CREATE TABLE`, reproduced the duplicate attempt after the fix and received MySQL error `1062`, and ran the LEFT JOIN revenue query.

For Task 6 no execution was required; I reviewed each answer for diagnostic ordering and what each check rules in or out.

For Task 7 I first ran the unmodified script and recorded the `KeyError` and missing-file traceback. After the fix I ran the real data successfully with exit code `0`, ran a deliberately missing file and confirmed exit code `2`, ran `py_compile`, and captured the final output in `evidence/task-7-output.txt`.

### 6d. Assumptions I made

- A missing or `null` payout fee is treated as zero for this assessment.
- `previewExpiresInSeconds` is authoritative for the frontend course-preview cache lifetime.
- A user-facing withdrawal amount may contain up to two currency decimal places as long as the API receives an integer `amountMinor`.
- A transport failure means the withdrawal result is unknown, so the same idempotency reference must be retained for a safe retry.
- A definitive HTTP response ends that logical attempt and allows a later submission to receive a new payout reference.
- Existing duplicate withdrawal references must be resolved before the corrected unique index can be added; the migration keeps the earliest row and removes later duplicates.
- The already-running local WordPress/MySQL services represented the intended assessment environment even though Docker was not available from my shell.

## 7. Assumptions and trade-offs

The frontend implementation prioritises correctness of API state and failure handling over visual polish.

Authentication state is stored in browser storage for the assessment implementation. For a production application I would reassess the authentication model, including whether an HttpOnly secure cookie/session approach would reduce token-exposure risk.

The withdrawal form performs client validation for user feedback, but the server remains authoritative for financial validation.

The Task 5 migration removes later duplicate payout references before creating the corrected unique index. This is deterministic and allowed the migration to succeed, but in a real production financial system I would not automatically delete potentially meaningful payment records without first reconciling them and preserving an audit trail.

Treating missing/null payout fees as zero is an explicit assessment choice, not something I would silently assume for an external payment provider in production.

## 8. If this went to production tomorrow

My main concerns would be financial correctness, authentication/token handling, observability, migration safety, and automated regression coverage.

Before production I would:

- add automated tests for authentication/authorisation, withdrawal validation and idempotency, database constraints, API contract behaviour, and reconciliation edge cases;
- add structured logs and request/correlation IDs around withdrawals and reconciliation;
- use stronger production-safe session/token storage and review all authentication boundaries;
- make idempotency durable and observable across retries and service restarts;
- perform the duplicate-withdrawal cleanup as an audited reconciliation rather than automatic deletion;
- validate payout-export schemas explicitly and agree the missing-fee policy with the provider/business owner;
- run migrations against a production-like backup/staging copy first and define rollback/recovery procedures;
- add monitoring for withdrawal failures, duplicate-reference violations, reconciliation discrepancies, and unexpected `5xx` responses;
- run a final security review of committed evidence and repository history to ensure no live credentials, bearer-token values, or other sensitive data were included.