# @delt/tester-mcp

Opus (planner) + Haiku (executor) + Chrome screen E2E test orchestrator.
The CLI spawns `claude -p --chrome` per scenario and reports one of four labels:
PASS / PARTIAL / FAIL / NOT_TESTED.

## Install

```
npm i -g @delt/tester-mcp
tester-mcp init          # installs the skill, scaffolds config + secrets example
```

## Use

```
tester-mcp run scenarios/<area>/<id>.yaml -c tester-mcp.config.yaml
```

## Authoring & prerequisites

This tool is designed to be driven by an AI agent. The authoritative,
version-pinned reference for prerequisites and the scenario DSL is the CLI itself:

```
tester-mcp document-guide
```

Run that before writing scenarios. (This README intentionally does not duplicate
those facts — the command is the single source of truth.)

## Scenarios live in your project, not here

Scenario YAML files belong to the project under test (commit them to that repo).
This package only ships example scenarios under `examples/`.
