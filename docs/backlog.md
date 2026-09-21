# Backlog

Updated 2026-09-21. Ordered queue for the [roadmap](roadmap.md); GitHub issues hold detailed acceptance criteria. Private run notes are a handoff, not an independent roadmap.

## Current: R1 — Reliable recovery

- [ ] [#15 State validation and late observation errors](https://github.com/ruoyu-lu/durable-mcp-client/issues/15) — next implementation. Reproduced in the audit.
- [ ] [#16 Rejected versus uncertain input delivery](https://github.com/ruoyu-lu/durable-mcp-client/issues/16) — safe explicit correction and request reconciliation.
- [ ] [#17 Redis-backed server restart](https://github.com/ruoyu-lu/durable-mcp-client/issues/17) — retrieve uncached remote results using the original handle.

## Next: R2 — Installable CLI alpha

- [ ] [#18 Package and clean installation](https://github.com/ruoyu-lu/durable-mcp-client/issues/18) — bin, dist, intended files, dependency split, artifact smoke test and release readiness.

## Delivered baseline

- [x] Protocol source pin and compatibility probes (original T001/T002; issues #1/#3).
- [x] SQLite transactional records and coordinator (T101; no global singleton claim).
- [x] Deterministic FastMCP hashing example with verified digests (T102).
- [x] CLI submit/list/status/recover/cancel/respond/wait and signal handling (T103).
- [x] Direct/task results, background form input and cancellation exercised (T005 within the pinned scope).

## Deferred by explicit scope

Original T003/T004/T301 host feasibility and presentation move to R4. T202 outbox requires a host delivery contract. T201/T203 are split between R1 recovery evidence and R3 auth/expiry/interop. T401 delivery becomes R2. Original T006 is satisfied for the CLI route by ADR 0002; it does not certify a host path.

Tests/CI and documentation accompany behavior changes. Create issues for independent work, not to justify every PR. Mark gates complete only from executable evidence. Do not reopen completed initialization work from an old scheduled prompt.
