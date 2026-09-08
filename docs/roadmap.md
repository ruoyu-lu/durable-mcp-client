# Roadmap

Milestones use acceptance gates rather than calendar promises. Re-estimate after M0 establishes the integration path.

## M0 — Compatibility and host feasibility

Deliver:

- Pinned MCP revision, SDK, FastMCP/tasks/Docket versions, and Harness commit.
- Minimal calls covering direct results, tasks, observation, input, and cancellation.
- A Harness external-plugin probe for raw task responses, session association, restart recovery, and idempotent delivery.
- `docs/compatibility.md` with commands, versions, results, and source locations.

Gate: a working protocol combination and evidence of a viable host path. If Harness cannot be integrated reasonably, retain the standalone CLI path and document missing seams. Keep unresolved protocol behavior behind replaceable adapters. Protocol-independent core implementation proceeds immediately; never rely on an unpinned “latest” dependency.

## M1 — Standalone lifecycle

Deliver core interfaces, SQLite records, an example server, CLI submission/status/wait/cancel/input behavior, and basic logging.

Gate: direct results, completion, failure, input, and cancellation races are observable. The example generates real artifacts without a paid model dependency. CLI command names are finalized here.

## M2 — Persistence and recovery

Deliver recovery scanning, unknown-submission handling, polling backoff, authentication/expiry handling, result outbox, and a single-instance lock.

Gate: required client fault tests are reproducible and match stated guarantees. Restart after handle persistence must not resubmit the task.

## M3 — Host integration

Deliver the Harness adapter if M0 succeeds, task/input presentation, original-session delivery, and continuation policy.

Gate: host restart reconnects to remote work; duplicate-delivery windows are tested; busy and closed sessions have defined behavior.

If upstream changes break integration, record the last verified commit. Reassess the CLI-only route rather than maintaining an unbounded private fork.

## M4 — Evidence and delivery

Deliver the protocol coverage matrix, recovery report, reproducible demo, setup instructions, documented guarantees/limits, and dependency/license review.

Gate: a clean environment reproduces the example; every required case has an outcome; README claims match tested behavior.

## Sequence

Implement runnable core slices through the independent CLI while evaluating protocol and host adapters. Build tests alongside features. The final milestone consolidates evidence; it does not defer reliability work until the end.
