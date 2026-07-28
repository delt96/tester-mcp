# Changelog

All notable changes to this project are documented here.
This project adheres to Semantic Versioning.

## [0.4.0]

### Fixed
- `init` installs the whole skill directory, not `SKILL.md` alone. SKILL.md
  references `workflow.md`, so copying one file left the reference dangling at the
  install site — and since 0.3.0's reuse guidance lived in the repo copy only, it
  never reached authoring sessions.
- `init` no longer overwrites an existing `tester-mcp.config.yaml`. It used to
  regenerate the file from `targets`/`runner` alone, dropping hand-written `vars:`
  — which made re-installing unsafe, which is why nobody re-installed.

### Added
- `skills/tester-mcp/workflow.md`: the E2E procedure as its own document (load the
  reuse surface → design and write → reuse gate → validate/run → judge and feed
  back). The gate is two mechanical checks before `validate` — sweep the new files
  for every `_selectors.yaml` css value and turn each hit into a `ref:`, and
  register new framework/layout selectors on the spot — plus a rule against
  calling a scenario done before it passes.

### Changed
- `SKILL.md` keeps the entry pointer and hands the procedure to `workflow.md`
  (3215 → 1486 bytes), so the per-invocation cost drops while the procedure gets
  more room.

## [0.3.0]

### Added
- Per-project scenario storage: `scenarios/<project>/<area>/<id>.yaml`; directory
  expansion is now recursive and skips `_`-prefixed reuse assets.
- Parse-time reuse DSL (executor untouched — everything expands before the run):
  - `_fragments/<name>.yaml` step fragments with `use:`/`with:` and `{{param}}`
    substitution; `login_as:` as sugar for the `login` fragment.
  - `_selectors.yaml` selector aliases via `target: { ref: <name> }` with
    local-override merge; nearest-ancestor discovery for both asset types.
  - Config `vars:` map substituted into step `url`/`value` (`${vars.*}`) for
    environment-coupled data.
  - `tags:` on scenarios + `run --tag <a,b>` OR-filter.
- `validate` command: parse + expand scenarios without spawning an executor;
  `--expand` prints the fully expanded steps. Exit 0/1/2.

### Changed
- Authoring docs: document-guide gained a Reuse section; SKILL.md workflow now
  starts from the selector cache and validates before running; README aligned
  with per-project storage.
- MIT license added (license field + LICENSE file).

## [0.2.0]

### Added
- `assert_value` action: deterministic content check (form control `.value` or
  textContent, exact match).
- Groping watchdog: the runtime kills an executor stuck re-locating the same
  element; the contract tells executors to self-bail first.

### Changed
- Hardened authoring guide (selector-first targets, ephemeral UI rules).

## [0.1.1]

### Changed
- English-ized all CLI-facing text (principle 10: AI is the consumer, CLI is the
  interface): `--help` program/command/option descriptions, package description,
  and the `init` setup wizard prompts/output. Logic unchanged.

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
