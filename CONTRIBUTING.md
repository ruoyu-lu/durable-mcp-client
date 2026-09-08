# Contributing

Read the [product scope](docs/product.md), [architecture](docs/architecture.md), and [backlog](docs/backlog.md) before starting substantial work.

## Changes

- Keep protocol, coordination, and host-specific behavior separate.
- Pin and record dependency/specification versions for compatibility claims.
- Add reproducible tests for recovery behavior and race conditions.
- Update documentation when guarantees, limitations, or interfaces change.
- Keep credentials, private task payloads, and unredacted traces out of commits.

For a bug report, include versions, reproduction steps, expected/actual behavior, and redacted evidence. For a pull request, explain the concrete behavior change and relevant validation. Discuss large scope changes before implementation.

Executable setup and test commands will be documented alongside the first implementation. Do not assume the parent workspace's dependencies belong to this project.

By contributing, you agree that your contributions are licensed under the repository's [MIT License](LICENSE).
