# CLI alpha release

Version 0.1.0-alpha.1 is an installable CLI artifact. Registry and tag publication are separate actions; no published version is implied by the source version. Internal modules are not a supported library API, so the package declares no library exports.

## Build and verify

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:package
FASTMCP_PYTHON=.venv/bin/python npm run test:fastmcp
FASTMCP_PYTHON=.venv/bin/python npm run test:fastmcp:restart
npm pack
```

`prepack` builds from clean generated output. The package contains the launcher, compiled JavaScript, manifest, README, changelog and license notices. It excludes sources, tests, Python examples, private runtime data, source maps and declarations. The compiler and MCP SDK probes are development dependencies. Installation from the tarball needs only production dependencies and does not run a build hook.

The packaging test installs the built tarball in an empty temporary directory outside the repository with development dependencies and install scripts disabled. Independent CLI processes exercise help/version, submit, reload, wait/result, timeout and invalid usage. It also checks artifact contents, absence of compiler/SDK dependencies, version reporting and the minimum-Node diagnostic. Runtime CI runs it on Node 22.13 and 24. Local macOS checks supplement Linux CI; other platforms are not verified.

## Tag artifact workflow

After a reviewed merge and passing checks, an explicitly chosen tag must match `v` plus package.json's version. The `CLI alpha artifact` workflow supports matching `v*` tags and manual dispatch. It runs the complete verification workflow, builds a tarball and uploads it with SHA256SUMS. It has read-only repository permissions and does not create a GitHub release or publish to npm.

Verify the workflow conclusion and downloaded archive checksum before distribution. The changelog is the prepared release note. A workflow definition or local tarball is not evidence that a tag or registry release exists.

## Registry publication

Publication requires an authorized npm identity with package ownership or permission to create the name. Verify that access and version availability before publishing the tested tarball with the `alpha` dist-tag. Do not use `latest` for this prerelease. Confirm the registry's version, dist-tag and integrity after publication, then update the public install instructions. If access is unavailable, retain the tested artifact; do not claim publication or repeatedly rewrite this checklist.

## CLI output contract

- `--help` and `--version`: text on stdout, exit 0, no task database created.
- Commands: JSON on stdout; inspect task status, observationError and delivery outcomes. A remote failure in a returned record can still exit 0; this does not imply successful work.
- Invalid usage or a thrown local/submission error: diagnostic on stderr, exit 1. Unknown submissions remain recorded even when submit exits 1.
- `wait`: timeout exits 2 with JSON; interruption exits 130 (SIGINT) or 143 (SIGTERM) with saved state. It never cancels remote work implicitly.
- SQLite may emit an experimental warning on stderr. Do not parse stderr as command output.

The database is relative to the working directory unless `--db` is absolute. Reuse both database and endpoint across invocations. See README and the changelog for alpha guarantees and limitations. Runtime dependency licenses are listed in THIRD_PARTY_NOTICES.md; review the actual installed transitive versions before registry publication.
