# Changelog

All notable changes to this project are documented here.
This project adheres to Semantic Versioning.

## [Unreleased]

### Added
- Scoped package name `@delt/tester-mcp` with public publish access.
- `tester-mcp document-guide` command printing the single-source authoring guide
  (prerequisites + scenario DSL).
- README and this changelog.

## [0.0.1]

### Added
- Phase 1 screen-verification CLI: `run` and `init` commands, executor spawn with
  verified `claude -p --chrome` flags, secrets resolution + redaction, 4-label
  results, 5-minute hard timeout.
