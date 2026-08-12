# Changelog

All notable changes to this project are documented here.
This project adheres to Semantic Versioning.

## [0.8.0]

### Added
- **`assert_not_visible` action** — the target must be absent from the DOM, or present but not
  visible. Fills the gap that made "it is gone from the list" unverifiable, which had turned a bill
  count check into an assertion that always passed. A page that has not rendered yet passes it for
  free, so the contract requires judging only after the area has settled (`wait_for` a stable
  container first); still loading is NOT_TESTED, not PASS.
- **`preflight:` config block** — declares what proves a target is the right, live app before any
  executor is spawned. `expect_title` for the frontend, because a status code alone passes when a
  different app squats the port; `expect_status` for the backend, where 401 behind the auth filter
  is the liveness signal. URLs interpolate `${targets.frontend}` / `${targets.backend}` so the port
  is declared once, and are never normalized — rewriting localhost to 127.0.0.1 would check a
  different listener than Chrome resolves. A failure exits immediately with the expected-vs-observed
  reason and spawns nothing; `--no-preflight` skips the check.
- **Screenshots are persisted.** The executor saves them with the browser tool's `save_to_disk` and
  reports the paths in a top-level `screenshots` array; the runner copies them under
  `runs/<run_id>/<scenario_id>/`. Paths sit at the top level, not inside `steps[]`, because that
  array is exactly what breaks when the executor emits a malformed index.

### Changed
- **A result whose JSON fails to parse is no longer discarded.** `status`, `evidence`,
  `screenshots`, `handoff_notes` and `not_tested_reason` are recovered from the raw text and flagged
  with `parse_repaired: true`. Measured on two runs where an `"index": 35-36` range made the whole
  envelope unparseable and filed a real PASS as NOT_TESTED, losing the handoff notes with it.
  `status` is read only from the text before `"steps"`: a status inside the steps array belongs to
  one step, and promoting it would turn a failed run into a pass.
- **Contract: `description` is read as an expectation, not only as a locator.** The executor
  compares it against what it sees and bails when they disagree, even when `css` or a `ref` alias
  already pinned the element — so a stale description is a scenario bug, not a stale comment.
- **Contract: the executor no longer invents expectations.** A row disappearing from a list after it
  acted on it is not a failure unless a step asserts otherwise; approving a document clears it from
  the approval queue, and that is the action working.

### Removed
- `StepResult.screenshot` and the `screenshot` step's `save` field — both were declared but never
  populated or read.

## [0.7.0]

### Added
- **`upload` action** — puts a real file into a file input through claude-in-chrome's
  `file_upload`. `file:` is a bare filename inside the nearest `_fixtures/` directory and is
  resolved to an absolute path at parse time, so a typo or a missing fixture fails in
  `validate` before any executor is spawned. Point `target` at the `input[type=file]` itself:
  clicking the visible button or its `label` opens a native file picker the executor cannot
  see, and the session freezes there. A hidden input (`display:none`) is expected and works.
- **`_fixtures/`** — a third shared-asset kind next to `_fragments/` and `_selectors.yaml`,
  found with the same nearest-ancestor lookup.

### Changed
- **`Read` is now allowed for scenarios that contain an `upload` step.** `file_upload` gates
  on Read permission: with Read in `--disallowedTools` it refuses every path — even one
  inside the repo — with "only files this session is allowed to read can be uploaded".
  Measured 2026-08-12 across five runs: allowing Read was necessary and sufficient, while
  `--add-dir` made no difference (`--dangerously-skip-permissions` already covers paths
  outside cwd), and the executor called Read 0 times in the passing runs. Scenarios without
  an upload step keep the previous isolation unchanged.

## [0.6.0]

### Added
- **`double_click` action** — maps to the browser tool's `double_click`, for grid rows that
  open a detail or form view on double-click where a single click only selects the row.
  Expressing this as a `click` carrying a "double-click it" description left the actual mouse
  action to the executor, which could fire one `left_click` and then report on a screen it
  never opened.

## [0.5.0]

### Changed
- **`runner.model` now defaults to `sonnet`.** A haiku executor is denied every
  claude-in-chrome tool — each call returns "Claude in Chrome requires permission"
  and the run ends NOT_TESTED — while sonnet and opus pass with byte-identical
  flags and an identical 42-tool list. Reproduced 9 times, interleaved, across
  sessions an hour apart, both through the CLI and through a bare `claude -p`.
  No public doc states a model requirement and the Chrome extension's own UI
  offers Haiku 4.5, so this is a reproduced observation rather than a documented
  rule — it may be a bug and may stop applying.
- All source-level text is English: comments, test descriptions, thrown CLI
  errors, and the `not_tested_reason` strings written into result JSON.

### Added
- `runner.effort` (`low` | `medium` | `high` | `xhigh` | `max`) forwards to the
  executor as `--effort`; omitted leaves the CLI default. It is the cost lever now
  that the executor runs sonnet: on one measured scenario `low` cut cost 26% and
  wall time 41% ($0.61→$0.45, 117s→69s) and reached the same verdict.
- `denied_tools` on the scenario result, plus a `not_tested_reason` that names the
  real cause when the extension refuses the executor. Previously such runs were
  reported as "could not parse JSON out of the executor's output", which hid the
  cause behind a symptom and cost a full debugging session.

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
