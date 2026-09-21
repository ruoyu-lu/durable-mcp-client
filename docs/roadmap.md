# Roadmap

Updated 2026-09-21. This replaces the original M0–M4 sequence; milestones are evidence gates, not dates. The target is a reliable, installable standalone CLI alpha. Host integration is optional follow-up.

## Baseline — working development CLI (delivered)

PRs #5–#14 provide SQLite task records; submit/list/status/recover/cancel/respond/wait; separate cancellation/input delivery state; deadline and signal handling; server polling hints; and real FastMCP hashing, cancellation and form-input examples. The pinned JSON HTTP path works. The SDK probe still describes its own limitations, not the runtime adapter.

Evidence: `npm run check`, `npm test`, `npm run test:fastmcp`. This is a source-checkout workflow, not a published package or general MCP conformance claim. See the [audit](audits/2026-09-21.md) and [coverage map](validation.md).

## R1 — Reliable recovery (current)

[GitHub milestone](https://github.com/ruoyu-lu/durable-mcp-client/milestone/1)

1. **State correctness (#15):** reject invalid snapshots without losing handles; late poll errors cannot modify settled records. Test actual competing observations and reopen behavior.
2. **Input recovery (#16):** distinguish explicit rejection from uncertain delivery; allow safe explicit correction where non-acceptance is established. Preserve unknown/acknowledged duplicate guards and reconcile outstanding keys.
3. **Server restart evidence (#17):** configurable Redis example; retrieve a remotely completed result that was never cached locally after FastMCP restarts at the same endpoint. Prove no resubmission.

Gate: these issues have executable regression evidence and accurate limits. A restarted server retrieving completed results does not prove arbitrary active jobs resume, nor that Redis survives its own restart. No global coordinator lock is required solely to replace transactional per-key guards; add ownership only for a demonstrated race.

## R2 — Installable CLI alpha

[GitHub milestone](https://github.com/ruoyu-lu/durable-mcp-client/milestone/2), issue #18.

Deliver a deliberate package file list, CLI bin, build/pack flow, dependency split and clean-directory tarball installation test. Exercise the same command sequence without repository node_modules. Choose CLI-only versus a supported library API explicitly. Review licensing, CLI exit/output contracts and concise limitations; prepare release notes and a tagged alpha.

Gate: a fresh environment installs the artifact and reproduces the demo. R1 gates pass. A public version is only considered released when registry/tag publication is verified. Lack of registry access leaves a tested artifact ready to publish; it is not a reason to spend repeated runs rewriting release documents.

## R3 — Broader interoperability (after alpha, demand-driven)

Choose a concrete second server/use case before adding authentication, principal-scoped identity, SSE, legacy negotiation, expiry classification or rate-limit/backoff policy. Preserve structured errors while implementing R1 so these remain replaceable adapter work. Expand only the required transport/auth combination and test it end-to-end.

Gate: an additional documented user workflow works without weakening submission/input uncertainty rules. No universal-compatibility claim.

## R4 — Optional agent-host integration

Timebox one source/prototype investigation against a pinned host version. Harness is a candidate, not a prerequisite. Verify raw Tasks access, durable task/session association, input presentation and an idempotent delivery/acknowledgment contract. Implement outbox and continuation only after those seams exist.

Gate: a real session survives host restart and receives a result under a tested delivery contract. If the seam is absent, retain the CLI and record the bounded finding; do not maintain an unbounded fork or repeatedly research it.

## Selection and maintenance

[Backlog](backlog.md) is the ordered implementation queue. Complete existing PRs first, then correctness regressions, then the first incomplete current-milestone gate. Group related work into a runnable slice; neither PR count nor lines of code measures completion. Reassess priorities weekly and after milestone completion. Do not let cosmetic polling refinements displace R1/R2.
