# Validation strategy

Pin one implementation combination first. Passing against one server does not establish universal interoperability. The cases below define the test plan; results are recorded when executed.

## Protocol checks

Map each case to a pinned specification clause. Separate normative requirements, optional capabilities, implementation behavior, and product policy.

| ID | Scenario | Expected check |
| --- | --- | --- |
| P01 | Capability negotiation | Unsupported capabilities produce defined fallback or errors |
| P02 | Direct result or task handle | Both response forms are recognized |
| P03 | Observation and terminal states | Valid fields, stable terminal states, correct result/error parsing |
| P04 | Input requests | Answers associate with the right request; stale responses are handled |
| P05 | Cancellation | Cooperative semantics and completion races are respected |
| P06 | Polling and retention | Pinned polling rules and unavailable/expired tasks are handled |
| P07 | Identity isolation | Another principal cannot retrieve the original caller's task |

Call this a protocol check set until clause coverage is established. State the scope of any conformance claim.

## Required fault matrix

| ID | Injection point | Expected behavior |
| --- | --- | --- |
| F01 | Drop response after server accepts submission | Unknown outcome; no blind retry without deduplication guarantees |
| F02 | Exit after receiving ID but before local commit | Expose the gap; reconcile if supported or report uncertainty |
| F03 | Kill CLI after handle commit | Restart observes the same task without resubmission |
| F04 | Disconnect during polling, then reconnect | Backoff and resume; do not report business failure |
| F05 | Exit after remote completion but before result save | Retrieve again within remote retention window |
| F06 | Exit after result save but before delivery | Resume from the outbox |
| F07 | Exit after host acceptance but before local acknowledgement | Deduplicate/query acknowledgement, or document weaker semantics |
| F08 | Race cancellation with completion | Report authoritative remote terminal state |
| F09 | Restart while input is required | Reconcile request and handle duplicate answers explicitly |
| F10 | Remote task expires or is removed | Show unavailable; no infinite retry or assumption of nonexecution |
| F11 | Credentials expire or principal changes | Require authentication without crossing identity boundaries |
| F12 | Start two local coordinators | Lock prevents duplicate coordination |
| F13 | Restart FastMCP while Redis survives | Verify actual state and result recovery |
| F14 | Kill worker during a batch | Record retry/restart behavior; no duplicate artifact publication |
| F15 | Restart Redis | Verify configured durability separately from server restart |

## Methods

Use controlled clocks and fake protocol responses for state ordering and delivery races. End-to-end tests use real client/server processes and Redis/Valkey with process termination and a fault proxy. Explicit barriers make injection deterministic; random sleeps alone are insufficient.

The example processes a deterministic public file set with batch checkpoints, cancellation observation points, and verifiable artifact digests. After initial passing runs, repeat critical crash windows and report the repetition count instead of inventing a success rate.

## Evidence

Record case ID, specification/dependency versions, configuration, injection point, expected/actual behavior, artifact digest, redacted logs, and PASS/FAIL/UNSUPPORTED.

Measure recovery latency, duplicate submissions, duplicate deliveries, and time from cancellation request to observed terminal state. Count unknown outcomes separately rather than silently excluding them from success metrics.

## Demo

Show real artifacts, the same task ID before and after restart, input handling, session delivery, and the fault report. Demonstrate cancellation separately. A recording illustrates behavior; repeatable tests substantiate it.
