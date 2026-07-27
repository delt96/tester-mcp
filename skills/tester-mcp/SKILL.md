---
description: Run browser screen E2E tests. Use when the user asks to test a web screen or flow, verify a login or form, or check a UI after a change. Writes a scenario YAML, runs the tester-mcp CLI to drive a claude-in-chrome executor, and reports PASS / PARTIAL / FAIL / NOT_TESTED.
allowed-tools: Bash(tester-mcp *) Read Write Edit Glob Grep
---

# tester-mcp — Screen E2E testing

Current CLI usage (always up to date):

!`tester-mcp --help`

> Prerequisites and the full scenario DSL (single source of truth): run `tester-mcp document-guide`.

## Workflow

E2E work runs on a fixed workflow. **Read `workflow.md` (same directory) before you write
or edit any scenario file.** It holds the phases, the reuse gate, and the result-handling
branches. Authoring from this file alone skips the gate — that is how inline selectors and
duplicated sequences get in.

## Secrets

Test accounts live in the gitignored `tester-mcp.secrets.yaml` (or env `SECRET_*` in CI); each top-level block is one account — reference it per scenario as `${secrets.<account>.username}` (e.g. `${secrets.tester.username}`, `${secrets.admin.username}`). If the file is missing, tell the user to fill it in. Details: `tester-mcp document-guide`.

## Discipline

Grep for references to any changed symbol and check runtime dependencies (storage, store, API params). Separate proof from inference — report "verified X, inferred Y by the same pattern", never absolute claims.
