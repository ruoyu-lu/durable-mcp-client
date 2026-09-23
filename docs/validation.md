# Validation and coverage

Verified 2026-09-24. `npm run check` and 58 runtime/compatibility tests pass. `npm run test:fastmcp` runs one integration case containing hashing, cancellation and invalid-then-corrected form-input flows. Test count is not a protocol coverage percentage.

| Behavior / original case | Evidence | Limit |
| --- | --- | --- |
| Modern metadata and SDK gaps (P01/P02) | tests/compatibility/sdk-tasks.test.mjs | Two passing probes assert unsupported SDK behavior; runtime uses a separate shim |
| Direct/async JSON HTTP (P02/P03) | tests/runtime/http.test.mjs; FastMCP integration | One protocol and server combination |
| Client reopen and polling errors (F03/F04) | tasks.test.mjs and separate-process HTTP CLI tests | Some crash windows are simulated, not SIGKILL injections |
| Accepted-handle preservation (F01/F02) | Invalid initial snapshot and unknown-submission tests; snapshots.test.mjs checks semantic failures across reopen without resubmission | No recovery if acceptance response and handle were never obtained |
| Cancellation/completion races (F08/P05) | runtime tests plus live FastMCP cancellation | Cooperative cancellation, no proof arbitrary child work stops |
| Pending input, explicit answers, duplicates (F09/P04) | input-recovery.test.mjs covers preflight, proven rejection, lost HTTP replies, stale keys, concurrent corrections, late completions and legacy/reopened records; live choose_label covers invalid-then-corrected input | Proven remote rejection uses a controlled adapter contract; generic HTTP errors remain unknown. No replay override or inference from outstanding keys |
| Deadline, hints and signal interruption (P06 partial) | runtime HTTP and child-process signal tests | Creation hints and remote expiry handling incomplete |
| Concurrent local use (F12 partial) | Per-key two-connection guards; snapshots.test.mjs controls competing queries, checks unchanged SQLite data_version after late errors, validates rollback and reopens records | No elected single poller; tests exercise multiple connections in one process |
| Remote result after server restart (F05/F13) | Not tested yet; #17 | Must avoid satisfying test from locally cached terminal output |
| Package installation | npm pack --dry-run audit | No dist/bin in current artifact; #18 |
| Host delivery (F06/F07) | Deferred | No outbox or host adapter |
| Expiry/auth/isolation (F10/F11/P07) | Unsupported | No authentication, principal scope or classified unavailable state |
| Worker crash / Redis restart (F14/F15) | Unsupported | Distinct from client restart and FastMCP restart |

## Required commands

Run `npm run check` and `npm test` for product changes. Run `FASTMCP_PYTHON=<venv-python> npm run test:fastmcp` for adapter/server changes; CI installs pinned example dependencies on Python 3.12. Runtime CI covers Node 22.13 and 24. State exactly which tests were run locally versus only in CI.

New recovery gates need deterministic fault boundaries, reopened processes/stores, original remote IDs and no-resubmission assertions. Server restart tests must query a result never cached by the durable client. Artifact tests must install into an empty directory. Record failing outcomes as well as successful evidence. No conformance, exactly-once or durability claim should exceed these tests.
