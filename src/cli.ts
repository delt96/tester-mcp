import { Command } from "commander";
import { resolve, join, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config/loadConfig.js";
import { parseScenario } from "./scenario/parseScenario.js";
import { resolveSecrets } from "./secrets/resolveSecrets.js";
import { loadSecretsFile } from "./secrets/loadSecretsFile.js";
import { collectSecretValues, redactSecrets } from "./secrets/redactSecrets.js";
import { runInit, type InitOptions } from "./init.js";
import { runScenarios, clampConcurrency, MAX_CONCURRENCY } from "./run/runScenarios.js";
import { expandScenarioPaths } from "./scenario/expandScenarioPaths.js";
import { writeScenarioResult, writeSummary } from "./result/writeResult.js";
import { captureEnv } from "./env/captureEnv.js";
import { makeRunId } from "./util/runId.js";
import { loadGuide } from "./guide/loadGuide.js";

const program = new Command();
program.name("tester-mcp").description("Opus+Haiku+Chrome 통합 테스트 (Phase 1: 화면검증)");

// [확장5] validate/report/diff 는 여기에 .command() 추가.
program
  .command("run")
  .argument("<scenarios...>", "시나리오 YAML 경로(파일/디렉토리, 여러 개 가능)")
  .option("-c, --config <path>", "설정 파일", "tester-mcp.config.yaml")
  .option("--secrets <path>", "시크릿 파일", "tester-mcp.secrets.yaml")
  .option("--front-dir <path>", "frontend git 디렉토리(commit 캡처)")
  .option("--timeout <ms>", "executor 하드 타임아웃(ms, config runner.timeout_ms 오버라이드)")
  .option("--concurrency <n>", `병렬 executor 수(1~${MAX_CONCURRENCY}, 기본 min(시나리오 수, ${MAX_CONCURRENCY}))`)
  .option("--verbose", "executor 이벤트를 콘솔에 실시간 출력")
  .action(async (scenarioPaths: string[], opts: { config: string; secrets: string; frontDir?: string; timeout?: string; concurrency?: string; verbose?: boolean }) => {
    try {
      const config = loadConfig(resolve(opts.config));
      const secrets = loadSecretsFile(resolve(opts.secrets));
      const files = expandScenarioPaths(scenarioPaths);
      const scenarios = files.map((f) => parseScenario(readFileSync(f, "utf8")));
      const runId = makeRunId();
      const runDir = join("runs", runId);
      const env = captureEnv({ model: config.runner.model, frontendDir: opts.frontDir });

      const timeoutMs = opts.timeout ? Number(opts.timeout) : config.runner.timeout_ms;
      const concurrency = clampConcurrency(
        opts.concurrency ? Number(opts.concurrency) : undefined,
        scenarios.length
      );
      if (scenarios.length > 1)
        console.log(`시나리오 ${scenarios.length}개 · 병렬 ${concurrency}`);

      // Compute secret values before run so they can be redacted in streaming logs.
      const secretValues = collectSecretValues({ secrets, env: process.env });

      const results = await runScenarios(scenarios, {
        runId,
        targets: { frontend: config.targets.frontend },
        model: config.runner.model,
        env,
        resolveValue: (v) => resolveSecrets(v, { secrets }),
        timeoutMs,
      }, concurrency, { verbose: opts.verbose, secretValues });
      const safe = results.map((r) => redactSecrets(r, secretValues));
      const startedAt = safe[0]?.started_at ?? new Date().toISOString();
      for (const s of safe) {
        writeScenarioResult(runDir, s);
        console.log(`[${s.status}] ${s.scenario_id} → ${join(runDir, s.scenario_id + ".json")}`);
        if (s.evidence?.length) console.log("  evidence:", s.evidence.join(" | "));
      }
      writeSummary(runDir, runId, startedAt, safe);

      // Exit 0 only if every scenario passed or partially passed.
      const ok = safe.every((s) => s.status === "PASS" || s.status === "PARTIAL");
      process.exit(ok ? 0 : 1);
    } catch (err) {
      console.error("실행 오류:", err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

program
  .command("init")
  .description("스킬·설정·시크릿 예시를 설치하는 셋업 마법사")
  .option("--global", "전역 스킬 설치(~/.claude/skills)")
  .option("--project [path]", "프로젝트 스킬 설치(<path>/.claude/skills, 기본 cwd)")
  .option("--frontend <url>", "frontend URL")
  .option("--backend <url>", "backend URL(선택)")
  .option("--model <m>", "executor 모델")
  .option("--yes", "비대화형(기본값/플래그 사용)")
  .action(async (opts: InitOptions) => {
    try {
      await runInit(opts);
    } catch (err) {
      console.error("init 오류:", err instanceof Error ? err.message : err);
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
