# Changelog

All notable changes to this project are documented here.
This project adheres to Semantic Versioning.

## [0.1.0]

### Added
- Scoped package name `@delt/tester-mcp` with public publish access; README + changelog.
- `tester-mcp document-guide` command printing the single-source authoring guide.
- Multi-scenario parallel runs: `tester-mcp run <files…|dir> --concurrency <1-10>`;
  each executor creates its OWN browser tab (tabs_create) for real parallelism (~2-3×).
- Streaming observability: per-run `runs/<id>/<scenario>.log` (redacted), `last_tool`/
  `tool_count` in results, `--verbose` summarized console, `--out-dir`.
- Scenario `ephemeral: true` flag for short-lived UI (toasts/snackbars).

### Changed
- Executor isolation: strips host CLAUDE.md/hooks/skills and restricts tools so the
  executor drives the browser instead of being hijacked into the skill/doc workflow.
- Executor contract: selector-first, lean-read, 1-attempt self-bail, screenshot
  best-effort/non-blocking, tab isolation. The executor prompt is now in English.

## [0.0.1]

### Added
- Phase 1 screen-verification CLI: `run` and `init` commands, executor spawn with
  verified `claude -p --chrome` flags, secrets resolution + redaction, 4-label
  results, 5-minute hard timeout.
