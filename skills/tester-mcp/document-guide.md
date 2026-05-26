# tester-mcp — Authoring Guide

This guide is printed by `tester-mcp document-guide`. It is the single source of
truth for prerequisites and the scenario DSL. Read it before writing scenarios.

## Prerequisites

- Node.js >= 20.
- The `claude` CLI must be installed and **logged in** (the executor runs
  `claude -p --chrome`).
- The claude-in-chrome browser extension must be installed and connected. The
  executor drives a **real, visible Chrome window** — it is NOT headless and it
  keeps cookies/session. Chrome/Edge only.
- On **Windows**, the `--chrome` flag is required for claude-in-chrome to work in
  PowerShell. **WSL is not supported.**
- Run `tester-mcp init` once per project to install the skill and scaffold
  `tester-mcp.config.yaml` plus a secrets example.

## Running

```
tester-mcp run scenarios/<area>/<id>.yaml -c tester-mcp.config.yaml
```

The CLI spawns the executor, waits, and writes a result to `runs/<runId>/`.
A hard timeout (default 5 min, `runner.timeout_ms` or `--timeout`) kills a stuck
executor and reports NOT_TESTED.

## Scenario file

A scenario is one YAML file. Fields:

- `id` (string, required) — stable identifier, used in the result filename.
- `title` (string, required) — human-readable summary.
- `steps` (list, required) — ordered actions (see below).
- `locale` (string, optional) — pins UI language: `kg` (Kyrgyz), `ru` (Russian),
  `kr` (Korean). The executor switches the app to this language first.
- `login_as` (string, optional) — named login to perform before the steps.
- `on_failure` (string, optional) — `stop` (default) or `continue`.
- `optional` (bool, optional) — if true, a FAIL is downgraded to a soft signal.
- `defaults` (map, optional) — default values reused across steps.
- `precondition` (string, optional) — human note on required data/state.

## Actions (each item in `steps`)

- `navigate` — `{ action: navigate, url: "/path" }` (relative to `targets.frontend`).
- `fill` — `{ action: fill, target: <target>, value: "..." }`.
- `click` — `{ action: click, target: <target> }`.
- `wait_for` — `{ action: wait_for, target: <target> }`.
- `assert_visible` — `{ action: assert_visible, target: <target> }`.
- `screenshot` — `{ action: screenshot, name: "after-login" }`.

## Target (how to locate an element)

`target` is a multi-strategy object. Provide one or more; the executor tries them
in order of specificity. There is no testid in this project, so prefer stable
attributes and visible text.

- `css` — CSS selector.
- `placeholder` — input placeholder text.
- `label` — associated label text.
- `text` — visible text content.
- `role` — ARIA role (e.g. `button`).
- `description` — natural-language fallback ("the blue Login button").

Example:
```yaml
target:
  placeholder: "Username"
  description: "the username input on the login form"
```

**Authoring rule (selector-first).** Resolve a stable `css` or `role`+name from the
component source (Vue/PrimeVue) and put it in the target. `description`/`text` are
last-resort fallbacks, not the primary strategy. The executor tries the target's
strategies **once** and does NOT grope the page — on a first-attempt miss it bails
with NOT_TESTED and reports what it actually saw. A precise selector is what drives
pass rate and speed. For multi-step UI (filters, dropdowns, modals), script the
open→select sequence as explicit steps with `wait_for` between them.

## Secrets

Never inline credentials. Reference them as `${secrets.a.b}`:
```yaml
- { action: fill, target: { placeholder: "Username" }, value: "${secrets.tester.username}" }
- { action: fill, target: { placeholder: "Password" }, value: "${secrets.tester.password}" }
```
Resolution order: the file `tester-mcp.secrets.yaml` (gitignored) first, then the
environment variable `SECRET_A_B` (uppercased, dot → underscore). Secret values
are redacted to `***` in stored results.

## Result labels

- `PASS` — every assertion verified at runtime.
- `PARTIAL` — some verified, some not (each item carries proof or reason).
- `FAIL` — an assertion was contradicted at runtime.
- `NOT_TESTED` — could not run (timeout, missing data, blocked prerequisite).

## Minimal example

```yaml
id: login-success
title: Login with valid credentials reaches the dashboard
locale: ru
steps:
  - { action: navigate, url: "/" }
  - { action: fill, target: { placeholder: "Username" }, value: "${secrets.tester.username}" }
  - { action: fill, target: { placeholder: "Password" }, value: "${secrets.tester.password}" }
  - { action: click, target: { text: "Login", role: "button" } }
  - { action: assert_visible, target: { description: "the main dashboard after login" } }
  - { action: screenshot, name: "dashboard" }
```
