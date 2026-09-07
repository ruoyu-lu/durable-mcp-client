# ADR 0001: Reuse the runtime; focus on client recovery and host delivery

- Date: 2026-09-08
- Status: scope accepted; technology combination subject to M0 verification

## Context

FastMCP already supplies background execution infrastructure and client task operations. Reimplementing a scheduler does not establish a useful differentiator. This project targets recovery across client lifecycles and delivery into an agent session.

## Decision

1. Focus on durable client records, recovery coordination, delivery, and fault evidence.
2. Reuse FastMCP/Docket and a compatible SDK rather than implementing the entire protocol stack.
3. Probe Harness early, build the independent CLI core, and keep the host adapter separate.
4. Limit MVP to one user, coordinator, server, and protocol combination.
5. Distinguish submission deduplication, business side effects, and result-delivery guarantees.
6. Keep this repository independent of the surrounding workspace's website and dependencies.

## Proposed stack

TypeScript for the client and host adapter; Python/FastMCP for the example server; SQLite for transactions and the outbox; Redis/Valkey for runtime persistence. Pin exact versions in M0. These are architectural choices, not an installed dependency inventory.

## Alternatives

- New scheduler: too broad for MVP.
- Host-only plugin: couples the core to host changes too early.
- Protocol-only demo: useful as a probe, insufficient as the product.
- Python client: acceptable for protocol exploration if TypeScript compatibility is missing; reconsider the core language explicitly rather than silently building two cores.

## Consequences and review triggers

A multi-language test environment adds maintenance cost. Protocol and host changes require compatibility testing. If the host already satisfies the target workflow, prioritize missing tests/fixes or narrow the project rather than duplicating complete functionality.
