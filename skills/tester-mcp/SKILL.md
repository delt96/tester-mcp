---
description: Run browser screen E2E tests. Use when the user asks to test a web screen or flow, verify a login or form, or check a UI after a change. Writes a scenario YAML, runs the tester-mcp CLI to drive a claude-in-chrome executor, and reports PASS / PARTIAL / FAIL / NOT_TESTED.
allowed-tools: Bash(tester-mcp *) Read Write Edit Glob Grep
---

# tester-mcp — Screen E2E testing

Current CLI usage (always up to date):

!`tester-mcp --help`

> Prerequisites and the full scenario DSL (single source of truth): run `tester-mcp document-guide`.

## Workflow (document first)

1. **Write the scenario** — `scenarios/<area>/<id>.yaml`. **Resolve a stable `css` or `role` selector from the Vue/PrimeVue source and put it in the `target`** — don't rely on the executor to find elements by natural language (it tries once, then bails NOT_TESTED). `description`/`text` are last-resort fallbacks. Pin the language with `locale:`, reference secrets as `${secrets...}`. Full schema: `tester-mcp document-guide`.
2. **Run** — `tester-mcp run <scenarios...> -c <config>`. The CLI spawns the executor(s) and waits. Pass multiple scenarios (files or a directory) to run them in parallel; `--concurrency <1-10>` caps how many run at once (default `min(count, 10)`). All executors share one Chrome, so raise concurrency only for light, independent scenarios.
3. **Branch on the result label**:
   - PASS / PARTIAL → report the evidence and screenshots.
   - FAIL → present the contradicting evidence, screenshots, and `handoff_notes`, then move into a fix.
   - NOT_TESTED → give the reason plus `pattern_inference` (assumed_ok/unknown); state the missing precondition, or hand off to a human after repeated failure.

## Secrets

The test account lives in the gitignored `tester-mcp.secrets.yaml` (or env `SECRET_*` in CI); reference it as `${secrets.tester.username}`. If it is missing, tell the user to fill it in. Details: `tester-mcp document-guide`.

## Discipline

Grep for references to any changed symbol and check runtime dependencies (storage, store, API params). Separate proof from inference — report "verified X, inferred Y by the same pattern", never absolute claims.
