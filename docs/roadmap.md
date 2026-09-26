# Roadmap

Updated 2026-09-27. This replaces the original M0–M4 sequence; milestones are evidence gates, not dates. The target is a reliable, installable standalone CLI alpha. Host integration is optional follow-up.

## Baseline — working development CLI (delivered)

PRs #5–#14 provide SQLite task records; submit/list/status/recover/cancel/respond/wait; separate cancellation/input delivery state; deadline and signal handling; server polling hints; and real FastMCP hashing, cancellation and form-input examples. The pinned JSON HTTP path works. The SDK probe still describes its own limitations, not the runtime adapter.

Evidence: `npm run check`, `npm test`, `npm run test:fastmcp`. This delivered the source-checkout baseline. R2 adds an installable artifact; neither establishes registry publication or general MCP conformance. See the [audit](audits/2026-09-21.md) and [coverage map](validation.md).

## R1 — Reliable recovery (delivered)

[GitHub milestone](https://github.com/ruoyu-lu/durable-mcp-client/milestone/1)

1. **State correctness (#15, delivered):** invalid snapshots are rejected without losing handles; late poll errors cannot modify settled records. Competing-query, SQLite no-write and reopen regressions pass.
2. **Input recovery (#16, delivered):** local form preflight, structured errors, explicit correction for adapter-proven rejection, refreshed keys and attempt-scoped race guards. Lost/unknown/acknowledged responses stay blocked across restarts. The HTTP adapter does not infer non-acceptance from errors; server rejection recovery requires a verified adapter contract.
3. **Server restart evidence (#17, delivered):** environment-configured Redis example; independent completion observation and empty local result, FastMCP SIGKILL, outage preservation and same-endpoint restart. A new CLI process retrieves the original handle; a recording proxy proves only one submission.

Gate passed: these issues have executable regression evidence and documented limits, including the separate `test:fastmcp:restart` scenario. A restarted server retrieving completed results does not prove arbitrary active jobs resume, nor that Redis survives its own restart. No global coordinator lock is required solely to replace transactional per-key guards; add ownership only for a demonstrated race.

## R2 — Installable CLI alpha (artifact delivered)

[GitHub milestone](https://github.com/ruoyu-lu/durable-mcp-client/milestone/2), issue #18.

Version 0.1.0-alpha.1 provides a CLI-only bin, package-derived version metadata, clean build-on-pack, intentional package contents and production dependency split. A real tarball installs outside the repository and runs without compiler or SDK probe dependencies. License review, output contracts and prepared release notes accompany a tag/manual artifact workflow. Internal modules are not a supported library API.

Artifact gate passed: a fresh environment installs the tarball and reproduces the demo; R1 gates pass. Registry/tag publication is separate and is not claimed here. Use the [release instructions](releases.md) when authorized registry access is available. The completion review keeps R3 demand-driven: select a concrete second server and user workflow before expanding transport/auth support. No new defect or interoperability requirement justifies reopening delivered gates or manufacturing maintenance issues.

## R3 — Broader interoperability (after alpha, demand-driven)

Choose a concrete second server/use case before adding authentication, principal-scoped identity, SSE, legacy negotiation, expiry classification or rate-limit/backoff policy. Preserve structured errors while implementing R1 so these remain replaceable adapter work. Expand only the required transport/auth combination and test it end-to-end.

Gate: an additional documented user workflow works without weakening submission/input uncertainty rules. No universal-compatibility claim.

## R4 — Optional agent-host integration

Timebox one source/prototype investigation against a pinned host version. Harness is a candidate, not a prerequisite. Verify raw Tasks access, durable task/session association, input presentation and an idempotent delivery/acknowledgment contract. Implement outbox and continuation only after those seams exist.

Gate: a real session survives host restart and receives a result under a tested delivery contract. If the seam is absent, retain the CLI and record the bounded finding; do not maintain an unbounded fork or repeatedly research it.

## Selection and maintenance

[Backlog](backlog.md) is the ordered implementation queue. Complete existing PRs first, then correctness regressions, then the first incomplete current-milestone gate. Group related work into a runnable slice; neither PR count nor lines of code measures completion. Reassess priorities weekly and after milestone completion. Do not let cosmetic polling refinements displace R1/R2.
