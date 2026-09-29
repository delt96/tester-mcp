# executor 보고 채널 · optional 스텝 · 가드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** executor가 스텝·판정을 MCP 도구 호출로 보고하게 하고, runner가 그것과 오류형 결과·권한 거부 사유·브라우저 핀·반복 클릭·init 정보를 스트림에서 읽어 결과 JSON에 남기며, 스텝 단위 `optional: true`를 DSL에 더한다.

**Architecture:** 동봉 MCP 서버(`bin/executor-tools.cjs`, 서버명 `tester`)가 `approve`·`report_steps`·`report_final` 세 도구를 제공한다. 서버는 저장하지 않고, runner의 `streamParser`가 stream-json의 `tool_use`/`tool_result`/`system`/`result` 이벤트에서 모든 것을 수집한다. `runScenario`는 `report_final` → kill/오류형 → 텍스트 JSON 폴백 순으로 결과를 조립한다. 계약(`SYSTEM_CONTRACT`)과 사용자 프롬프트가 보고 규약·클릭 1회·optional 규칙을 지시한다.

**Tech Stack:** Node 20+, TypeScript(ESM, `tsc`), vitest, commander, yaml. MCP 서버는 의존성 없는 CommonJS(`.cjs`) JSON-RPC stdio.

**Spec:** `docs/superpowers/specs/2026-09-28-executor-reporting-and-guards-design.md`

## Global Constraints

- 소스 텍스트(주석·테스트 설명·CLI 메시지·result 문자열·계약)는 **영어**. 대화와 문서만 한글.
- 주석은 코드로 역추론 불가능한 "왜"만. 변경 이력 주석 금지.
- 결과 JSON은 **추가만**: 기존 필드 이름·의미 불변. `Status` 네 값(`PASS|PARTIAL|FAIL|NOT_TESTED`) 불변, `SKIPPED`는 스텝에만.
- `streamParser`는 도구 인자를 저장하지 않는다 — 예외는 `mcp__tester__report_steps`·`report_final`의 인자, `select_browser`의 `deviceId`, `computer`의 `action`/`coordinate`/`ref`, `javascript_tool` 텍스트의 **해시**뿐.
- `bin/`은 npm `files`에 포함되므로 서버 파일은 거기 둔다. 경로는 슬래시(`C:/…`)로 정규화(Git Bash `/c/…` 경로는 서버가 안 뜬다 — 2026-09-28 실측).
- `--permission-prompt-tool mcp__tester__approve`는 유지. `--disallowedTools`에 `mcp__tester__approve`는 넣고 보고 도구 2개는 넣지 않는다.
- 커밋은 사용자가 지시할 때만(이 세션 규칙). 각 Task의 "Commit" 단계는 `git add`까지만 하고 커밋 명령은 사용자 지시 후 실행한다.
- 테스트 실행: `npx vitest run <file>`; 전체 `npm test`. 빌드 `npm run build`. 기존 실패 1건(`tests/scenario/loadScenario.ebill.test.ts`, 미커밋 seed yaml의 `${today}`)은 이 플랜과 무관하며 건드리지 않는다.

## Review Focus

1. `report_steps`가 같은 `index`를 두 번 보고(먼저 FAIL, 나중 PASS) → 나중 것이 결과에 남아야 한다. (Task 2 테스트 "later report wins")
2. `report_final` 없이 executor가 정상 종료하고 텍스트 JSON도 없는 경우(빈 `result`) → NOT_TESTED + "ended without report_final" 사유, 보고된 steps는 보존. (Task 3 테스트 "empty result text")
3. `report_steps`의 `index`가 시나리오 길이를 넘는 경우(예: 31 in a 30-step scenario) → 버리지 않고 `action: "?"`로 남긴다. (Task 3 테스트 "out-of-range index")
4. `browser_batch` 안의 클릭이 이전 단독 `computer` 클릭과 같은 좌표인 경우 → 반복으로 잡혀야 한다. (Task 2 테스트 "batch click repeats")
5. `permission_denied` 이벤트의 `decision_reason`이 문자열이 아닌 객체로 오는 경우 → 크래시 없이 JSON 문자열 200자로 저장. (Task 2 테스트 "non-string decision_reason")

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `bin/executor-tools.cjs` | MCP stdio 서버: `approve`, `report_steps`, `report_final`. 검증 로직은 `module.exports`로 노출 | 신규 (`bin/approver.cjs` 삭제) |
| `src/run/executorTools.ts` | 서버 파일 경로·서버명·도구 이름 상수 (buildExecutorArgs와 streamParser가 공유) | 신규 |
| `src/run/buildExecutorArgs.ts` | `--mcp-config`에 tester 서버, deny 목록 | 수정 |
| `src/run/streamParser.ts` | 수집: reportedSteps·finalReport·permissionDenied·resultMeta·init·browserPin·tabsBeforePin·repeatedClicks | 수정 |
| `src/result/types.ts` | `StepStatus`, `StepResult.note`, `ScenarioResult.reported_via/claude_code_version/browser_pin`, `RunSummary.claude_code_version` | 수정 |
| `src/run/runScenario.ts` | 조립 우선순위, 경고 생성, 사유 우선순위 | 수정 |
| `src/run/assembleWarnings.ts` | init·핀·반복 클릭 경고 문자열 생성 + `KNOWN_BUILTIN_TOOLS` | 신규 |
| `src/scenario/types.ts`, `src/scenario/parseScenario.ts`, `src/scenario/actions.ts` | 스텝 `optional`, 렌더 접미 | 수정 |
| `src/run/buildPrompt.ts` | `[Reporting]`·`[One click per click step]`·`[Optional steps]`, `# Reporting` 블록 | 수정 |
| `src/result/previousRun.ts` | 직전 run summary의 `claude_code_version` 읽기 | 신규 |
| `src/result/writeResult.ts`, `src/cli.ts` | summary에 버전 기록, 직전 버전 전달 | 수정 |
| `skills/tester-mcp/document-guide.md` | `optional` 필드, `SKIPPED`, 보고 규약, haiku 문단 갱신 | 수정 |
| `scenarios/uzb/_fragments/login.yaml` | `optional: true` 적용 | 수정 |
| tests | `tests/run/executorTools.test.ts`(신규), `buildExecutorArgs`, `streamParser`, `runScenario`, `buildPrompt`, `assembleWarnings`(신규), `tests/scenario/parseScenario`, `actions`, `tests/result/previousRun`(신규), `writeResult` | |

---

### Task 1: 동봉 MCP 서버에 보고 도구 추가

**Files:**
- Create: `bin/executor-tools.cjs`
- Delete: `bin/approver.cjs`
- Create: `src/run/executorTools.ts`
- Modify: `src/run/buildExecutorArgs.ts`
- Test: `tests/run/executorTools.test.ts`(신규), `tests/run/buildExecutorArgs.test.ts`

**Interfaces:**
- Produces: `src/run/executorTools.ts` — `EXECUTOR_TOOLS_PATH: string`, `TESTER_SERVER = "tester"`, `APPROVER_TOOL = "mcp__tester__approve"`, `REPORT_STEPS_TOOL = "mcp__tester__report_steps"`, `REPORT_FINAL_TOOL = "mcp__tester__report_final"`.
- Produces: `bin/executor-tools.cjs` exports `{ callTool(name, args), TOOLS, STEP_STATUSES, FINAL_STATUSES }`; `require.main === module`일 때만 stdio 루프.

- [ ] **Step 1: 서버 테스트 작성**

`tests/run/executorTools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { EXECUTOR_TOOLS_PATH } from "../../src/run/executorTools.js";

const require = createRequire(import.meta.url);
const server = require(EXECUTOR_TOOLS_PATH) as {
  callTool(name: string, args: Record<string, unknown>): { isError?: boolean; content: { type: string; text: string }[] };
  TOOLS: { name: string }[];
};

describe("executor-tools server (unit)", () => {
  it("exposes approve, report_steps and report_final", () => {
    expect(server.TOOLS.map((t) => t.name)).toEqual(["approve", "report_steps", "report_final"]);
  });
  it("approve allows every request and echoes the input", () => {
    const r = server.callTool("approve", { tool_name: "x", input: { a: 1 } });
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0].text)).toEqual({ behavior: "allow", updatedInput: { a: 1 } });
  });
  it("report_steps accepts a batch and says how many it recorded", () => {
    const r = server.callTool("report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "SKIPPED", note: "no header" }] });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toBe("recorded 2 step(s)");
  });
  it("report_steps rejects a non-integer index and names the entry", () => {
    const r = server.callTool("report_steps", { steps: [{ index: "35-36", status: "PASS" }] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/steps\[0\]\.index/);
    expect(r.content[0].text).toMatch(/35-36/);
  });
  it("report_steps rejects an unknown status and an empty array", () => {
    expect(server.callTool("report_steps", { steps: [{ index: 1, status: "OK" }] }).isError).toBe(true);
    expect(server.callTool("report_steps", { steps: [] }).isError).toBe(true);
  });
  it("report_final accepts the four labels and rejects others", () => {
    expect(server.callTool("report_final", { status: "PASS", evidence: ["e"] }).content[0].text).toBe("recorded final: PASS");
    expect(server.callTool("report_final", { status: "DONE", evidence: [] }).isError).toBe(true);
    expect(server.callTool("report_final", { status: "PASS" }).isError).toBe(true);
  });
  it("unknown tool is an error", () => {
    expect(server.callTool("nope", {}).isError).toBe(true);
  });
});

describe("executor-tools server (stdio)", () => {
  it("answers initialize, tools/list and tools/call over stdin/stdout", () => {
    const input = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "report_steps", arguments: { steps: [{ index: 1, status: "PASS" }] } } },
    ].map((m) => JSON.stringify(m)).join("\n") + "\n";
    const out = spawnSync(process.execPath, [EXECUTOR_TOOLS_PATH], { input, encoding: "utf8", timeout: 10_000 });
    const lines = out.stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "tester" } } });
    expect(lines[1].result.tools.map((t: { name: string }) => t.name)).toEqual(["approve", "report_steps", "report_final"]);
    expect(lines[2]).toMatchObject({ id: 3, result: { content: [{ type: "text", text: "recorded 1 step(s)" }] } });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/run/executorTools.test.ts`
Expected: FAIL — `executorTools.js` 모듈 없음.

- [ ] **Step 3: 상수 모듈과 서버 작성**

`src/run/executorTools.ts`:

```ts
import { fileURLToPath } from "node:url";

// bin/ ships in the package, so the same relative path resolves from src/ (tsx) and dist/ (build).
// Forward slashes: a Git Bash style /c/... path does not start the server on Windows (measured 2026-09-28).
export const EXECUTOR_TOOLS_PATH = fileURLToPath(new URL("../../bin/executor-tools.cjs", import.meta.url)).replace(/\\/g, "/");
export const TESTER_SERVER = "tester";
export const APPROVER_TOOL = `mcp__${TESTER_SERVER}__approve`;
export const REPORT_STEPS_TOOL = `mcp__${TESTER_SERVER}__report_steps`;
export const REPORT_FINAL_TOOL = `mcp__${TESTER_SERVER}__report_final`;
```

`bin/executor-tools.cjs` (기존 `bin/approver.cjs`는 삭제):

```js
#!/usr/bin/env node
// MCP stdio server the runner attaches to every executor (see src/run/buildExecutorArgs.ts).
// `approve` answers Claude in Chrome's approval gate, which --dangerously-skip-permissions does not
// cover. `report_steps` / `report_final` exist so step results travel as tool calls the runner reads
// from stream-json: a killed executor still leaves the steps it reported, and a malformed index is
// rejected here instead of breaking the whole result. The server stores nothing.
const readline = require("node:readline");

const STEP_STATUSES = ["PASS", "FAIL", "SKIPPED", "NOT_TESTED"];
const FINAL_STATUSES = ["PASS", "PARTIAL", "FAIL", "NOT_TESTED"];

const TOOLS = [
  {
    name: "approve",
    description: "Permission handler: allows every request from the executor.",
    inputSchema: { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } } },
  },
  {
    name: "report_steps",
    description: "Report finished scenario steps. Call it after each step; steps finished in the same turn go in one call. index is the step number shown in the scenario (a single integer, 1-based).",
    inputSchema: {
      type: "object", required: ["steps"],
      properties: { steps: { type: "array", minItems: 1, items: {
        type: "object", required: ["index", "status"],
        properties: { index: { type: "integer", minimum: 1 }, status: { type: "string", enum: STEP_STATUSES }, note: { type: "string" } },
      } } },
    },
  },
  {
    name: "report_final",
    description: "Report the scenario verdict once, at the end — also before stopping early with NOT_TESTED.",
    inputSchema: {
      type: "object", required: ["status", "evidence"],
      properties: {
        status: { type: "string", enum: FINAL_STATUSES }, evidence: { type: "array", items: { type: "string" } },
        handoff_notes: { type: "string" }, not_tested_reason: { type: "string" }, screenshots: { type: "array", items: { type: "string" } },
      },
    },
  },
];

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return "steps must be a non-empty array";
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] || {};
    if (!Number.isInteger(s.index) || s.index < 1)
      return `steps[${i}].index must be a single integer >= 1 (got ${JSON.stringify(s.index)}). A range like 35-36 is not allowed: report one entry per step.`;
    if (!STEP_STATUSES.includes(s.status))
      return `steps[${i}].status must be one of ${STEP_STATUSES.join("|")} (got ${JSON.stringify(s.status)})`;
  }
  return null;
}

function validateFinal(a) {
  if (!FINAL_STATUSES.includes(a.status)) return `status must be one of ${FINAL_STATUSES.join("|")} (got ${JSON.stringify(a.status)})`;
  if (!Array.isArray(a.evidence)) return "evidence must be an array of strings";
  return null;
}

const text = (t, isError) => (isError ? { isError: true, content: [{ type: "text", text: t }] } : { content: [{ type: "text", text: t }] });

function callTool(name, args) {
  const a = args || {};
  if (name === "approve") return text(JSON.stringify({ behavior: "allow", updatedInput: a.input || {} }));
  if (name === "report_steps") { const err = validateSteps(a.steps); return err ? text(err, true) : text(`recorded ${a.steps.length} step(s)`); }
  if (name === "report_final") { const err = validateFinal(a); return err ? text(err, true) : text(`recorded final: ${a.status}`); }
  return text(`unknown tool: ${name}`, true);
}

function serve() {
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: {
        protocolVersion: (msg.params && msg.params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} }, serverInfo: { name: "tester", version: "1" },
      } });
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    } else if (msg.method === "tools/call") {
      send({ jsonrpc: "2.0", id: msg.id, result: callTool(msg.params && msg.params.name, msg.params && msg.params.arguments) });
    } else if (msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  });
}

module.exports = { callTool, TOOLS, STEP_STATUSES, FINAL_STATUSES };
if (require.main === module) serve();
```

`src/run/buildExecutorArgs.ts` 변경(상수 이동 + 서버명):

```ts
import { EXECUTOR_TOOLS_PATH, TESTER_SERVER, APPROVER_TOOL } from "./executorTools.js";

export interface ExecutorArgsOptions {
  prompt: string; systemPrompt: string; model: string; effort?: string;
  allowRead?: boolean;
}

export function buildExecutorArgs(o: ExecutorArgsOptions): string[] {
  // (기존 주석 유지. "--mcp-config holding ONLY the approver" 문구는 "holding ONLY the tester server (approve + step reports)"로 고친다.)
  const effort = o.effort ? ["--effort", o.effort] : [];
  // The approve tool is denied to the MODEL only; the CLI still calls it as the permission handler
  // (measured 2026-09-28). report_steps / report_final stay open — the model must call them.
  const denied = ["Skill", "Task", "Agent", "Bash", "Write", "Edit", "NotebookEdit", "Glob", "Grep", "WebFetch", "WebSearch", APPROVER_TOOL];
  if (!o.allowRead) denied.push("Read");
  const mcpConfig = { mcpServers: { [TESTER_SERVER]: { command: process.execPath.replace(/\\/g, "/"), args: [EXECUTOR_TOOLS_PATH] } } };
  return [ /* 기존 배열 그대로, "--permission-prompt-tool", APPROVER_TOOL 유지 */ ];
}
```

`export const APPROVER_PATH`·`APPROVER_TOOL`은 buildExecutorArgs에서 제거하고 `executorTools.ts`에서 re-export 하지 않는다(테스트 import 경로를 바꾼다).

- [ ] **Step 4: buildExecutorArgs 테스트 갱신**

`tests/run/buildExecutorArgs.test.ts`에서 `import { buildExecutorArgs, APPROVER_TOOL } from "../../src/run/buildExecutorArgs.js"` → `import { buildExecutorArgs } from "../../src/run/buildExecutorArgs.js"; import { APPROVER_TOOL } from "../../src/run/executorTools.js";`. 기존 "loads minimal context" 테스트의 `toEqual(["approver"])` → `toEqual(["tester"])`. "attaches the bundled approver" 테스트의 `mcp.mcpServers.approver` → `mcp.mcpServers.tester`, 경로 정규식 `/bin\/approver\.cjs$/` → `/bin\/executor-tools\.cjs$/`. 다음 단언 추가:

```ts
    for (const t of ["mcp__tester__report_steps", "mcp__tester__report_final"])
      expect(a[a.indexOf("--disallowedTools") + 1].split(",")).not.toContain(t);
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/run/executorTools.test.ts tests/run/buildExecutorArgs.test.ts`
Expected: PASS (unit 7 + stdio 1 + args 6).

- [ ] **Step 6: 스테이징**

```bash
git rm --cached -q bin/approver.cjs 2>/dev/null; rm -f bin/approver.cjs
git add bin/executor-tools.cjs src/run/executorTools.ts src/run/buildExecutorArgs.ts tests/run/executorTools.test.ts tests/run/buildExecutorArgs.test.ts
```

---

### Task 2: streamParser — 보고·거부·오류형·init·핀·반복 클릭 수집

**Files:**
- Modify: `src/result/types.ts` (add `StepStatus`, `REPORTED_STEP_STATUSES` only — the rest of the type changes are Task 3)
- Modify: `src/run/streamParser.ts`
- Test: `tests/run/streamParser.test.ts`

**Interfaces:**
- Consumes: `REPORT_STEPS_TOOL`, `REPORT_FINAL_TOOL` from `src/run/executorTools.ts`; `Status`, `STATUSES` from `src/result/types.ts`.
- Produces in `src/result/types.ts` (append after `STATUSES`):
  ```ts
  export type StepStatus = Status | "SKIPPED";
  // What report_steps accepts. PARTIAL is a run verdict, not a step outcome; the text path may still carry it.
  export const REPORTED_STEP_STATUSES: StepStatus[] = ["PASS", "FAIL", "SKIPPED", "NOT_TESTED"];
  ```
- Produces (`StreamState` 추가 필드):
  ```ts
  export interface ReportedStep { index: number; status: StepStatus; note?: string; }
  export interface FinalReport { status: Status; evidence: string[]; handoff_notes?: string; not_tested_reason?: string; screenshots?: string[]; }
  export interface PermissionDenied { tool: string; reasonType?: string; reason?: string; }
  export interface ResultMeta { subtype?: string; isError: boolean; errors?: string[]; terminalReason?: string; }
  export interface InitInfo { claudeCodeVersion?: string; builtinTools: string[]; mcpServers: { name: string; status: string }[]; }
  export interface BrowserPin { requested?: string; ok?: boolean; error?: string; }
  export interface RepeatedClick { call: number; key: string; }
  // StreamState += reportedSteps: ReportedStep[]; finalReport?: FinalReport; permissionDenied: PermissionDenied[];
  //                resultMeta?: ResultMeta; init?: InitInfo; browserPin?: BrowserPin; tabsBeforePin: boolean; repeatedClicks: RepeatedClick[];
  ```

- [ ] **Step 1: 실패 테스트 작성** — `tests/run/streamParser.test.ts` 끝에 추가

```ts
const ev = (o: unknown) => JSON.stringify(o);
const use = (id: string, name: string, input: Record<string, unknown>) =>
  ev({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const res = (id: string, is_error: boolean, content: unknown) =>
  ev({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error, content }] } });
const feed = (ls: string[]) => { const acc = makeStreamAccumulator(() => 0); for (const l of ls) acc.push(l); return acc.snapshot(); };

describe("step reports via the tester tools", () => {
  it("collects report_steps batches; a later report of the same index wins", () => {
    const s = feed([
      use("a", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "FAIL", note: "no header" }] }),
      use("b", "mcp__tester__report_steps", { steps: [{ index: 2, status: "PASS" }] }),
    ]);
    expect(s.reportedSteps).toEqual([{ index: 1, status: "PASS" }, { index: 2, status: "PASS" }]);
  });
  it("drops malformed entries (non-integer index, unknown status) but keeps the good ones", () => {
    const s = feed([use("a", "mcp__tester__report_steps", { steps: [{ index: "3-4", status: "PASS" }, { index: 5, status: "OK" }, { index: 6, status: "SKIPPED" }] })]);
    expect(s.reportedSteps).toEqual([{ index: 6, status: "SKIPPED" }]);
  });
  it("captures report_final (the last one wins) and filters evidence to strings", () => {
    const s = feed([
      use("a", "mcp__tester__report_final", { status: "FAIL", evidence: ["x"] }),
      use("b", "mcp__tester__report_final", { status: "PASS", evidence: ["ok", 7], handoff_notes: "h", screenshots: ["C:/s.png"] }),
    ]);
    expect(s.finalReport).toEqual({ status: "PASS", evidence: ["ok"], handoff_notes: "h", not_tested_reason: undefined, screenshots: ["C:/s.png"] });
  });
  it("ignores a report_final with a status outside the four labels", () => {
    expect(feed([use("a", "mcp__tester__report_final", { status: "DONE", evidence: [] })]).finalReport).toBeUndefined();
  });
  it("does not count report tools as chrome activity for the groping signal", () => {
    const s = feed([use("a", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }] }), use("b", "mcp__tester__report_steps", { steps: [{ index: 2, status: "PASS" }] })]);
    expect(s.consecutiveTool).toBe(2);   // still counted as tool calls (unchanged behaviour), documented here on purpose
  });
});

describe("permission_denied, result meta and init", () => {
  it("records permission_denied events with their reason", () => {
    const s = feed([ev({ type: "system", subtype: "permission_denied", tool_name: "mcp__claude-in-chrome__tabs_create_mcp", decision_reason_type: "asyncAgent", decision_reason: "requires approval, no approval surface" })]);
    expect(s.permissionDenied).toEqual([{ tool: "mcp__claude-in-chrome__tabs_create_mcp", reasonType: "asyncAgent", reason: "requires approval, no approval surface" }]);
  });
  it("stringifies a non-string decision_reason instead of crashing", () => {
    const s = feed([ev({ type: "system", subtype: "permission_denied", tool_name: "X", decision_reason: { code: 7 } })]);
    expect(s.permissionDenied[0].reason).toBe('{"code":7}');
  });
  it("keeps result meta even when the result event has no result string", () => {
    const s = feed([ev({ type: "result", subtype: "error_max_budget_usd", is_error: true, errors: ["Reached maximum budget ($0.0001)"], terminal_reason: "budget_exhausted" })]);
    expect(s.envelope?.result).toBe("");
    expect(s.resultMeta).toEqual({ subtype: "error_max_budget_usd", isError: true, errors: ["Reached maximum budget ($0.0001)"], terminalReason: "budget_exhausted" });
  });
  it("splits the init tool list into built-in and MCP, and keeps version and servers", () => {
    const s = feed([ev({ type: "system", subtype: "init", claude_code_version: "2.1.283", tools: ["ToolSearch", "mcp__claude-in-chrome__find", "mcp__tester__approve"], mcp_servers: [{ name: "tester", status: "connected" }, { name: "claude-in-chrome", status: "connected" }] })]);
    expect(s.init).toEqual({ claudeCodeVersion: "2.1.283", builtinTools: ["ToolSearch"], mcpServers: [{ name: "tester", status: "connected" }, { name: "claude-in-chrome", status: "connected" }] });
  });
});

describe("browser pin", () => {
  it("records a successful select_browser with the requested deviceId", () => {
    const s = feed([use("p", "mcp__claude-in-chrome__select_browser", { deviceId: "d79" }), res("p", false, [{ type: "text", text: "Selected browser" }])]);
    expect(s.browserPin).toEqual({ requested: "d79", ok: true, error: undefined });
    expect(s.tabsBeforePin).toBe(false);
  });
  it("records a failed select_browser with the first 200 chars of the error", () => {
    const s = feed([use("p", "mcp__claude-in-chrome__select_browser", { deviceId: "d79" }), res("p", true, "No browser with deviceId d79 is connected. " + "x".repeat(300))]);
    expect(s.browserPin?.ok).toBe(false);
    expect(s.browserPin?.error).toHaveLength(200);
  });
  it("flags a tab tool used before any select_browser", () => {
    const s = feed([use("t", "mcp__claude-in-chrome__tabs_context_mcp", { createIfEmpty: true })]);
    expect(s.tabsBeforePin).toBe(true);
    expect(s.browserPin).toBeUndefined();
  });
});

describe("repeated clicks", () => {
  const click = (id: string, x: number, y: number) => use(id, "mcp__claude-in-chrome__computer", { action: "left_click", coordinate: [x, y] });
  it("flags the same coordinate clicked again within the last 8 calls", () => {
    const s = feed([click("1", 10, 10), use("2", "mcp__claude-in-chrome__find", { q: "x" }), click("3", 10, 10)]);
    expect(s.repeatedClicks).toEqual([{ call: 3, key: "computer:left_click:[10,10]" }]);
  });
  it("does not flag a click more than 8 calls later", () => {
    const filler = Array.from({ length: 8 }, (_, i) => use(`f${i}`, "mcp__claude-in-chrome__find", { q: String(i) }));
    expect(feed([click("1", 10, 10), ...filler, click("9", 10, 10)]).repeatedClicks).toEqual([]);
  });
  it("keys javascript clicks by a hash of the script and never stores the script", () => {
    const js = "document.querySelector('#save').click()";
    const s = feed([use("1", "mcp__claude-in-chrome__javascript_tool", { text: js }), use("2", "mcp__claude-in-chrome__javascript_tool", { text: js })]);
    expect(s.repeatedClicks).toHaveLength(1);
    expect(s.repeatedClicks[0].key).toMatch(/^js:[0-9a-f]{8}$/);
    expect(JSON.stringify(s)).not.toContain("#save");
  });
  it("sees clicks inside browser_batch as separate calls", () => {
    const s = feed([click("1", 5, 5), use("2", "mcp__claude-in-chrome__browser_batch", { actions: [{ name: "computer", input: { action: "left_click", coordinate: [5, 5] } }] })]);
    expect(s.repeatedClicks).toHaveLength(1);
  });
  it("ignores non-click computer actions and non-click scripts", () => {
    const s = feed([use("1", "mcp__claude-in-chrome__computer", { action: "screenshot" }), use("2", "mcp__claude-in-chrome__computer", { action: "screenshot" }), use("3", "mcp__claude-in-chrome__javascript_tool", { text: "document.title" }), use("4", "mcp__claude-in-chrome__javascript_tool", { text: "document.title" })]);
    expect(s.repeatedClicks).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/run/streamParser.test.ts`
Expected: FAIL — `reportedSteps`·`finalReport` 등 undefined.

- [ ] **Step 3: 구현** — `src/run/streamParser.ts` 전체를 아래로 교체

```ts
import { createHash } from "node:crypto";
import type { Envelope } from "./spawnExecutor.js";
import { REPORT_STEPS_TOOL, REPORT_FINAL_TOOL } from "./executorTools.js";
import { STATUSES, REPORTED_STEP_STATUSES, type Status, type StepStatus } from "../result/types.js";

export interface TrailItem { t_ms: number; phase: "use" | "result"; tool?: string; is_error?: boolean; }
export interface ReportedStep { index: number; status: StepStatus; note?: string; }
export interface FinalReport { status: Status; evidence: string[]; handoff_notes?: string; not_tested_reason?: string; screenshots?: string[]; }
export interface PermissionDenied { tool: string; reasonType?: string; reason?: string; }
export interface ResultMeta { subtype?: string; isError: boolean; errors?: string[]; terminalReason?: string; }
export interface InitInfo { claudeCodeVersion?: string; builtinTools: string[]; mcpServers: { name: string; status: string }[]; }
export interface BrowserPin { requested?: string; ok?: boolean; error?: string; }
export interface RepeatedClick { call: number; key: string; }

export interface StreamState {
  envelope?: Envelope;
  trail: TrailItem[];
  lastTool?: string;
  toolCount: number;
  consecutiveTool: number;   // run-length of the same tool_use back-to-back (groping signal)
  deniedTools: string[];     // tool names from the result event's permission_denials
  inputBeforeScreenshot: boolean;  // clicked/typed before the tab's first screenshot → input was silently dropped
  reportedSteps: ReportedStep[];   // from mcp__tester__report_steps, index-unique, later report wins
  finalReport?: FinalReport;       // from mcp__tester__report_final, last one wins
  permissionDenied: PermissionDenied[];
  resultMeta?: ResultMeta;
  init?: InitInfo;
  browserPin?: BrowserPin;         // first select_browser call and its result
  tabsBeforePin: boolean;          // a tab tool ran while no select_browser had been called
  repeatedClicks: RepeatedClick[]; // same click key seen again within the last CLICK_WINDOW calls
}

const COMPUTER_TOOL_RE = /(^|__)computer$/;
const SELECT_BROWSER_RE = /__select_browser$/;
const TAB_TOOL_RE = /__(tabs_create_mcp|tabs_context_mcp|navigate)$/;
const JS_TOOL_RE = /__javascript_tool$/;
const BATCH_TOOL_RE = /__browser_batch$/;
// Anything that drives the page. 'wait'/'cursor_position' are harmless and deliberately absent.
const INPUT_ACTIONS = new Set([
  "left_click", "right_click", "middle_click", "double_click", "triple_click",
  "left_click_drag", "mouse_move", "type", "key", "hold_key", "scroll",
]);
const CLICK_WINDOW = 8;
const ERROR_TEXT_MAX = 200;
const REASON_TEXT_MAX = 200;

function clickKey(name: string, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  if (COMPUTER_TOOL_RE.test(name)) {
    const action = input.action;
    if (typeof action !== "string" || !/click/.test(action)) return undefined;
    return `computer:${action}:${JSON.stringify(input.coordinate ?? input.ref ?? "")}`;
  }
  if (JS_TOOL_RE.test(name)) {
    const text = String(input.text ?? input.code ?? "");
    // Only the hash is kept: the script can carry form values.
    if (/\.click\(\)|MouseEvent|\.submit\(\)/.test(text)) return "js:" + createHash("sha1").update(text).digest("hex").slice(0, 8);
  }
  return undefined;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join(" ");
  return "";
}

// Parses stream-json lines into a diagnostic snapshot. Stores ONLY event types / tool names /
// timing — never tool inputs or assistant text (which may contain secrets). The exceptions are
// listed on the fields above: the tester report tools' arguments (the run result itself, redacted
// downstream), select_browser's deviceId, computer's action/coordinate/ref, and a hash of
// javascript_tool text. `now` is injected for deterministic timing in tests.
export function makeStreamAccumulator(now: () => number = () => Date.now()) {
  const t0 = now();
  const state: StreamState = {
    trail: [], toolCount: 0, consecutiveTool: 0, deniedTools: [], inputBeforeScreenshot: false,
    reportedSteps: [], permissionDenied: [], tabsBeforePin: false, repeatedClicks: [],
  };
  let screenshotSeen = false;
  let pinCalled = false;
  const pending = new Map<string, string>();       // tool_use id → tool name (to pair results)
  const stepsByIndex = new Map<number, ReportedStep>();
  const recentClickKeys: (string | undefined)[] = [];  // one slot per tool call, newest last

  function noteClick(key: string | undefined) {
    if (key && recentClickKeys.includes(key)) state.repeatedClicks.push({ call: state.toolCount, key });
    recentClickKeys.push(key);
    if (recentClickKeys.length > CLICK_WINDOW) recentClickKeys.shift();
  }

  function recordSteps(input: Record<string, unknown> | undefined) {
    const steps = input?.steps;
    if (!Array.isArray(steps)) return;
    for (const raw of steps as Array<Record<string, unknown>>) {
      const index = raw?.index, status = raw?.status;
      if (!Number.isInteger(index) || (index as number) < 1 || !REPORTED_STEP_STATUSES.includes(status as StepStatus)) continue;
      const step: ReportedStep = { index: index as number, status: status as StepStatus };
      if (typeof raw.note === "string") step.note = raw.note;
      stepsByIndex.set(step.index, step);
    }
    state.reportedSteps = [...stepsByIndex.values()].sort((a, b) => a.index - b.index);
  }

  function recordFinal(input: Record<string, unknown> | undefined) {
    if (!input || !STATUSES.includes(input.status as Status)) return;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    state.finalReport = {
      status: input.status as Status,
      evidence: strings(input.evidence),
      handoff_notes: typeof input.handoff_notes === "string" ? input.handoff_notes : undefined,
      not_tested_reason: typeof input.not_tested_reason === "string" ? input.not_tested_reason : undefined,
      screenshots: Array.isArray(input.screenshots) ? strings(input.screenshots) : undefined,
    };
  }

  function handleToolUse(c: Record<string, unknown>) {
    const tool = typeof c.name === "string" ? c.name : undefined;
    const input = c.input as Record<string, unknown> | undefined;
    state.trail.push({ t_ms: now() - t0, phase: "use", tool });
    state.consecutiveTool = tool && tool === state.lastTool ? state.consecutiveTool + 1 : 1;
    state.lastTool = tool;
    state.toolCount++;
    if (typeof c.id === "string" && tool) pending.set(c.id, tool);
    if (!tool) { noteClick(undefined); return; }
    if (tool === REPORT_STEPS_TOOL) { recordSteps(input); noteClick(undefined); return; }
    if (tool === REPORT_FINAL_TOOL) { recordFinal(input); noteClick(undefined); return; }
    if (SELECT_BROWSER_RE.test(tool)) {
      pinCalled = true;
      if (!state.browserPin) state.browserPin = { requested: typeof input?.deviceId === "string" ? input.deviceId : undefined };
    } else if (TAB_TOOL_RE.test(tool) && !pinCalled) {
      state.tabsBeforePin = true;
    }
    if (COMPUTER_TOOL_RE.test(tool)) {
      const action = input?.action;
      if (action === "screenshot") screenshotSeen = true;
      else if (typeof action === "string" && INPUT_ACTIONS.has(action) && !screenshotSeen) state.inputBeforeScreenshot = true;
    }
    if (BATCH_TOOL_RE.test(tool)) {
      const actions = Array.isArray(input?.actions) ? (input!.actions as Array<Record<string, unknown>>) : [];
      let any = false;
      for (const a of actions) {
        if (a?.name === "computer") { noteClick(clickKey("computer", a.input as Record<string, unknown>)); any = true; }
      }
      if (!any) noteClick(undefined);
      return;
    }
    noteClick(clickKey(tool, input));
  }

  function handleToolResult(c: Record<string, unknown>) {
    state.trail.push({ t_ms: now() - t0, phase: "result", is_error: !!c.is_error });
    const id = typeof c.tool_use_id === "string" ? c.tool_use_id : undefined;
    const tool = id ? pending.get(id) : undefined;
    if (id) pending.delete(id);
    if (tool && SELECT_BROWSER_RE.test(tool) && state.browserPin && state.browserPin.ok === undefined) {
      state.browserPin.ok = !c.is_error;
      state.browserPin.error = c.is_error ? contentText(c.content).slice(0, ERROR_TEXT_MAX) : undefined;
    }
  }

  function handleContent(content: unknown) {
    if (!Array.isArray(content)) return;
    for (const c of content as Array<Record<string, unknown>>) {
      if (c?.type === "tool_use") handleToolUse(c);
      else if (c?.type === "tool_result") handleToolResult(c);
      // text / input deltas are intentionally ignored (secret-safe).
    }
  }

  function handleSystem(ev: Record<string, unknown>) {
    if (ev.subtype === "init") {
      const tools = Array.isArray(ev.tools) ? (ev.tools as unknown[]).filter((t): t is string => typeof t === "string") : [];
      const servers = Array.isArray(ev.mcp_servers) ? (ev.mcp_servers as Array<Record<string, unknown>>) : [];
      state.init = {
        claudeCodeVersion: typeof ev.claude_code_version === "string" ? ev.claude_code_version : undefined,
        builtinTools: tools.filter((t) => !t.startsWith("mcp__")),
        mcpServers: servers.map((s) => ({ name: String(s?.name ?? ""), status: String(s?.status ?? "") })),
      };
    } else if (ev.subtype === "permission_denied") {
      const reason = ev.decision_reason;
      state.permissionDenied.push({
        tool: typeof ev.tool_name === "string" ? ev.tool_name : "?",
        reasonType: typeof ev.decision_reason_type === "string" ? ev.decision_reason_type : undefined,
        reason: reason === undefined ? undefined : (typeof reason === "string" ? reason : JSON.stringify(reason)).slice(0, REASON_TEXT_MAX),
      });
    }
  }

  function handleResult(ev: Record<string, unknown>) {
    // NOTE: result is the model's final text, stored RAW. It can contain secrets; redaction is the
    // downstream layer's job (see redactSecrets).
    state.envelope = {
      result: typeof ev.result === "string" ? ev.result : "",
      session_id: typeof ev.session_id === "string" ? ev.session_id : undefined,
      total_cost_usd: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined,
    };
    state.resultMeta = {
      subtype: typeof ev.subtype === "string" ? ev.subtype : undefined,
      isError: ev.is_error === true,
      errors: Array.isArray(ev.errors) ? (ev.errors as unknown[]).filter((e): e is string => typeof e === "string") : undefined,
      terminalReason: typeof ev.terminal_reason === "string" ? ev.terminal_reason : undefined,
    };
    // Names only — a denial carries the rejected tool_input, which can hold fill values (secrets).
    if (Array.isArray(ev.permission_denials)) {
      for (const d of ev.permission_denials as Array<Record<string, unknown>>) {
        if (typeof d?.tool_name === "string") state.deniedTools.push(d.tool_name);
      }
    }
  }

  function push(line: string): void {
    const s = line.trim();
    if (!s) return;
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(s); } catch { return; }
    const t = ev.type;
    if (t === "assistant" || t === "user") handleContent((ev.message as Record<string, unknown> | undefined)?.content);
    else if (t === "system") handleSystem(ev);
    else if (t === "result") handleResult(ev);
  }

  function snapshot(): StreamState {
    return {
      ...state,
      trail: [...state.trail], deniedTools: [...state.deniedTools], reportedSteps: [...state.reportedSteps],
      permissionDenied: [...state.permissionDenied], repeatedClicks: [...state.repeatedClicks],
      browserPin: state.browserPin ? { ...state.browserPin } : undefined,
    };
  }

  return { push, snapshot };
}
```

주의: 기존 테스트 `tests/run/streamParser.test.ts`의 픽스처는 `tool_use`에 `id`가 없어도 동작해야 한다(위 코드는 `id` 없으면 짝 맞추기만 건너뜀). `tests/run/spawnExecutor.test.ts`가 `snapshot()`의 필드를 `toEqual`로 비교한다면 새 필드 때문에 깨질 수 있다 — 그 경우 `toMatchObject`로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/run/streamParser.test.ts tests/run/spawnExecutor.test.ts`
Expected: PASS.

- [ ] **Step 5: 스테이징**

```bash
git add src/run/streamParser.ts tests/run/streamParser.test.ts tests/run/spawnExecutor.test.ts
```

---

### Task 3: 결과 타입 · 경고 생성 · runScenario 조립

**Files:**
- Modify: `src/result/types.ts`
- Create: `src/run/assembleWarnings.ts`
- Modify: `src/run/runScenario.ts`
- Test: `tests/run/assembleWarnings.test.ts`(신규), `tests/run/runScenario.test.ts`

**Interfaces:**
- Consumes: `StreamState` 필드(Task 2), `PromptTargets.browserDeviceId`.
- Produces:
  ```ts
  // src/result/types.ts
  export type StepStatus = Status | "SKIPPED";
  export interface StepResult { index: number; action: string; status: StepStatus; error?: string; note?: string; }
  export interface BrowserPinResult { requested?: string; ok?: boolean; error?: string; }
  // ScenarioResult += reported_via?: "tool" | "text"; claude_code_version?: string; browser_pin?: BrowserPinResult;
  // RunSummary += claude_code_version?: string;
  // src/run/assembleWarnings.ts
  export const KNOWN_BUILTIN_TOOLS: readonly string[];
  export function initWarnings(init: InitInfo | undefined, previousVersion: string | undefined): string[];
  export function pinWarnings(pin: BrowserPin | undefined, tabsBeforePin: boolean, requested: string | undefined): string[];
  export function repeatedClickWarning(clicks: RepeatedClick[]): string | undefined;
  // src/run/runScenario.ts
  export function stepsFromReports(reported: ReportedStep[], scenario: Scenario): StepResult[];
  export function errorResultReason(meta: ResultMeta | undefined): string | undefined;
  export function chromeDenialReason(deniedTools: string[], denied?: PermissionDenied[]): string | undefined;
  // RunScenarioOptions += previousClaudeCodeVersion?: string;
  ```

- [ ] **Step 1: 경고 테스트 작성** — `tests/run/assembleWarnings.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { KNOWN_BUILTIN_TOOLS, initWarnings, pinWarnings, repeatedClickWarning } from "../../src/run/assembleWarnings.js";

describe("initWarnings", () => {
  const init = { claudeCodeVersion: "2.1.284", builtinTools: ["ToolSearch", "BrandNewTool"], mcpServers: [{ name: "tester", status: "connected" }, { name: "claude-in-chrome", status: "connected" }] };
  it("names built-in tools outside the known set", () => {
    const w = initWarnings(init, "2.1.284");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/BrandNewTool/);
    expect(w[0]).not.toMatch(/ToolSearch/);
  });
  it("warns when the tester server is missing or not connected", () => {
    expect(initWarnings({ ...init, builtinTools: [], mcpServers: [] }, "2.1.284")[0]).toMatch(/tester tool server not connected/);
    expect(initWarnings({ ...init, builtinTools: [], mcpServers: [{ name: "tester", status: "failed" }] }, "2.1.284")[0]).toMatch(/not connected/);
  });
  it("warns when Claude Code's version differs from the previous run", () => {
    const w = initWarnings({ ...init, builtinTools: [] }, "2.1.283");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/2\.1\.283 → 2\.1\.284/);
  });
  it("is silent without an init event or without a previous version", () => {
    expect(initWarnings(undefined, "2.1.283")).toEqual([]);
    expect(initWarnings({ ...init, builtinTools: [] }, undefined)).toEqual([]);
  });
  it("the known set holds the 2.1.283 leak list and StructuredOutput", () => {
    for (const t of ["ReportFindings", "ScheduleWakeup", "ToolSearch", "Workflow", "StructuredOutput"]) expect(KNOWN_BUILTIN_TOOLS).toContain(t);
  });
});

describe("pinWarnings", () => {
  it("is silent when no pin is configured, or the pin succeeded", () => {
    expect(pinWarnings(undefined, true, undefined)).toEqual([]);
    expect(pinWarnings({ requested: "d79", ok: true }, false, "d79")).toEqual([]);
  });
  it("reports a failed pin with the tool's error", () => {
    expect(pinWarnings({ requested: "d79", ok: false, error: "no such device" }, false, "d79")[0]).toMatch(/browser pin failed: no such device/);
  });
  it("reports tabs touched before pinning, and a pin to a different device than configured", () => {
    expect(pinWarnings(undefined, true, "d79")[0]).toMatch(/did not pin the browser/);
    expect(pinWarnings({ requested: "other", ok: true }, false, "d79")[0]).toMatch(/pinned "other" but the config says "d79"/);
  });
});

describe("repeatedClickWarning", () => {
  it("is undefined without repeats and names the calls otherwise", () => {
    expect(repeatedClickWarning([])).toBeUndefined();
    const w = repeatedClickWarning([{ call: 3, key: "computer:left_click:[10,10]" }, { call: 9, key: "js:abcd1234" }]);
    expect(w).toMatch(/2 time\(s\)/);
    expect(w).toMatch(/#3, #9/);
    expect(w).toMatch(/duplicated a record/);
  });
});
```

- [ ] **Step 2: runScenario 테스트 작성** — `tests/run/runScenario.test.ts` 끝에 추가 (파일 상단 `base`·`scenario` 재사용)

```ts
const three: Scenario = { id: "s3", title: "t", locale: "ru", steps: [
  { action: "navigate", url: "/" }, { action: "click", target: { css: "#a" } }, { action: "assert_visible", target: { css: "#b" } },
] };
const useTool = (id: string, name: string, input: Record<string, unknown>) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const stepsReport = useTool("r1", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "SKIPPED", note: "absent" }, { index: 4, status: "PASS" }] });
const finalReport = useTool("r2", "mcp__tester__report_final", { status: "PARTIAL", evidence: ["saw b"], handoff_notes: "hn" });
const feedLines = (...lines: string[]): StreamSpawner => (_c, _a, h) => { for (const l of lines) h.onLine(l); h.onClose(0, null); return { kill() {} }; };

describe("runScenario — tool reports", () => {
  it("report_final wins: verdict and steps come from the tools, actions filled from the scenario", async () => {
    const emptyResult = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "" });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, finalReport, emptyResult), logLine: () => {} });
    expect(r.status).toBe("PARTIAL");
    expect(r.reported_via).toBe("tool");
    expect(r.evidence).toEqual(["saw b"]);
    expect(r.handoff_notes).toBe("hn");
    expect(r.steps).toEqual([
      { index: 1, action: "navigate", status: "PASS" },
      { index: 2, action: "click", status: "SKIPPED", note: "absent" },
      { index: 4, action: "?", status: "PASS" },           // out-of-range index is kept, not dropped
    ]);
  });
  it("a killed executor keeps the steps it reported and explains the kill", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(stepsReport); h.onClose(null, "SIGTERM"); return { kill() {} }; };
    const r = await runScenario(three, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.steps.map((s) => s.index)).toEqual([1, 2, 4]);
    expect(r.reported_via).toBe("tool");
    expect(r.not_tested_reason).toMatch(/never emitted/);
  });
  it("an error-type result with no text names the subtype and errors", async () => {
    const budget = JSON.stringify({ type: "result", subtype: "error_max_budget_usd", is_error: true, errors: ["Reached maximum budget ($5)"] });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, budget), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/error_max_budget_usd: Reached maximum budget/);
    expect(r.steps).toHaveLength(3);
  });
  it("a normal exit with empty text and no report_final is NOT_TESTED with a clear reason", async () => {
    const emptyResult = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "" });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, emptyResult), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/ended without report_final/);
    expect(r.steps).toHaveLength(3);
  });
  it("text fallback: no tools → parsed text, reported_via text", async () => {
    const r = await runScenario(scenario, { ...base, spawner: feedLines(tool, okResult), logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.reported_via).toBe("text");
  });
  it("text fallback prefers tool-reported steps over the text's steps", async () => {
    const textWithSteps = JSON.stringify({ type: "result", result: '{"status":"PASS","steps":[{"index":9,"action":"x","status":"PASS"}]}' });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, textWithSteps), logLine: () => {} });
    expect(r.steps.map((s) => s.index)).toEqual([1, 2, 4]);
  });
  it("permission_denied reason replaces the generic haiku text", async () => {
    const denied = JSON.stringify({ type: "system", subtype: "permission_denied", tool_name: "mcp__claude-in-chrome__tabs_create_mcp", decision_reason_type: "asyncAgent", decision_reason: "requires approval, and this session has no approval surface" });
    const resultDenied = JSON.stringify({ type: "result", result: "prose", permission_denials: [{ tool_name: "mcp__claude-in-chrome__tabs_create_mcp", tool_input: {} }] });
    const r = await runScenario(three, { ...base, spawner: feedLines(denied, resultDenied), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/tabs_create_mcp/);
    expect(r.not_tested_reason).toMatch(/no approval surface/);
    expect(r.not_tested_reason).not.toMatch(/2026-08-05/);
  });
  it("records claude_code_version, browser_pin and warnings from the stream", async () => {
    const init = JSON.stringify({ type: "system", subtype: "init", claude_code_version: "2.1.284", tools: ["ToolSearch", "BrandNewTool"], mcp_servers: [{ name: "tester", status: "connected" }] });
    const pin = useTool("p", "mcp__claude-in-chrome__select_browser", { deviceId: "d79" });
    const pinErr = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "p", is_error: true, content: "no such device" }] } });
    const click = (id: string) => useTool(id, "mcp__claude-in-chrome__computer", { action: "left_click", coordinate: [1, 1] });
    const r = await runScenario(three, { ...base, targets: { frontend: "http://x", browserDeviceId: "d79" }, previousClaudeCodeVersion: "2.1.283",
      spawner: feedLines(init, pin, pinErr, click("c1"), click("c2"), finalReport), logLine: () => {} });
    expect(r.claude_code_version).toBe("2.1.284");
    expect(r.browser_pin).toEqual({ requested: "d79", ok: false, error: "no such device" });
    expect(r.warnings?.join("\n")).toMatch(/BrandNewTool/);
    expect(r.warnings?.join("\n")).toMatch(/2\.1\.283 → 2\.1\.284/);
    expect(r.warnings?.join("\n")).toMatch(/browser pin failed/);
    expect(r.warnings?.join("\n")).toMatch(/clicked the same target again/);
  });
});
```

`chromeDenialReason` 기존 테스트 "names the denied chrome tools…"의 `expect(r).toMatch(/haiku/)`는 사유 없는 호출에서만 유효하므로 그대로 둔다(두 번째 인자 없음).

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/run/assembleWarnings.test.ts tests/run/runScenario.test.ts`
Expected: FAIL — 모듈 없음 / 필드 undefined.

- [ ] **Step 4: 타입 변경** — `src/result/types.ts`

```ts
export type Status = "PASS" | "PARTIAL" | "FAIL" | "NOT_TESTED";
export const STATUSES: Status[] = ["PASS", "PARTIAL", "FAIL", "NOT_TESTED"];
export type StepStatus = Status | "SKIPPED";                                   // added in Task 2
// What report_steps accepts. PARTIAL is a run verdict, not a step outcome; the text path may still carry it.
export const REPORTED_STEP_STATUSES: StepStatus[] = ["PASS", "FAIL", "SKIPPED", "NOT_TESTED"];  // added in Task 2

export interface StepResult { index: number; action: string; status: StepStatus; error?: string; note?: string; }
export interface BrowserPinResult { requested?: string; ok?: boolean; error?: string; }
export interface Environment { frontend_commit?: string; backend_commit?: string; browser?: string; runner_model?: string; node_version: string; os: string; }
export interface ScenarioResult {
  run_id: string; scenario_id: string; status: Status;
  not_tested_reason?: string; pattern_inference?: "assumed_ok" | "unknown";
  evidence?: string[]; screenshots?: string[]; started_at: string; duration_ms: number;
  steps: StepResult[]; environment: Environment;
  handoff_notes?: string; raw_executor_text?: string; parse_repaired?: boolean;
  last_tool?: string; tool_count?: number; executor_log?: string;
  denied_tools?: string[];
  warnings?: string[];
  reported_via?: "tool" | "text";     // how the verdict/steps reached the runner
  claude_code_version?: string;       // from the executor's init event
  browser_pin?: BrowserPinResult;
}
export interface RunSummary {
  run_id: string; started_at: string; total: number;
  by_status: Record<Status, number>; scenarios: { scenario_id: string; status: Status }[];
  claude_code_version?: string;
}
```

- [ ] **Step 5: 경고 모듈 작성** — `src/run/assembleWarnings.ts`

```ts
import type { InitInfo, BrowserPin, RepeatedClick } from "./streamParser.js";
import { TESTER_SERVER } from "./executorTools.js";

// Built-in tools a 2.1.283 executor is offered under the current deny list (measured 2026-09-28),
// plus StructuredOutput (--json-schema). Anything else is a new leak worth a look.
export const KNOWN_BUILTIN_TOOLS: readonly string[] = [
  "CronCreate", "CronDelete", "CronList", "DesignSync", "EnterWorktree", "ExitWorktree", "ListAgents", "Monitor",
  "PushNotification", "RemoteTrigger", "ReportFindings", "ScheduleWakeup", "SendMessage", "TaskStop", "ToolSearch", "Workflow",
  "StructuredOutput",
];

export function initWarnings(init: InitInfo | undefined, previousVersion: string | undefined): string[] {
  if (!init) return [];
  const out: string[] = [];
  const unknown = init.builtinTools.filter((t) => !KNOWN_BUILTIN_TOOLS.includes(t));
  if (unknown.length)
    out.push(`executor was offered built-in tools outside the known set: ${unknown.join(", ")} — deny them or adopt --tools`);
  const tester = init.mcpServers.find((s) => s.name === TESTER_SERVER);
  if (!tester || tester.status !== "connected")
    out.push("tester tool server not connected — the permission gate handler and step reports are off for this run");
  if (previousVersion && init.claudeCodeVersion && init.claudeCodeVersion !== previousVersion)
    out.push(`Claude Code changed ${previousVersion} → ${init.claudeCodeVersion} since the last run; flag semantics may have moved`);
  return out;
}

export function pinWarnings(pin: BrowserPin | undefined, tabsBeforePin: boolean, requested: string | undefined): string[] {
  if (!requested) return [];
  if (!pin) return tabsBeforePin ? ["executor did not pin the browser before touching tabs — it may have driven another machine's Chrome"] : [];
  const out: string[] = [];
  if (pin.ok === false) out.push(`browser pin failed: ${pin.error ?? "select_browser errored"}`);
  if (pin.requested && pin.requested !== requested) out.push(`executor pinned "${pin.requested}" but the config says "${requested}"`);
  if (tabsBeforePin) out.push("executor touched tabs before pinning the browser");
  return out;
}

export function repeatedClickWarning(clicks: RepeatedClick[]): string | undefined {
  if (!clicks.length) return undefined;
  const calls = clicks.map((c) => `#${c.call}`).join(", ");
  return `clicked the same target again ${clicks.length} time(s) (calls ${calls}) — a repeated click on a save/submit button may have duplicated a record`;
}
```

- [ ] **Step 6: runScenario 조립 변경** — `src/run/runScenario.ts`

```ts
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import type { Scenario } from "../scenario/types.js";
import type { Environment, ScenarioResult, StepResult } from "../result/types.js";
import { collectScreenshots, type ScreenshotFs } from "../result/collectScreenshots.js";
import { buildUserPrompt, SYSTEM_CONTRACT, type PromptTargets } from "./buildPrompt.js";
import { spawnExecutor, type StreamSpawner } from "./spawnExecutor.js";
import { parseExecutorResult } from "../result/parseExecutorResult.js";
import type { ReportedStep, ResultMeta, PermissionDenied } from "./streamParser.js";
import { initWarnings, pinWarnings, repeatedClickWarning } from "./assembleWarnings.js";

export interface RunScenarioOptions {
  runId: string;
  targets: PromptTargets;
  model: string;
  effort?: string;
  env: Environment;
  resolveValue: (v: string) => string;
  now?: () => Date;
  timeoutMs?: number;
  spawner?: StreamSpawner;            // injected for tests
  logLine?: (line: string) => void;  // per-line log sink
  executorLog?: string;              // log file path (result metadata)
  resultDir?: string;                // run output dir; screenshots are copied under it
  screenshotFs?: ScreenshotFs;       // injected for tests
  previousClaudeCodeVersion?: string; // from the last run's summary, for the version-change warning
}

// (defaultScreenshotFs, notTestedReason, WARMUP_WARNING, hasUpload 는 그대로)

const CHROME_TOOL_PREFIX = "mcp__claude-in-chrome__";

// The stream's permission_denied events carry the CLI's own reason (e.g. "requires approval, and this
// session has no approval surface") — that beats the 2026-08-05 guess below, which stays only for
// logs that predate the event.
export function chromeDenialReason(deniedTools: string[], denied: PermissionDenied[] = []): string | undefined {
  const names = [...new Set(
    deniedTools.filter((t) => t.startsWith(CHROME_TOOL_PREFIX)).map((t) => t.slice(CHROME_TOOL_PREFIX.length))
  )];
  if (!names.length) return undefined;
  const reason = denied.find((d) => d.tool.startsWith(CHROME_TOOL_PREFIX) && d.reason)?.reason;
  if (reason) return `claude-in-chrome denied the executor (${names.join(", ")}) — ${reason}`;
  return `claude-in-chrome denied the executor (${names.join(", ")}) — re-running as-is will fail the same way. First check runner.model: as of 2026-08-05 a haiku executor was denied every browser tool while sonnet and opus passed with identical flags (reproduced, though no public doc states a model requirement — it may be a bug). If the model is already sonnet/opus, check that the extension is connected and that only your own Chrome is (list_connected_browsers reports every browser on this account).`;
}

export function errorResultReason(meta: ResultMeta | undefined): string | undefined {
  if (!meta?.isError) return undefined;
  const detail = meta.errors?.length ? `: ${meta.errors.join("; ")}` : "";
  return `${meta.subtype ?? "error"}${detail}`;
}

// index is the 1-based step number shown in the prompt. An index outside the scenario is kept with
// action "?" rather than dropped — the report is still evidence of what the executor believed it did.
export function stepsFromReports(reported: ReportedStep[], scenario: Scenario): StepResult[] {
  return reported.map((r) => {
    const step: StepResult = { index: r.index, action: scenario.steps[r.index - 1]?.action ?? "?", status: r.status };
    if (r.note !== undefined) step.note = r.note;
    return step;
  });
}

export async function runScenario(scenario: Scenario, opts: RunScenarioOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now();

  const { envelope, state, killedReason } = await spawnExecutor(
    { prompt: buildUserPrompt(scenario, opts.targets, opts.resolveValue), systemPrompt: SYSTEM_CONTRACT, model: opts.model, effort: opts.effort, allowRead: hasUpload(scenario) },
    { spawner: opts.spawner, logLine: opts.logLine, timeoutMs: opts.timeoutMs }
  );

  const denialReason = chromeDenialReason(state.deniedTools, state.permissionDenied);
  const pinWarn = pinWarnings(state.browserPin, state.tabsBeforePin, opts.targets.browserDeviceId);
  const clickWarn = repeatedClickWarning(state.repeatedClicks);
  const warnings = [
    ...(state.inputBeforeScreenshot ? [WARMUP_WARNING] : []),
    ...initWarnings(state.init, opts.previousClaudeCodeVersion),
    ...pinWarn,
    ...(clickWarn ? [clickWarn] : []),
  ];
  const reportedSteps = stepsFromReports(state.reportedSteps, scenario);
  const common = {
    run_id: opts.runId, scenario_id: scenario.id,
    started_at: startedAt.toISOString(), duration_ms: now().getTime() - startedAt.getTime(),
    environment: opts.env,
    last_tool: state.lastTool, tool_count: state.toolCount, executor_log: opts.executorLog,
    denied_tools: state.deniedTools.length ? state.deniedTools : undefined,
    warnings: warnings.length ? warnings : undefined,
    claude_code_version: state.init?.claudeCodeVersion,
    browser_pin: state.browserPin,
  };
  const collect = (shots: string[]) => {
    const out = opts.resultDir
      ? collectScreenshots(shots, join(opts.resultDir, scenario.id), opts.screenshotFs ?? defaultScreenshotFs)
      : shots;
    return out.length ? out : undefined;
  };
  const pinFailure = state.browserPin?.ok === false ? pinWarn[0] : undefined;

  // 1. The executor reported through the tester tools: that is the verdict.
  if (state.finalReport) {
    const f = state.finalReport;
    const notTested = f.status === "NOT_TESTED";
    return {
      ...common, status: f.status, screenshots: collect(f.screenshots ?? []),
      not_tested_reason: notTested ? denialReason ?? pinFailure ?? f.not_tested_reason : f.not_tested_reason,
      evidence: f.evidence, steps: reportedSteps, handoff_notes: f.handoff_notes, reported_via: "tool",
    };
  }

  // 2. No verdict: killed, an error-type result, or a normal exit that never called report_final.
  const text = envelope?.result.trim() ?? "";
  if (!envelope || killedReason || state.resultMeta?.isError || !text) {
    const reason = denialReason ?? pinFailure ?? errorResultReason(state.resultMeta)
      ?? (envelope && !killedReason ? `the executor ended without report_final${state.lastTool ? ` — last tool '${state.lastTool}' (${state.toolCount} calls)` : ""}` : notTestedReason(killedReason, state.lastTool, state.toolCount));
    return { ...common, status: "NOT_TESTED", not_tested_reason: reason, steps: reportedSteps, reported_via: reportedSteps.length ? "tool" : undefined };
  }

  // 3. Text fallback — the pre-tool contract, and executors that ignore the reporting rule.
  const parsed = parseExecutorResult(envelope.result);
  const notTested = parsed.status === "NOT_TESTED";
  return {
    ...common, status: parsed.status, screenshots: collect(parsed.screenshots ?? []),
    not_tested_reason: notTested ? denialReason ?? pinFailure ?? parsed.not_tested_reason : parsed.not_tested_reason,
    pattern_inference: parsed.pattern_inference, evidence: parsed.evidence,
    steps: reportedSteps.length ? reportedSteps : ((parsed.steps as StepResult[] | undefined) ?? []),
    handoff_notes: parsed.handoff_notes,
    raw_executor_text: parsed.raw_executor_text, parse_repaired: parsed.parse_repaired, reported_via: "text",
  };
}
```

주의: 기존 테스트 "no envelope: NOT_TESTED, and the reason names the last tool"는 `state.reportedSteps`가 비어 있으므로 `steps: []`·`reported_via: undefined`로 그대로 통과한다. 기존 `chromeDenialReason` 테스트는 인자 1개라 옛 문구를 낸다.

- [ ] **Step 7: 통과 확인**

Run: `npx vitest run tests/run/assembleWarnings.test.ts tests/run/runScenario.test.ts tests/run/runScenarios.test.ts tests/result`
Expected: PASS.

- [ ] **Step 8: 스테이징**

```bash
git add src/result/types.ts src/run/assembleWarnings.ts src/run/runScenario.ts tests/run/assembleWarnings.test.ts tests/run/runScenario.test.ts
```

---

### Task 4: DSL `optional` 스텝 + 계약·프롬프트 개정

**Files:**
- Modify: `src/scenario/types.ts`, `src/scenario/parseScenario.ts`, `src/scenario/actions.ts`, `src/run/buildPrompt.ts`
- Test: `tests/scenario/parseScenario.test.ts`, `tests/scenario/actions.test.ts`, `tests/run/buildPrompt.test.ts`

**Interfaces:**
- Produces: `Step` 각 변형에 `optional?: boolean`; `renderStep`이 ` (optional)` / `(destructive — never repeat)` 접미; `SYSTEM_CONTRACT`에 `[Reporting]`·`[One click per click step]`·`[Optional steps]`; `buildUserPrompt`의 `# Reporting` 블록.

- [ ] **Step 1: 실패 테스트 작성**

`tests/scenario/parseScenario.test.ts` 끝에:

```ts
describe("step-level optional", () => {
  const doc = (optional: unknown) => ({ id: "o", title: "t", steps: [{ action: "wait_for", target: { css: "#h" }, optional }] });
  it("keeps optional: true on the step", () => {
    expect((parseScenarioObject(doc(true)).steps[0] as any).optional).toBe(true);
  });
  it("rejects a non-boolean optional", () => {
    expect(() => parseScenarioObject(doc("yes"))).toThrow(/step\[0\]: 'optional' must be true or false/);
  });
});
```

`tests/scenario/actions.test.ts` 끝에:

```ts
describe("renderStep suffixes", () => {
  it("marks optional steps and destructive clicks", () => {
    expect(renderStep({ action: "wait_for", target: { css: "#h" }, optional: true } as any)).toMatch(/ \(optional\)$/);
    expect(renderStep({ action: "click", target: { css: "#save" }, destructive: true })).toMatch(/\(destructive — never repeat\)$/);
    expect(renderStep({ action: "click", target: { css: "#save" } })).not.toMatch(/destructive|optional/);
  });
});
```

`tests/run/buildPrompt.test.ts` 끝에:

```ts
describe("reporting contract", () => {
  it("tells the executor to report through the tester tools instead of a JSON message", () => {
    expect(SYSTEM_CONTRACT).toContain("[Reporting]");
    expect(SYSTEM_CONTRACT).toContain("mcp__tester__report_steps");
    expect(SYSTEM_CONTRACT).toContain("mcp__tester__report_final");
    expect(SYSTEM_CONTRACT).not.toContain("[Output]");
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toContain("# Reporting");
    expect(p).not.toContain("# Output format");
    expect(p).toMatch(/single integer/);
  });
  it("forbids re-clicking and explains optional steps", () => {
    expect(SYSTEM_CONTRACT).toContain("[One click per click step]");
    expect(SYSTEM_CONTRACT).toMatch(/never repeat/);
    expect(SYSTEM_CONTRACT).toContain("[Optional steps]");
    expect(SYSTEM_CONTRACT).toContain("SKIPPED");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/scenario/parseScenario.test.ts tests/scenario/actions.test.ts tests/run/buildPrompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

`src/scenario/types.ts` — `Step`을 교차 타입으로:

```ts
type StepBody =
  | { action: "navigate"; url: string }
  | { action: "fill"; target: Target; value: string }
  | { action: "click"; target: Target; destructive?: boolean }
  | { action: "double_click"; target: Target }
  | { action: "upload"; target: Target; file: string }
  | { action: "wait_for"; target: Target; timeout_ms?: number }
  | { action: "assert_visible"; target: Target }
  | { action: "assert_not_visible"; target: Target }
  | { action: "assert_value"; target: Target; value: string }
  | { action: "screenshot"; name?: string };
// optional: a failed step is reported SKIPPED and the run continues (even under on_failure: stop).
export type Step = StepBody & { optional?: boolean };
```

`src/scenario/parseScenario.ts`의 steps map 안, `isKnownAction` 검사 뒤:

```ts
    if (st.optional !== undefined && typeof st.optional !== "boolean")
      throw new Error(`step[${i}]: 'optional' must be true or false`);
```

`src/scenario/actions.ts`:

```ts
  click: (s) => `Click: [${describeTarget(s.target)}]${s.destructive ? " (destructive — never repeat)" : ""}`,
  ...
export function renderStep(step: Step): string {
  const base = RENDERERS[step.action](step);
  return step.optional ? `${base} (optional)` : base;
}
```

`src/run/buildPrompt.ts` — `SYSTEM_CONTRACT`에서 `[Output] …` 한 줄을 삭제하고 아래 세 절을 넣는다(`[Safety — forbidden]` 뒤). `[Status labels]` 절의 첫 줄을 `status is exactly one of four (a single step's status may also be SKIPPED — see Optional steps):`로 고친다.

```
[One click per click step]
- A click step is ONE click. If nothing visibly changes, do NOT click again to "make it work": take one screenshot, then report that step FAIL with what you observed. Re-clicking a save/submit/send button can create duplicate records.
- A step marked (destructive — never repeat) must never be clicked twice for any reason. If its first click's outcome is unclear, report it PARTIAL with what you observed and stop.

[Optional steps]
- A step marked (optional) may fail: if its target is absent or the action fails, report that step SKIPPED and continue with the next step. Never end the run because an optional step failed. An optional wait only waits its stated timeout.

[Reporting]
- After finishing each step call mcp__tester__report_steps with that step's index (the step number shown in the scenario) and status; steps finished in the same turn go in one call.
- At the end — including when you stop early with NOT_TESTED — call mcp__tester__report_final once with status, evidence, and (on NOT_TESTED) not_tested_reason and handoff_notes; put screenshot paths there. After that, your last message may be empty or one line. Do not emit a JSON result as text.
```

`buildUserPrompt`의 `# Output format …` 블록 전체를 아래로 교체:

```
# Reporting
Report through the tester tools, not as text: mcp__tester__report_steps after each step ({ steps: [{ index, status, note? }] },
status PASS | FAIL | SKIPPED | NOT_TESTED), then mcp__tester__report_final once ({ status, evidence[], not_tested_reason?, handoff_notes?, screenshots[] }).
"index" is a single integer — the step number above. NEVER write a range like 35-36; report one entry per step.
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/scenario tests/run/buildPrompt.test.ts`
Expected: PASS (ebill 시나리오 테스트 1건은 기존 실패로 남는다).

- [ ] **Step 5: 스테이징**

```bash
git add src/scenario/types.ts src/scenario/parseScenario.ts src/scenario/actions.ts src/run/buildPrompt.ts tests/scenario/parseScenario.test.ts tests/scenario/actions.test.ts tests/run/buildPrompt.test.ts
```

---

### Task 5: Claude Code 버전 기록과 직전 run 비교

**Files:**
- Create: `src/result/previousRun.ts`
- Modify: `src/result/writeResult.ts`, `src/cli.ts`
- Test: `tests/result/previousRun.test.ts`(신규), `tests/result/writeResult.test.ts`

**Interfaces:**
- Produces: `readPreviousClaudeCodeVersion(outDir: string, currentRunId: string, fs?: PreviousRunFs): string | undefined` with `interface PreviousRunFs { listDirs(dir: string): string[]; readSummary(path: string): string | undefined; }`.
- `writeSummary` writes `claude_code_version` = the first result that has one.

- [ ] **Step 1: 실패 테스트 작성**

`tests/result/previousRun.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readPreviousClaudeCodeVersion } from "../../src/result/previousRun.js";

const fs = (dirs: string[], summaries: Record<string, string | undefined>) => ({
  listDirs: () => dirs,
  readSummary: (p: string) => summaries[p.replace(/\\/g, "/")],
});

describe("readPreviousClaudeCodeVersion", () => {
  it("reads the newest run that is not the current one", () => {
    const f = fs(["2026-09-28T07-58-05", "2026-09-28T08-03-48", "2026-09-28T08-10-00"], {
      "runs/2026-09-28T08-03-48/summary.json": JSON.stringify({ claude_code_version: "2.1.283" }),
    });
    expect(readPreviousClaudeCodeVersion("runs", "2026-09-28T08-10-00", f)).toBe("2.1.283");
  });
  it("skips runs without a version and tolerates unreadable or invalid summaries", () => {
    const f = fs(["a", "b", "c"], { "runs/c/summary.json": "{not json", "runs/b/summary.json": JSON.stringify({}), "runs/a/summary.json": JSON.stringify({ claude_code_version: "2.1.280" }) });
    expect(readPreviousClaudeCodeVersion("runs", "zzz", f)).toBe("2.1.280");
  });
  it("returns undefined when the output dir is missing or empty", () => {
    expect(readPreviousClaudeCodeVersion("runs", "x", { listDirs: () => { throw new Error("ENOENT"); }, readSummary: () => undefined })).toBeUndefined();
    expect(readPreviousClaudeCodeVersion("runs", "x", fs([], {}))).toBeUndefined();
  });
});
```

`tests/result/writeResult.test.ts`에 추가(파일의 기존 픽스처·임시 디렉터리 헬퍼를 따른다; 없으면 `mkdtempSync(join(tmpdir(), "tm-"))` 사용):

```ts
  it("summary carries the executor's Claude Code version when a result has one", () => {
    const dir = mkdtempSync(join(tmpdir(), "tm-"));
    const r = (id: string, v?: string) => ({ run_id: "R", scenario_id: id, status: "PASS" as const, started_at: "s", duration_ms: 1, steps: [], environment: { node_version: "v", os: "o" }, claude_code_version: v });
    const p = writeSummary(dir, "R", "s", [r("a"), r("b", "2.1.283")]);
    expect(JSON.parse(readFileSync(p, "utf8")).claude_code_version).toBe("2.1.283");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/result`
Expected: FAIL.

- [ ] **Step 3: 구현**

`src/result/previousRun.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PreviousRunFs { listDirs(dir: string): string[]; readSummary(path: string): string | undefined; }

const realFs: PreviousRunFs = {
  listDirs: (dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name),
  readSummary: (p) => { try { return readFileSync(p, "utf8"); } catch { return undefined; } },
};

// Run ids are ISO timestamps, so a lexical sort is chronological.
export function readPreviousClaudeCodeVersion(outDir: string, currentRunId: string, fs: PreviousRunFs = realFs): string | undefined {
  let dirs: string[];
  try { dirs = fs.listDirs(outDir); } catch { return undefined; }
  for (const d of dirs.filter((x) => x !== currentRunId).sort().reverse()) {
    const raw = fs.readSummary(join(outDir, d, "summary.json"));
    if (!raw) continue;
    try {
      const v = (JSON.parse(raw) as { claude_code_version?: unknown }).claude_code_version;
      if (typeof v === "string") return v;
    } catch { /* not a summary */ }
  }
  return undefined;
}
```

`src/result/writeResult.ts` `writeSummary` 안 `summary` 객체에:

```ts
    claude_code_version: results.find((r) => r.claude_code_version)?.claude_code_version,
```

`src/cli.ts` `run` 액션: `import { readPreviousClaudeCodeVersion } from "./result/previousRun.js";` 추가하고 `runScenarios(...)` 호출의 옵션에 `previousClaudeCodeVersion: readPreviousClaudeCodeVersion(opts.outDir ?? "runs", runId),`를 넣는다(`runId` 계산 뒤).

- [ ] **Step 4: 통과 확인 + 빌드**

Run: `npx vitest run tests/result && npm run build`
Expected: PASS, tsc 오류 없음.

- [ ] **Step 5: 스테이징**

```bash
git add src/result/previousRun.ts src/result/writeResult.ts src/cli.ts tests/result/previousRun.test.ts tests/result/writeResult.test.ts
```

---

### Task 6: 가이드·프래그먼트 갱신과 실 시나리오 검증

**Files:**
- Modify: `skills/tester-mcp/document-guide.md`, `scenarios/uzb/_fragments/login.yaml`
- Verify: `tester-mcp run scenarios/uzb/security/mng-screens-load.yaml -c tester-mcp.config.uzb.yaml --secrets C:/workspace/uzb/e2e/tester-mcp.secrets.yaml --concurrency 1`

- [ ] **Step 1: 가이드 수정** (`skills/tester-mcp/document-guide.md`)

1. Prerequisites의 "**Don't run a haiku executor**" 항목(14~24행)을 다음으로 교체:

```
- **Executor model:** default `sonnet`. Claude in Chrome asks for approval on every browser action
  under a haiku executor (sonnet/opus are never asked). Since 2026-09-28 the runner attaches a
  bundled permission handler (`bin/executor-tools.cjs`, tool `mcp__tester__approve`), so haiku runs
  end-to-end — but on the one scenario measured it was neither cheaper nor faster than sonnet at
  effort `low`, so leave the default unless a new measurement says otherwise.
```

2. "What the executor does NOT inherit"(80~84행)의 마지막 두 줄을:

```
- `Skill,Task,Agent,Bash,Write,Edit,Read,Glob,Grep,WebFetch,WebSearch` are hard-denied
  (`Read` opens only for upload scenarios).
- No ambient MCP servers are loaded; only claude-in-chrome (via `--chrome`) and the runner's own
  `tester` server, which answers permission prompts and receives the executor's step reports.
```

3. Scenario file 필드 표(119~120행) 뒤에 스텝 단위 항목을 추가하고, `## Actions` 절 끝에:

```
Any step may carry `optional: true`: if its target is absent or the action fails, the executor reports
that step `SKIPPED` and continues — even under `on_failure: stop`. Use it for "log out if a session
is still alive" style branches; give an optional `wait_for` a short `timeout_ms` so a missing target
does not cost the default wait.
```

4. `## Result labels` 절: 네 라벨 뒤에

```
Per-step `status` adds `SKIPPED` (an `optional` step that did not apply). `reported_via` says whether
the verdict arrived through the tester tools (`tool`) or was parsed from text (`text`, legacy path).
```

그리고 `denied_tools` 문단의 "Check `runner.model` first (haiku is denied every browser tool), then the extension connection" → "The `not_tested_reason` carries the CLI's own denial reason; check the extension connection and the `tester` server (see `warnings`)". `warnings` 문단의 "Today there is one:"을 "Today they are: the warm-up input drop below; built-in tools outside the known set; the tester server not connected; a Claude Code version change since the last run; browser pin failures; repeated clicks on the same target." 로 고친다.

- [ ] **Step 2: 프래그먼트 수정** (`scenarios/uzb/_fragments/login.yaml`)

주석 블록의 "→ 이 조각은 '이미 로그인된 Chrome' 을 전제로 한다. 로그아웃 상태에서 시작하면 첫 단계에서 멈춘다." 를 "→ 헤더가 없으면(이미 로그아웃) 두 단계는 optional 로 SKIPPED 되고 바로 로그인 폼으로 간다." 로 바꾸고, 두 스텝을:

```yaml
  - { action: wait_for, target: { css: "#v_header", description: "헤더 — 이전 세션이 살아 있다는 뜻" }, optional: true, timeout_ms: 3000 }
  - { action: click, target: { css: ".util_ctrl .ico_logout", description: "헤더 우측 로그아웃 아이콘 버튼" }, optional: true }
```

- [ ] **Step 3: 전체 테스트 + 빌드**

Run: `npm run build && npm test`
Expected: 기존 실패 1건(`loadScenario.ebill.test.ts`)만 남고 나머지 PASS.

- [ ] **Step 4: 실 시나리오 검증** (백엔드 8081·프론트 15181 기동 확인 후)

Run: `node bin/tester-mcp.js run scenarios/uzb/security/mng-screens-load.yaml -c tester-mcp.config.uzb.yaml --secrets C:/workspace/uzb/e2e/tester-mcp.secrets.yaml --concurrency 1`
Expected: `[PASS]`. 결과 JSON에서 `reported_via: "tool"`, `steps.length === 30`, `claude_code_version` 존재, `browser_pin.ok === true`, `warnings` 없음(있으면 문구를 그대로 보고). 로그에서 `mcp__tester__report_final` 1회, `mcp__tester__report_steps` ≥ 1회, 텍스트 JSON 없음. 턴·비용을 2026-09-28 sonnet 기준(31턴 $0.47)과 비교해 기록.

- [ ] **Step 5: 스테이징 + 문서**

```bash
git add skills/tester-mcp/document-guide.md scenarios/uzb/_fragments/login.yaml
```

Obsidian `Projects/testMcp/specs/2026-09-28-executor-reporting-and-guards-design.md`의 진행 절에 실측 수치(판정·스텝 수·턴·비용·경고)를 적고 `status: completed`, `progress: 100%`로 바꾼다. 커밋은 사용자 지시 후 한 번에.
