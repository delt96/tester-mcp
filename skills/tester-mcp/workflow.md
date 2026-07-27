# tester-mcp — E2E workflow

Follow this whenever you write or edit a scenario. The DSL itself (fields, actions,
target strategies, substitution timing) lives in `tester-mcp document-guide` — this
file is the procedure, not the grammar.

## Phase 1 — Load the reuse surface

Before you grep the app source, read what already exists:

- `scenarios/<project>/_selectors.yaml` — verified selector aliases.
- `scenarios/<project>/_fragments/*.yaml` — shared step sequences and their params.
- the `vars:` map in the config you will pass to `-c`.

Lookup is nearest-ancestor: from the scenario file upward, the first `_fragments/`
dir and the first `_selectors.yaml` win. **A scenario placed outside the project
tree resolves nothing** — `scenarios/legalAct/x.yaml` gets 0 fragments and 0 aliases
while `scenarios/ebill/legalAct/x.yaml` gets 2 and 14. Put the file under the project
directory that owns the assets, or none of the following phases can work.

## Phase 2 — Design and write

Path: `scenarios/<project>/<area>/<id>.yaml`.

- Start with `login_as:` when the flow needs a login. Pin `locale:`. Put required
  data/state in `precondition:`.
- **Selector-first.** Resolve a stable `css` or `role` from the Vue/PrimeVue source
  and put it in the `target`. `description`/`text` are last-resort fallbacks — the
  executor tries the target once and bails NOT_TESTED on a miss.
- **Classify every target as you write it:**
  - *Framework / layout chrome* (`.p-*`, shared button/table/dialog classes) → comes
    from an alias. Look it up; do not re-derive it from the source.
  - *Screen-specific* (e.g. `.gtw-*`) → resolve from the source.
- **Judge destructiveness.** If the flow writes state a rerun cannot undo (submit,
  send, sign, approve, delete), say so in `precondition:` with a `⚠` marker and name
  what becomes irreversible.

## Phase 3 — Reuse gate

Two mechanical checks. Not a judgement call — run them.

1. **Alias sweep.** Grep the files you just wrote for every `css` value in
   `_selectors.yaml` (one alternation pattern covers all of them). Each hit is a
   defect: replace the inline target with `{ ref: <alias> }`. Sole exception — a hit
   that needs scoping the alias cannot express (e.g. `.popup_footer` + the alias css,
   where the `{...alias, ...local}` merge would overwrite it). Keep those inline and
   say why in the step's `description`.
2. **Register new commons.** A NEW selector that is framework/layout chrome goes into
   `_selectors.yaml` now. These are identical across screens: **a new screen never
   means new commons.** Screen-specific selectors get registered once a second
   scenario uses them.

Report from the grep output, not from memory:

    reuse: N aliases applied, M registered, K deliberate inline

Do not say the scenario is written or ready before this passes.

Also flag, but do NOT auto-extract: a step sequence repeated across ≥2 files and ≥8
steps long. Report it and let the user decide — fragment extraction needs param
design and is awkward to undo. Shorter repeats are usually already compressed by
aliases; wrapping those in a fragment costs readability and buys little.

## Phase 4 — Validate, then run

    tester-mcp validate <paths> -c <config>

Fix unknown fragment/ref/var and stray `{{...}}` errors here — this costs no executor
run. Then:

    tester-mcp run <scenarios...> -c <config>

- **Destructive scenarios: name the files explicitly. Never point `run` at a
  directory** — a directory sweep fires every irreversible flow in it.
- Multiple scenarios run in parallel, each in its own browser tab; `--concurrency
  <1-10>` caps it (default `min(count, 10)`). Add `--tag <a,b>` to select a suite.
- Logins are per-tab isolated, but `localStorage` (e.g. `languageType`) is shared —
  keep a parallel batch on one `locale:`, or run mixed locales serially.
- Heavy flows contend on the single Chrome; raise `--timeout` for parallel batches.

## Phase 5 — Judge and feed back

Branch on the result label:

- **PASS / PARTIAL** → report the evidence and screenshots.
- **FAIL** → present the contradicting evidence, screenshots, and `handoff_notes`,
  then move into a fix.
- **NOT_TESTED** → give the reason plus `pattern_inference` (assumed_ok/unknown);
  state the missing precondition, or hand off after repeated failure. Read the
  result's `executor_log` (full tool trail) to diagnose, then fix the selectors.

Then feed the run back into the assets: a **new selector that just passed** is a
verified selector — register it in `_selectors.yaml` if Phase 3 rule 2 applies. Only
selectors that survived a real run belong in the cache; that is what makes the file
trustworthy enough to skip the source grep next time.
