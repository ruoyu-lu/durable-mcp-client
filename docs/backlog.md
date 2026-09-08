# Backlog

Updated: 2026-09-08.

## Completed

- [x] Establish repository structure and documentation navigation.
- [x] Define scope, non-goals, failure semantics, and acceptance criteria.
- [x] Document architecture, milestones, fault matrix, references, and initial decision.
- [x] Adopt the name durable-mcp-client and English-only project documentation.
- [x] Add MIT license, contribution guidance, and repository hygiene files.

## M0: next

- [x] T001 Pin Tasks revision and record capabilities, methods, result, input, and cancellation semantics. See [compatibility baseline](compatibility.md) (issue #1).
- [ ] T002 Establish compatible FastMCP/tasks/Docket/SDK versions.
- [ ] T003 Audit Harness MCP providers, jobs, session events, and delivery; compare related durable clients.
- [ ] T004 Build the minimal external-plugin probe for persistent association and idempotent delivery.
- [ ] T005 Exercise direct results, asynchronous observation, input, and cancellation in isolation.
- [ ] T006 Publish the compatibility matrix, decide host/CLI route, and update the ADR.

T001/T002 establish the protocol combination. T003/T004 establish host feasibility. T005 depends on version selection. T006 records evidence. An interface name alone does not count as a passing test.

## Following milestones

- [ ] T101 Core interfaces and single-writer SQLite store.
- [ ] T102 Deterministic batch example and artifact verification.
- [ ] T103 CLI lifecycle and presentation.
- [ ] T201 Recovery scan, unknown submission, backoff, authentication, expiry.
- [ ] T202 Outbox and idempotent delivery adapter.
- [ ] T203 Automated fault matrix.
- [ ] T301 Host task/input presentation, delivery, and continuation policy.
- [ ] T401 Reproducible setup, demo, guarantees, limitations, and dependency review.

## Progress policy

Update tasks and affected design documents with implementation changes. Completed items require files or execution evidence. Record failed assumptions and alternatives instead of silently expanding scope.
