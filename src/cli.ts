import { Command } from "commander";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import { loadConfig } from "./config/loadConfig.js";
import { parseScenario } from "./scenario/parseScenario.js";
import { resolveSecrets } from "./secrets/resolveSecrets.js";
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
  .option("--front-dir <path>", "frontend git 디렉토리(commit 캡처)")
  .action(async (scenarioPath: string, opts: { config: string; frontDir?: string }) => {
    try {
      const config = loadConfig(resolve(opts.config));
      const scenario = parseScenario(readFileSync(resolve(scenarioPath), "utf8"));
      const runId = makeRunId();
      const runDir = join("runs", runId);
      const env = captureEnv({ model: config.runner.model, frontendDir: opts.frontDir });

      const result = await runScenario(scenario, {
        runId,
        targets: { frontend: config.targets.frontend },
        model: config.runner.model,
        env,
        resolveValue: (v) => resolveSecrets(v),
      });

      writeScenarioResult(runDir, result);
      writeSummary(runDir, runId, result.started_at, [result]);
      console.log(`[${result.status}] ${result.scenario_id} → ${join(runDir, result.scenario_id + ".json")}`);
      if (result.evidence?.length) console.log("evidence:", result.evidence.join(" | "));

      process.exit(result.status === "PASS" || result.status === "PARTIAL" ? 0 : 1);
    } catch (err) {
      console.error("실행 오류:", err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

program.parseAsync();
