import { Command } from "commander";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import { loadConfig } from "./config/loadConfig.js";
import { parseScenario } from "./scenario/parseScenario.js";
import { resolveSecrets } from "./secrets/resolveSecrets.js";
import { loadSecretsFile } from "./secrets/loadSecretsFile.js";
import { collectSecretValues, redactSecrets } from "./secrets/redactSecrets.js";
import { runInit, type InitOptions } from "./init.js";
import { runScenario } from "./run/runScenario.js";
import { writeScenarioResult, writeSummary } from "./result/writeResult.js";
import { captureEnv } from "./env/captureEnv.js";
import { makeRunId } from "./util/runId.js";

const program = new Command();
program.name("tester-mcp").description("Opus+Haiku+Chrome 통합 테스트 (Phase 1: 화면검증)");

// [확장5] validate/report/diff 는 여기에 .command() 추가.
program
  .command("run")
  .argument("<scenario>", "시나리오 YAML 경로")
  .option("-c, --config <path>", "설정 파일", "tester-mcp.config.yaml")
  .option("--secrets <path>", "시크릿 파일", "tester-mcp.secrets.yaml")
  .option("--front-dir <path>", "frontend git 디렉토리(commit 캡처)")
  .option("--timeout <ms>", "executor 하드 타임아웃(ms, config runner.timeout_ms 오버라이드)")
  .action(async (scenarioPath: string, opts: { config: string; secrets: string; frontDir?: string; timeout?: string }) => {
    try {
      const config = loadConfig(resolve(opts.config));
      const secrets = loadSecretsFile(resolve(opts.secrets));
      const scenario = parseScenario(readFileSync(resolve(scenarioPath), "utf8"));
      const runId = makeRunId();
      const runDir = join("runs", runId);
      const env = captureEnv({ model: config.runner.model, frontendDir: opts.frontDir });

      const timeoutMs = opts.timeout ? Number(opts.timeout) : config.runner.timeout_ms;
      const result = await runScenario(scenario, {
        runId,
        targets: { frontend: config.targets.frontend },
        model: config.runner.model,
        env,
        resolveValue: (v) => resolveSecrets(v, { secrets }),
        timeoutMs,
      });

      // Redact secret values (secrets file + env SECRET_*) before persisting/printing.
      const safe = redactSecrets(result, collectSecretValues({ secrets, env: process.env }));
      writeScenarioResult(runDir, safe);
      writeSummary(runDir, runId, safe.started_at, [safe]);
      console.log(`[${safe.status}] ${safe.scenario_id} → ${join(runDir, safe.scenario_id + ".json")}`);
      if (safe.evidence?.length) console.log("evidence:", safe.evidence.join(" | "));

      process.exit(result.status === "PASS" || result.status === "PARTIAL" ? 0 : 1);
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

program.parseAsync();
