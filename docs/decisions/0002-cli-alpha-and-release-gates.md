# ADR 0002: Deliver the standalone CLI alpha before host integration

- Date: 2026-09-21
- Status: accepted following the project review
- Supersedes ADR 0001's early host-probe ordering and proposed delivery scope, not its runtime-reuse principle

The CLI now supports the task lifecycle against a real FastMCP example. Continuing to treat host feasibility as M0 leaves the plan stale while small CLI features accumulate. The next useful outcome is a reliable, installable artifact.

Prioritize state correctness, input-response reconciliation and Redis-backed server-result recovery, then a clean-install alpha. Preserve the proven HTTP shim until a replacement passes the same tests; the compatibility probe's SDK limitations are not a runtime blocker. Host/identity/outbox are future capabilities and must not appear as existing guarantees.

Keep Harness as one optional candidate after alpha. A short, pinned prototype must establish session and delivery contracts before building an outbox or agent continuation. Do not require a global singleton simply because the original design proposed one; use evidence to identify the ownership needed.

Review this decision when R1/R2 pass, a real adopter needs a second server/auth combination, or a verified host integration changes the cost/benefit. No calendar promise or ecosystem-first claim is made.
