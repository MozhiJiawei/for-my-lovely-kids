---
date: 2026-05-11
status: active
type: requirements
sequence: 4
topic: red-flower-garden-data-integrity-guardrails
origin: production-readiness discussion for public-IP minimum system
depends_on: docs/plans/2026-05-11-003-data-versioning-migration-safety-requirements.md
---

# Data Integrity Guardrails Requirements

## Background

The product's trust depends on small data facts staying correct: available flowers, cumulative flowers, task confirmations, wish redemptions, and memorial decorations. If those facts drift apart, the child and parent will lose confidence even if the service remains online.

This requirement covers data guardrails: database constraints, integrity checks, and operational checks that detect or prevent bad data.

## Goals

- Prevent impossible data from being written when practical.
- Detect cross-table inconsistencies quickly.
- Make data problems diagnosable by pointing to specific records.
- Add checks that can run after deploys and on a schedule.

## Non-Goals

- No full audit log in this requirement.
- No user-facing repair UI.
- No automatic repair for every data issue.
- No analytics/reporting dashboard.

## Requirements

### R1. Balance Invariants

The system must enforce or check these red-flower balance invariants:

- `available >= 0`
- `cumulative >= 0`
- `cumulative >= available`
- Exactly one active balance row exists for the current family in the minimum single-family system.

Where SQLite constraints are practical, these should be database constraints. Otherwise they must be covered by the integrity check script.

### R2. Ledger Invariants

The red-flower ledger must remain append-oriented and reconcilable with the balance.

Required checks:

- Ledger entry ids are unique.
- Ledger source operations are idempotent where possible.
- Sum of `deltaAvailable` equals `RedFlowerBalance.available`.
- Sum of positive cumulative deltas equals `RedFlowerBalance.cumulative`.
- Each ledger entry has a valid type.
- Task-confirmation ledger entries reference a real task submission.
- Wish-redemption ledger entries reference a real wish redemption.

### R3. Task Completion Invariants

Task submissions must not produce duplicate rewards.

Required checks:

- A one-time task can have at most one confirmed completion.
- A repeating task can have at most one confirmed completion per business day.
- Confirmed submissions have `confirmedAt`.
- Pending submissions do not have `confirmedAt`.
- Submission snapshots preserve title and flower value at submission time.

The existing completion key approach should become a first-class integrity rule with tests and database support where possible.

### R4. Wish Redemption Invariants

Wish redemptions must not over-spend flowers or create contradictory state.

Required checks:

- Approved redemptions have `approvedAt`.
- Pending redemptions do not have `approvedAt`.
- Approved redemption flower costs are reflected in ledger deductions.
- A one-time wish cannot be approved more than once.
- A repeating wish may be approved multiple times, but each approval must have its own redemption record.
- Redemption snapshots preserve title and flower cost at request time.

### R5. Memorial Decoration Invariants

Memorial decorations must be traceable.

Required checks:

- Each decoration references a real approved wish redemption.
- A redemption creates at most one memorial decoration unless the domain deliberately changes.
- Decoration kind is in the allowed set.

### R6. Database Constraints

The schema must add database-level protection for high-value invariants where SQLite supports it.

Priority constraints:

- Non-negative balance fields.
- Unique idempotency keys for task completions.
- Foreign keys for task submissions, wish redemptions, and memorial decorations.
- Valid status values where practical.
- Useful indexes for integrity checks and normal API queries.

Database constraints must be introduced through the migration safety capability.

### R7. Integrity Check Command

The repository must provide a command or script that runs the data integrity checks against a selected SQLite database.

It must support:

- Production database inside the Docker volume.
- A local file path.
- A restored backup file.

The command must return exit code `0` when all checks pass and non-zero when any check fails.

### R8. Actionable Failure Output

Integrity failures must identify the problem clearly.

Failure output should include:

- Check name.
- Table or domain area.
- Relevant record ids.
- Expected condition.
- Actual observed value or count.

The output must avoid printing tokens or unrelated personal data.

### R9. Scheduled Integrity Checks

The production server must run integrity checks at least once per day.

The first version may write results to local logs. Later alerting can build on the same exit codes and structured output.

### R10. Deploy-Time Integrity Checks

Deployment must run integrity checks after migrations and after the new container passes `/health`.

If integrity checks fail after deployment, the deployment output must make the failure obvious and point to the saved pre-deploy backup.

For the minimum system, a failed deploy-time integrity check should block declaring the deployment successful.

### R11. Test Coverage For Guardrails

Automated tests must cover representative integrity failures.

At minimum:

- Negative available balance is detected or rejected.
- Ledger total mismatch is detected.
- Duplicate one-time task confirmation is detected.
- Duplicate same-day repeating task confirmation is detected.
- Approved wish redemption without matching ledger deduction is detected.
- Decoration referencing a missing or unapproved redemption is detected.

## Acceptance Criteria

- Running the integrity command on a normal production-shaped database passes.
- Running it on a deliberately corrupted copy fails with actionable messages.
- Deploy output includes an integrity check result.
- Daily scheduled integrity checks log pass/fail status.
- Key database constraints are present after migrations.
- Constraint violations are tested at the API or database level.

## Operational Notes

- The first implementation should be conservative: detect and report before attempting automatic repair.
- Any manual repair should be followed by a backup and another integrity check run.
- Integrity checks should also be run against restored backups during recovery drills.
- If a check is intentionally deferred, the document or follow-up issue should say why and what risk remains.

## Risks

| Risk | Mitigation |
|------|------------|
| Business logic bug silently writes inconsistent flowers | Add database constraints and scheduled integrity checks |
| Backup restores a database that is structurally valid but logically wrong | Run integrity checks against restored backups |
| Integrity command is too vague to repair from | Include record ids and expected vs actual condition |
| Constraints break existing prototype data during rollout | Introduce through migration preflight and backup first |
| Integrity check failures are ignored | Make deploy-time failures visible and use non-zero exit codes |
