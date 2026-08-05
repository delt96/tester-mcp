# @delt/tester-mcp

Opus (planner) + Sonnet (executor) + Chrome screen E2E test orchestrator.
The CLI spawns `claude -p --chrome` per scenario and reports one of four labels:
PASS / PARTIAL / FAIL / NOT_TESTED.

## Install

```
npm i -g @delt/tester-mcp
tester-mcp init          # installs the skill, scaffolds config + secrets example
```

## Use

```
tester-mcp run scenarios/<project>/<area>/<id>.yaml -c tester-mcp.config.yaml
tester-mcp validate scenarios/<project>       # parse+expand check, no executor spawned
```

## Authoring & prerequisites

This tool is designed to be driven by an AI agent. The authoritative,
version-pinned reference for prerequisites and the scenario DSL is the CLI itself:

```
tester-mcp document-guide
```

Run that before writing scenarios. (This README intentionally does not duplicate
those facts — the command is the single source of truth.)

## Scenarios live here, per project

Scenario YAML files are stored per project inside this repo, under
`scenarios/<project>/<area>/<id>.yaml`, along with per-project reuse assets
(`_fragments/`, `_selectors.yaml`) — commit them here. For a minimal example,
run `tester-mcp document-guide`; it includes a sample scenario.
