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
tester-mcp run scenarios/<project>/<area>/<id>.yaml -c tester-mcp.config.yaml
```

The CLI spawns the executor, waits, and writes a result to `runs/<runId>/`.
A hard timeout (default 5 min, `runner.timeout_ms` or `--timeout`) kills a stuck
executor and reports NOT_TESTED.

### Running multiple scenarios in parallel

Pass several scenario files (or a directory) to run them concurrently — each
scenario gets its own executor process and creates its OWN browser tab (via
tabs_create) inside the shared Chrome tab group, so they run in parallel
(~2-3× at 4-way; one Chrome still serializes part of the work, so expect some
contention and varied finish times, not a clean N×):

```
tester-mcp run scenarios/<project>/a.yaml scenarios/<project>/b.yaml --concurrency 3 -c tester-mcp.config.yaml
tester-mcp run scenarios/<project>/auth/ --concurrency 5 -c tester-mcp.config.yaml
```

- `--concurrency <1-10>`: how many run at once (default `min(count, 10)`, hard cap 10).
- Each scenario writes its own `runs/<runId>/<id>.json` + `.log`.
- Logins are per-tab isolated (auth in sessionStorage), so concurrent logins are safe.
- But `localStorage` (e.g. `languageType`) is shared across tabs — keep parallel scenarios on the **same locale**, or run different locales serially.
- Slow scenarios under contention may exceed the timeout — raise `--timeout` (e.g. 240000–300000) for parallel batches.
- Each scenario `id` must be unique across the batch (results/logs are keyed by `id`).

## Scenario file

A scenario is one YAML file. Fields:

- `id` (string, required) — stable identifier, used in the result filename.
- `title` (string, required) — human-readable summary.
- `steps` (list, required) — ordered actions (see below).
- `locale` (string, optional) — pins UI language: `kg` (Kyrgyz), `ru` (Russian),
  `kr` (Korean). The executor switches the app to this language first.
- `login_as` (string, optional) — sugar for `- { use: login, with: { account: <value> } }`
  prepended to `steps`; requires a `login` fragment with an `account` param in `_fragments/`.
- `tags` (list of strings, optional) — suite labels; `run --tag a,b` keeps scenarios
  carrying at least one (OR).
- `on_failure` (string, optional) — `stop` (default) or `continue`.
- `optional` (bool, optional) — if true, a FAIL is downgraded to a soft signal.
- `defaults` (map, optional) — default values reused across steps.
- `precondition` (string, optional) — human note on required data/state.

## Actions (each item in `steps`)

- `navigate` — `{ action: navigate, url: "/path" }` (relative to `targets.frontend`).
- `fill` — `{ action: fill, target: <target>, value: "..." }`.
- `click` — `{ action: click, target: <target> }`.
- `wait_for` — `{ action: wait_for, target: <target> }`.
- `assert_visible` — `{ action: assert_visible, target: <target> }`. Presence/visibility ONLY — it
  does not check content. An input is always "visible", so this can't tell you a value was restored.
- `assert_value` — `{ action: assert_value, target: <target>, value: "expected" }`. The deterministic
  content check: the executor reads the element's value (form control `.value`; otherwise its
  textContent) and compares it EXACTLY to `value` → PASS if equal, FAIL if different. Use this to verify
  a restored/computed field instead of leaning on `assert_visible` + a `description` (which forces the
  AI to interpret and is non-deterministic). `value` supports `${secrets.*}` like `fill`.
- `screenshot` — `{ action: screenshot, name: "after-login" }`.

Native `<select>`: there is no separate select action — use `fill` with the option's `value` or its
visible label as the value; the executor sets the option and dispatches `change`.

## Reuse — fragments, selector aliases, vars

Scenarios live per project; `_`-prefixed entries are shared assets, not scenarios:

    scenarios/<project>/
      _fragments/<name>.yaml     # shared step sequences
      _selectors.yaml            # named target aliases (selector cache)
      <area>/<id>.yaml

Lookup is nearest-ancestor: from the scenario file upward, the first `_fragments/` dir and the
first `_selectors.yaml` win.

Fragment file — `id`, optional `params` (name → default; empty value = required), `steps`
(same actions as scenarios; `use` inside a fragment is an error — no nesting):

    id: login
    params: { account: tester }
    steps:
      - { action: fill, target: { css: "#userId" }, value: "${secrets.{{account}}.username}" }

Scenario side:

    login_as: gduser                    # login fragment, account=gduser
    tags: [smoke, letter]
    steps:
      - use: open-ext-doc               # short form (param defaults)
      - { use: open-ext-doc, with: { row: "2" } }
      - { action: click, target: { ref: confirm_accept, text: "Да" } }   # alias + local override (local wins)
      - { action: navigate, url: "${vars.cmt_doc_url}" }                 # config `vars:` (environment data)

Substitution timing: `{{param}}` at parse time (fragments only — anywhere else is an error),
`${vars.*}` at parse time from the config `vars:` map (url/value fields), `${secrets.*}` at run
time. Every expansion error fails BEFORE an executor is spawned. Check cheaply with
`tester-mcp validate <paths> -c <config>` (`--expand` prints the final steps).

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

**Do NOT target or assert by translated (i18n) text.** A label whose translation
isn't synced to the DB yet renders as a **raw key** (e.g. `10998`) in *every* locale,
so a `text`/`label` strategy finds nothing and the executor gropes until it is killed.
Pinning `locale:` does not save you — the key itself is unsynced. Target by `css`/`role`
instead, and assert on `css` + `assert_value` rather than on a translated string. (Text
matching is acceptable only for static, never-translated literals.)

**Groping is enforced, not just discouraged.** If the executor calls the same locate
tool (`find`) over and over on one element, the runtime kills it and reports NOT_TESTED
with reason "groping" — so a bad selector fails fast (it does not burn the full timeout).
This is why a precise, source-derived selector matters: vague targets get groped and killed.

## Secrets

Never inline credentials. Reference them as `${secrets.a.b}`:
```yaml
- { action: fill, target: { placeholder: "Username" }, value: "${secrets.tester.username}" }
- { action: fill, target: { placeholder: "Password" }, value: "${secrets.tester.password}" }
```

Multiple accounts: each top-level block in `tester-mcp.secrets.yaml` is one account,
and each scenario picks which one to use by its path — no per-account config needed.
```yaml
# tester-mcp.secrets.yaml
tester: { username: "u1", password: "p1" }
admin:  { username: "a1", password: "p2" }
```
A login-as-admin scenario fills `${secrets.admin.username}`; a member-view scenario
fills `${secrets.tester.username}`. Add as many blocks as you need.

Resolution order: the file `tester-mcp.secrets.yaml` (gitignored) first, then the
environment variable `SECRET_A_B` (uppercased, dot → underscore). Secret values
are redacted to `***` in stored results.

## Ephemeral UI (toasts, snackbars)

Short-lived elements (e.g. PrimeVue toast, `life:3000`) vanish faster than tool
round-trips. To verify them reliably:
- Set `ephemeral: true` on the scenario.
- Assert immediately after the trigger with ONE fast text/DOM check — do NOT chain
  fallbacks (JS → find → read_page); the element disappears mid-chain.
- Do NOT add a `screenshot` step for an ephemeral element — the assertion IS the
  proof, and a screenshot of a vanished element causes retry loops.
- (Optional) In a test build, raise the toast `life` so it stays long enough.

## Result labels

- `PASS` — every assertion verified at runtime.
- `PARTIAL` — some verified, some not (each item carries proof or reason).
- `FAIL` — an assertion was contradicted at runtime.
- `NOT_TESTED` — could not run (timeout, missing data, blocked prerequisite).

On NOT_TESTED, read the run's `executor_log` (path is in the result JSON) to see the
tool sequence and errors — that's how the Planner diagnoses and fixes the scenario.

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
