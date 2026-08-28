import { Command } from "commander";
import { resolve, join, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import { loadConfig } from "./config/loadConfig.js";
import { loadScenario } from "./scenario/loadScenario.js";
import { parseTagFilter, matchesTagFilter } from "./scenario/tags.js";
import { resolveSecrets } from "./secrets/resolveSecrets.js";
import { loadSecretsFile } from "./secrets/loadSecretsFile.js";
import { collectSecretValues, redactSecrets } from "./secrets/redactSecrets.js";
import { runInit, type InitOptions } from "./init.js";
import { runScenarios, clampConcurrency, MAX_CONCURRENCY } from "./run/runScenarios.js";
import { expandScenarioPaths } from "./scenario/expandScenarioPaths.js";
import { resolveRunVars } from "./scenario/vars.js";
import { validateScenarioFiles } from "./validate.js";
import { writeScenarioResult, writeSummary } from "./result/writeResult.js";
import { captureEnv } from "./env/captureEnv.js";
import { makeRunId } from "./util/runId.js";
import { loadGuide } from "./guide/loadGuide.js";
import { checkPreflight, PREFLIGHT_TIMEOUT_MS } from "./preflight/checkPreflight.js";

const program = new Command();

const collectVar = (v: string, prev: string[]) => [...prev, v];
program.name("tester-mcp").description("Opus (planner) + Sonnet (executor) + Chrome screen E2E test orchestrator");

// [ext5] add report/diff commands here.
program
  .command("run")
  .argument("<scenarios...>", "scenario YAML path(s) (files or directories; multiple allowed)")
  .option("-c, --config <path>", "config file", "tester-mcp.config.yaml")
  .option("--secrets <path>", "secrets file", "tester-mcp.secrets.yaml")
  .option("--front-dir <path>", "frontend git dir (for commit capture)")
  .option("--timeout <ms>", "executor hard timeout (ms; overrides config runner.timeout_ms)")
  .option("--concurrency <n>", `parallel executor count (1-${MAX_CONCURRENCY}, default min(scenario count, ${MAX_CONCURRENCY}))`)
  .option("--verbose", "stream executor tool activity to the console")
  .option("--out-dir <path>", "output base dir for results/logs (default runs)", "runs")
  .option("--tag <tags>", "run only scenarios carrying at least one of these comma-separated tags")
  .option("--var <key=value>", "set a scenario var, overriding the config (repeatable)", collectVar, [])
  .option("--no-preflight", "skip the pre-run target health check")
  .action(async (scenarioPaths: string[], opts: { config: string; secrets: string; frontDir?: string; timeout?: string; concurrency?: string; verbose?: boolean; outDir?: string; tag?: string; var: string[]; preflight?: boolean }) => {
    try {
      const config = loadConfig(resolve(opts.config));

      // Runs before scenarios are even loaded: if the target is dead or is a different app, nothing
      // below matters. Do NOT normalize the URL (localhost → 127.0.0.1) — Chrome resolves localhost
      // to ::1 first, so rewriting it here would check a different listener than the executor sees,
      // which is exactly the bug this catches (another app held IPv6 [::1]:5173).
      if (opts.preflight !== false && config.preflight?.length) {
        const failures = await checkPreflight(config.preflight, (url) =>
          fetch(url, { signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS) }));
        if (failures.length) {
          for (const f of failures) console.error(`preflight failed: ${f.url} — ${f.reason}`);
          console.error("no executor was spawned. Fix the target(s) or re-run with --no-preflight.");
          process.exit(2);
        }
      }
      const secrets = loadSecretsFile(resolve(opts.secrets));
      const files = expandScenarioPaths(scenarioPaths);
      const all = files.map((f) => loadScenario(f, resolveRunVars(config.vars, opts.var ?? [])));
      const tagFilter = parseTagFilter(opts.tag);
      const scenarios = all.filter((s) => matchesTagFilter(s.tags, tagFilter));
      if (scenarios.length === 0) {
        console.error(`no scenarios match --tag '${opts.tag}'`);
        process.exit(2);
      }
      const runId = makeRunId();
      const runDir = join(opts.outDir ?? "runs", runId);
      const env = captureEnv({ model: config.runner.model, frontendDir: opts.frontDir });

      const timeoutMs = opts.timeout ? Number(opts.timeout) : config.runner.timeout_ms;
      const concurrency = clampConcurrency(
        opts.concurrency ? Number(opts.concurrency) : undefined,
        scenarios.length
      );
      if (scenarios.length > 1)
        console.log(`${scenarios.length} scenarios · concurrency ${concurrency}`);

      // Compute secret values before run so they can be redacted in streaming logs.
      const secretValues = collectSecretValues({ secrets, env: process.env });

      const results = await runScenarios(scenarios, {
        runId,
        targets: { frontend: config.targets.frontend },
        model: config.runner.model,
        effort: config.runner.effort,
        env,
        resolveValue: (v) => resolveSecrets(v, { secrets }),
        timeoutMs,
      }, concurrency, { verbose: opts.verbose, secretValues, outDir: opts.outDir ?? "runs" });
      const safe = results.map((r) => redactSecrets(r, secretValues));
      const startedAt = safe[0]?.started_at ?? new Date().toISOString();
      for (const s of safe) {
        writeScenarioResult(runDir, s);
        console.log(`[${s.status}] ${s.scenario_id} → ${join(runDir, s.scenario_id + ".json")}`);
        if (s.evidence?.length) console.log("  evidence:", s.evidence.join(" | "));
        for (const w of s.warnings ?? []) console.log("  warning:", w);
      }
      writeSummary(runDir, runId, startedAt, safe);

      // Exit 0 only if every scenario passed or partially passed.
      const ok = safe.every((s) => s.status === "PASS" || s.status === "PARTIAL");
      process.exit(ok ? 0 : 1);
    } catch (err) {
      console.error("run error:", err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

program
  .command("validate")
  .description("Parse + expand scenarios (fragments/refs/vars) without spawning an executor")
  .argument("<scenarios...>", "scenario YAML path(s) (files or directories)")
  .option("-c, --config <path>", "config file (for 'vars'; if the file is absent, vars are empty)", "tester-mcp.config.yaml")
  .option("--expand", "print each valid scenario's fully expanded steps as YAML")
  .option("--var <key=value>", "set a scenario var, overriding the config (repeatable)", collectVar, [])
  .action((scenarioPaths: string[], opts: { config: string; expand?: boolean; var: string[] }) => {
    try {
      let configVars: Record<string, string> = {};
      const cfgPath = resolve(opts.config);
      if (existsSync(cfgPath)) configVars = loadConfig(cfgPath).vars;
      else console.error(`note: config not found (${opts.config}) — vars treated as empty`);
      const vars = resolveRunVars(configVars, opts.var ?? []);
      const files = expandScenarioPaths(scenarioPaths);
      const reports = validateScenarioFiles(files, vars);
      for (const r of reports) {
        if (r.ok) {
          console.log(`OK     ${r.file} (steps: ${r.steps})`);
          if (opts.expand && r.scenario)
            console.log(stringifyYaml({ id: r.scenario.id, steps: r.scenario.steps }));
        } else {
          console.log(`ERROR  ${r.file} — ${r.error}`);
        }
      }
      const bad = reports.filter((r) => !r.ok).length;
      console.log(`${reports.length - bad}/${reports.length} valid`);
      process.exit(bad === 0 ? 0 : 1);
    } catch (err) {
      console.error("validate error:", err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

program
  .command("init")
  .description("Setup wizard: installs the skill and scaffolds config + a secrets example")
  .option("--global", "install the skill globally (~/.claude/skills)")
  .option("--project [path]", "install the skill in a project (<path>/.claude/skills, default cwd)")
  .option("--frontend <url>", "frontend URL")
  .option("--backend <url>", "backend URL (optional)")
  .option("--model <m>", "executor model")
  .option("--yes", "non-interactive (use defaults/flags)")
  .action(async (opts: InitOptions) => {
    try {
      await runInit(opts);
    } catch (err) {
      console.error("init error:", err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

program
  .command("document-guide")
  .description("Print the authoring guide (prerequisites + scenario DSL) to stdout")
  .action(() => {
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      const guide = loadGuide(here, {
        exists: existsSync,
        read: (p) => readFileSync(p, "utf8"),
      });
      process.stdout.write(guide.endsWith("\n") ? guide : guide + "\n");
    } catch (err) {
      console.error("document-guide error:", err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

program.parseAsync();
