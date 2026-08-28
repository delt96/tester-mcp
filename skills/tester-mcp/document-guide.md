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
- **Don't run a haiku executor** — as observed on 2026-08-05. Every browser tool
  came back "Claude in Chrome requires permission" and runs ended NOT_TESTED with
  `denied_tools` set, while sonnet and opus passed with byte-identical flags and an
  identical 42-tool list. Seen 9 times, interleaved, across sessions an hour apart.
  Treat this as a reproduced observation, not a documented rule: no public doc
  states a model requirement and the extension's own UI offers Haiku 4.5, so it may
  be a bug and may stop applying — re-test before assuming it still holds. Default
  is `sonnet`. Re-tested 2026-08-28, unchanged: the same two-step probe run a minute
  apart came back NOT_TESTED with `denied_tools: [tabs_context_mcp]` on haiku and PASS
  on sonnet.
- **Prefer one connected Chrome.** The extension connects per Anthropic account,
  not per machine, so a teammate's Chrome on the same account also shows up
  (`list_connected_browsers` lists every one). With two or more connected, an
  interactive session is asked which browser to use — a prompt a `-p` executor
  cannot answer, and one it cannot resolve itself: `select_browser` is denied
  inside the executor, and a browser picked interactively (by `select_browser` or
  by `switch_browser` pairing) does not reach the executor process.
- On **Windows**, the `--chrome` flag is required for claude-in-chrome to work in
  PowerShell. **WSL is not supported.**
- **`targets.frontend` must be an origin the backend's CORS allowlist contains.**
  The executor drives a real browser, so every API call is subject to CORS. Point the
  target at a port the backend does not know (a second vite on `:5174`, or `127.0.0.1`
  where the allowlist says `localhost`) and the page still loads — only the login POST
  fails, as a bare "Network Error" with nothing on screen naming the cause. Both were
  measured. Add a `preflight:` entry with `expect_title` so a wrong or hijacked target
  is caught before an executor is spawned; a bare status check passes even when another
  app holds the port.
- Run `tester-mcp init` once per project to install the skill and scaffold
  `tester-mcp.config.yaml` plus a secrets example.

## Running

```
tester-mcp run scenarios/<project>/<area>/<id>.yaml -c tester-mcp.config.yaml
```

The CLI spawns the executor, waits, and writes a result to `runs/<runId>/`.
That path is relative to the **current working directory**, not to the config or the
scenario — an absolute `-c` does not move it. Use `--out-dir <path>` to put results
elsewhere. A hard timeout (default 5 min, `runner.timeout_ms` or `--timeout`) kills a
stuck executor and reports NOT_TESTED.

`--var key=value` (repeatable, also on `validate`) sets a scenario var, overriding the
config `vars:` map. Use it to stamp one run: each scenario in a chain is a separate CLI
invocation, so a value the runner generates per-process cannot be shared — but a marker
the operator passes to every invocation can.

```
tester-mcp run scenarios/ebill/seed/01-register.yaml -c tester-mcp.config.yaml --var marker=20260828-2
```

`runner.effort` (`low` | `medium` | `high` | `xhigh` | `max`, omit for the CLI
default) trades reasoning depth for tokens. It is the main cost lever now that
the executor runs sonnet rather than haiku: on one measured scenario, `low` cut
cost 26% and wall time 41% (`$0.61`→`$0.45`, 117s→69s) and reached the same
verdict. That scenario ended early on an app error, so `low` is not yet verified
across a full multi-step run — raise it if you see shallow judgment on long
scenarios.

### What the executor does NOT inherit

Each executor is spawned deliberately stripped of the host environment, so a
scenario runs the same on any machine and cannot be hijacked into the host's
skill/doc workflow (unisolated, it calls Skill/Task/Bash and never opens a browser):

- Project and local settings are skipped (`--setting-sources user`), hooks are off,
  and slash commands are disabled. **Project-scoped CLAUDE.md, project memory, and
  hooks never reach the executor** — you cannot hand it anything by writing to
  project memory or settings; everything it needs must be in the scenario itself.
- `Skill,Task,Agent,Bash,Write,Edit,Read,Glob,Grep,WebFetch,WebSearch` are hard-denied.
- No ambient MCP servers are loaded; only claude-in-chrome (via `--chrome`).

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
- `double_click` — `{ action: double_click, target: <target> }`. Maps to the browser tool's
  `double_click`. Use it for grid rows that open a detail/form view on double-click, where a single
  click only selects the row. Do not express this as a `click` with a "double-click it" `description`:
  that leaves the choice to the executor, which may issue a single `left_click` and then report on a
  screen it never opened.
- `wait_for` — `{ action: wait_for, target: <target> }`.
- `assert_visible` — `{ action: assert_visible, target: <target> }`. Presence/visibility ONLY — it
  does not check content. An input is always "visible", so this can't tell you a value was restored.
- `assert_not_visible` — `{ action: assert_not_visible, target: <target> }`. The target must be
  absent from the DOM, or present but not visible. Use it for "it is gone from the list" — after a
  delete, an approval that clears the queue, or a filter that should exclude a row.
  **A page that has not rendered yet passes this for free**, so put a `wait_for` on a stable
  container immediately before it. Without that the check is vacuous and always passes.
- `assert_value` — `{ action: assert_value, target: <target>, value: "expected" }`. The deterministic
  content check: the executor reads the element's value (form control `.value`; otherwise its
  textContent) and compares it EXACTLY to `value` → PASS if equal, FAIL if different. Use this to verify
  a restored/computed field instead of leaning on `assert_visible` + a `description` (which forces the
  AI to interpret and is non-deterministic). `value` supports `${secrets.*}` like `fill`.
- `screenshot` — `{ action: screenshot, name: "after-login" }`.
- `upload` — `{ action: upload, target: <target>, file: "documentSample.pdf" }`. Uploads a real file
  to a file input through the browser tool's `file_upload`. `file` is a BARE FILENAME inside the
  nearest `_fixtures/` directory (same nearest-ancestor lookup as `_fragments/`); the runner resolves
  it to an absolute path at parse time and fails before spawning an executor if it is missing, so
  `validate` catches a typo for free. Point `target` at the `input[type=file]` element ITSELF, never
  at the visible "choose file" button or its `label` — clicking those opens a native file picker the
  executor cannot see and the session freezes there. The input is often hidden (`display:none`, with
  a styled `label[for=...]` drawn in front of it); that is expected and `find` still resolves it.

Native `<select>`: there is no separate select action — use `fill` with the option's `value` or its
visible label as the value; the executor sets the option and dispatches `change`.

## Reuse — fragments, selector aliases, vars

Scenarios live per project; `_`-prefixed entries are shared assets, not scenarios:

    scenarios/<project>/
      _fragments/<name>.yaml     # shared step sequences
      _selectors.yaml            # named target aliases (selector cache)
      _fixtures/<name>.<ext>     # files uploaded by the `upload` action
      <area>/<id>.yaml

Lookup is nearest-ancestor: from the scenario file upward, the first `_fragments/` dir, the first
`_selectors.yaml` and the first `_fixtures/` dir win (each resolved independently).

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
`${vars.*}` at parse time, `${secrets.*}` at run time. Every expansion error fails BEFORE an
executor is spawned. Check cheaply with `tester-mcp validate <paths> -c <config>` (`--expand`
prints the final steps).

Vars in detail:

- **Two spellings, one map.** `${vars.name}` and the bare `${name}` resolve identically. The bare
  form has no dot in it, which is what keeps it clear of `${secrets.a.b}` and `${targets.frontend}`.
- **Where they apply**: `url`, `value`, `target.text`, `target.description`. `target.text` matters
  most — it is what pins a row in a list, so a marker that cannot reach it cannot tell one run's
  data from another's.
- **Layering** (later wins): built-in → config `vars:` → `--var`.
- **Built-in `${today}`** = `YYYYMMDD`. Enough when a suite runs once a day; pass `--var today=…`
  or a separate marker when it runs twice.
- An undefined name is an error, so a typo fails at validate time rather than matching nothing.

**Stamp data-creating suites.** A seed chain that writes a fixed literal ("E2E-SEED") into every
run leaves a pile of same-named records, and a later step that grabs a row `by text` then has no
way to know which one is this run's — it can silently advance last week's. Give the marker a
per-run value instead:

    # scenario
    - { action: fill, target: { css: "#billNm" }, value: "E2E-SEED ${marker} проект" }
    - { action: click, target: { css: "td", text: "E2E-SEED ${marker}" } }

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

**Priority when resolving one from source** — take the highest that applies:

| # | Strategy | Example | Note |
|---|---|---|---|
| 1 | unique id | `#userId` | best |
| 2 | one meaningful class | `.btn_search` | check it is not repeated on the page |
| 3 | container + child | `.search_form input`, `.btn_group .btn_outline_error` | how you narrow a class used many times |
| 4 | role + accessible name | `role: button` + `text` | i18n text ⇒ pin `locale:` |
| 5 | structural `nth` | `tr:nth-of-type(4)` | brittle — avoid |
| 6 | `description` | "the blue Login button" | last resort; one miss ⇒ NOT_TESTED |

Level 5 breaks on any layout change and is the usual cause of a scenario that passed
for weeks and then grabbed the wrong element: a document-upload step aimed at
`tr:nth-of-type(4)` was really the second `td` of the same row, and only surfaced
once the executor stopped improvising.

**No relational pseudo-classes (`:has()`, `:is()`).** `button:has(i.pi-download)` missed
on the first try and sent the executor into 28 `browser_batch` calls before the groping
watchdog killed it. **Target the icon itself** (`i.pi-download`) — the click bubbles to
the button, so the behaviour is identical. This is the general rule for icon-only buttons:
they have no accessible name, so `find` cannot name them and `description` cannot rescue
them; the icon's own class is the only stable handle.

**Authoring rule (selector-first).** Resolve a stable `css` or `role`+name from the
component source (Vue/PrimeVue) and put it in the target. `description`/`text` are
last-resort fallbacks, not the primary strategy. The executor tries the target's
strategies **once** and does NOT grope the page — on a first-attempt miss it bails
with NOT_TESTED and reports what it actually saw. A precise selector is what drives
pass rate and speed. For multi-step UI (filters, dropdowns, modals), script the
open→select sequence as explicit steps with `wait_for` between them.

**`description` is also read as an expectation.** It is a last-resort *locator*, but the executor
also compares it against what it sees and bails with NOT_TESTED when the two disagree — even when
`css` or a `ref` alias already pinned the element. A stale description is therefore a scenario bug,
not a harmless comment: a run stopped because its description said "법적행위 목록" while the screen
read "본회의검증". Keep every description true to the screen, or leave it out. This check is the
model's judgment, not a deterministic rule, so never rely on it to verify content — use
`assert_value` for that.

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

**If the trigger also navigates, do not assert the toast at all.** When a submit reloads
the list or routes away, the toast and the page transition race each other and even a
single immediate check loses — a registration-success toast was missed this way and the
run came back PARTIAL although the app was correct. Assert the **resulting state**
instead, which is stable and is what you actually care about: the new row is in the list
(`assert_visible`), or the submit button is gone (`assert_not_visible` after a `wait_for`
on a settled container).

## Result labels

- `PASS` — every assertion verified at runtime.
- `PARTIAL` — some verified, some not (each item carries proof or reason).
- `FAIL` — an assertion was contradicted at runtime.
- `NOT_TESTED` — could not run (timeout, missing data, blocked prerequisite).

On NOT_TESTED, read the run's `executor_log` (path is in the result JSON) to see the
tool sequence and errors — that's how the Planner diagnoses and fixes the scenario.

If the result carries `denied_tools`, the scenario is not at fault: the extension
refused the executor. Check `runner.model` first (haiku is denied every browser
tool), then the extension connection — see Prerequisites. Re-running unchanged
fails identically.

`warnings` reports something the runner noticed about **how** the run went, independent
of the verdict. Today there is one: the executor clicked or typed before taking the
tab's first screenshot. A fresh tab drops those inputs while still reporting success, so
the failure surfaces far from its cause — typically "wrong id or password" on a correct
password, or a button that appears to do nothing. Treat a failure carrying this warning
as unproven and re-run before you go looking for an app bug.

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
