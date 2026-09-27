# Backlog

Updated 2026-09-28. Ordered queue for the [roadmap](roadmap.md); GitHub issues hold detailed acceptance criteria. Private run notes are a handoff, not an independent roadmap.

## Delivered: R1 — Reliable recovery

- [x] [#15 State validation and late observation errors](https://github.com/ruoyu-lu/durable-mcp-client/issues/15) — semantic validation, handle preservation and competing-poll/reopen regressions pass.
- [x] [#16 Rejected versus uncertain input delivery](https://github.com/ruoyu-lu/durable-mcp-client/issues/16) — form preflight, structured errors, proven-rejection correction and concurrency/reopen regressions pass; generic HTTP failures remain unknown.
- [x] [#17 Redis-backed server restart](https://github.com/ruoyu-lu/durable-mcp-client/issues/17) — uncached remote result recovered after FastMCP SIGKILL/restart; original handle and one submission verified with Redis kept running.

## Delivered: R2 — Installable CLI artifact

- [x] [#18 Package and clean installation](https://github.com/ruoyu-lu/durable-mcp-client/issues/18) — CLI entry point, shared version, clean pack hook, production dependency split, real outside-repository install test, license review and prepared release workflow.

## Delivered: R3 — Concrete interoperability workflow

- [x] Local file-manifest server using the published mcp-durable-tasks 0.2.1 lifecycle and TypeScript SDK 2.0.0; real checksums, progress persistence, independent-process recovery, no-resubmission evidence and cancellation.

## Next: R4 — Bounded host feasibility decision

Probe one pinned host's raw Tasks access, durable session/task association and result-delivery acknowledgment before deciding whether an adapter adds user value. Do not start an outbox or host fork without those seams. If unavailable, preserve the standalone CLI and report a concrete missing contract; further interoperability requires a specific workflow.

Registry publication remains a separate operation requiring authorized access. Keep the verified artifact available; do not repeat release-document changes or add blanket authentication/SSE work.

## Delivered baseline

- [x] Protocol source pin and compatibility probes (original T001/T002; issues #1/#3).
- [x] SQLite transactional records and coordinator (T101; no global singleton claim).
- [x] Deterministic FastMCP hashing example with verified digests (T102).
- [x] CLI submit/list/status/recover/cancel/respond/wait and signal handling (T103).
- [x] Direct/task results, background form input and cancellation exercised (T005 within the pinned scope).

## Deferred by explicit scope

Original T003/T004/T301 host feasibility and presentation move to R4. T202 outbox requires a host delivery contract. T201/T203 are split between R1 recovery evidence and R3 auth/expiry/interop. T401 delivery becomes R2. Original T006 is satisfied for the CLI route by ADR 0002; it does not certify a host path.

Tests/CI and documentation accompany behavior changes. Create issues for independent work, not to justify every PR. Mark gates complete only from executable evidence. Do not reopen completed initialization work from an old scheduled prompt.
