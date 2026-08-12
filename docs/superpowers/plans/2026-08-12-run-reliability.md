# 실행 신뢰성 (preflight · 부정 단언 · 스크린샷 증거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시나리오와 무관한 이유로 executor 실행을 날리는 3가지 원인(환경 미점검, 부정 단언 부재, 증거 미보존)을 제거한다.

**Architecture:** 순수 함수 + 주입(injection) 패턴을 따른다. `checkPreflight`는 `fetch`를, `collectScreenshots`는 파일시스템을 주입받아 단위 테스트가 네트워크·디스크 없이 돈다. CLI가 executor 스폰 전에 preflight를 호출하고, 러너가 executor가 남긴 스크린샷을 `runs/`로 회수한다.

**Tech Stack:** TypeScript (ESM, `type: module`), vitest, commander, yaml. **의존성 추가 없음** — `engines: node>=20`이라 전역 `fetch`로 충분하다.

**선행 완료:** 설계 §4(결과 salvage)는 커밋 `642ff2f`에서 이미 구현됐다. 이 플랜은 §3·§5·§6·§7을 다룬다.

**설계 문서:** `docs/superpowers/specs/2026-08-12-run-reliability-design.md`

## Global Constraints

- **소스 표면 텍스트는 전부 영어** — 주석, 테스트 `it()` 설명, 계약 문구, CLI 에러 문자열, 결과 JSON의 reason. (한글은 이 플랜·설계 문서·대화에만)
- **주석은 기본 없음.** 코드에서 역추론 불가능한 것만 영어로: 반직관적 결정의 이유, 외부 제약, 함정. 코드 재진술·변경이력 주석 금지.
- **의존성 추가 금지.** `dependencies`는 `commander`, `yaml` 두 개로 고정.
- **Node >= 20** (`package.json` `engines`). 전역 `fetch`, `AbortSignal.timeout` 사용 가능.
- **TDD 필수** — 테스트를 먼저 쓰고, 실패를 눈으로 확인한 뒤 구현한다.
- **테스트 명령**: `npx vitest run` (전체) / `npx vitest run <경로>` (단일). 타입체크: `npx tsc --noEmit`.
- **커밋 트레일러** — 직전 커밋 `642ff2f`와 동일하게 두 줄을 넣는다:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LcFN46Wr3MVvz2GHRKbQcf
  ```
- **커밋 메시지 본문은 한글**, 제목은 `type(scope): 요약` (기존 로그와 동일).
- **PowerShell 주의**: 여러 줄 커밋 메시지는 here-string이 깨진다. 메시지를 임시 파일에 쓰고 `git commit -F <파일>` 을 쓸 것.

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `src/scenario/types.ts` | `assert_not_visible` Step 추가, `screenshot.save` 제거 | 수정 |
| `src/scenario/actions.ts` | `assert_not_visible` 렌더러 | 수정 |
| `src/config/loadConfig.ts` | `preflight:` 파싱 + `${targets.*}` 치환 | 수정 |
| `src/preflight/checkPreflight.ts` | 점검 로직 (fetch 주입) — 네트워크 몰라도 테스트됨 | **신규** |
| `src/result/collectScreenshots.ts` | executor 임시경로 → `runs/` 복사 (fs 주입) | **신규** |
| `src/result/types.ts` | `screenshots` 추가, 죽은 `StepResult.screenshot` 제거 | 수정 |
| `src/result/parseExecutorResult.ts` | `screenshots` 파싱 + salvage | 수정 |
| `src/run/buildPrompt.ts` | 계약 3건(`assert_not_visible` / 스크린샷 / P3) + 출력 형식 | 수정 |
| `src/run/runScenario.ts` | 스크린샷 회수 배선 | 수정 |
| `src/run/runScenarios.ts` | run 디렉터리를 러너에 전달 | 수정 |
| `src/cli.ts` | 스폰 전 preflight 호출, `--no-preflight` | 수정 |
| `skills/tester-mcp/document-guide.md` | 액션 목록 + `description` 정정 | 수정 |
| `scenarios/ebill/seed/README.md` | 액션 개수 9 → 10 | 수정 |
| `CHANGELOG.md` | 0.8.0 항목 | 수정 |

---

## Task 1: `assert_not_visible` 액션

**Files:**
- Modify: `src/scenario/types.ts` (Step union, 14-23행)
- Modify: `src/scenario/actions.ts` (RENDERERS, 16-26행)
- Modify: `src/run/buildPrompt.ts` (SYSTEM_CONTRACT `[Assertions]`, 27-29행)
- Test: `tests/scenario/actions.test.ts`, `tests/scenario/parseScenario.test.ts`, `tests/run/buildPrompt.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `Step` 유니온에 `{ action: "assert_not_visible"; target: Target }`. `KNOWN_ACTIONS`가 `RENDERERS`에서 파생되므로 `parseScenario`는 자동으로 수용한다 — 별도 수정 불필요.

- [ ] **Step 1: 실패하는 테스트 3개를 쓴다**

`tests/scenario/actions.test.ts` 에 추가:

```typescript
  it("renders assert_not_visible as a negative assertion", () => {
    expect(renderStep({ action: "assert_not_visible", target: { css: ".board_list tr" } }))
      .toBe("Assert NOT visible: [css .board_list tr]");
  });
```

`tests/scenario/parseScenario.test.ts` 에 추가:

```typescript
  it("accepts assert_not_visible as a known action", () => {
    const y = "id: s\ntitle: t\nsteps:\n  - { action: assert_not_visible, target: { css: '.row' } }\n";
    expect(parseScenario(y).steps[0].action).toBe("assert_not_visible");
  });
```

`tests/run/buildPrompt.test.ts` 의 `describe("SYSTEM_CONTRACT")` 안에 추가:

```typescript
  it("contracts assert_not_visible, including the settle rule that stops a free pass", () => {
    expect(SYSTEM_CONTRACT).toContain("assert_not_visible");
    expect(SYSTEM_CONTRACT).toMatch(/settled/i);
    expect(SYSTEM_CONTRACT).toMatch(/NOT_TESTED, not PASS/);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario/actions.test.ts tests/scenario/parseScenario.test.ts tests/run/buildPrompt.test.ts`

Expected: 3건 FAIL. actions 테스트는 `RENDERERS[step.action] is not a function`, parseScenario는 `unknown action "assert_not_visible"`, buildPrompt는 문자열 미포함.

- [ ] **Step 3: Step 유니온에 추가한다**

`src/scenario/types.ts` — `assert_visible` 줄 바로 다음에:

```typescript
  | { action: "assert_not_visible"; target: Target }
```

- [ ] **Step 4: 렌더러를 추가한다**

`src/scenario/actions.ts` — `assert_visible` 항목 바로 다음에:

```typescript
  assert_not_visible: (s) => `Assert NOT visible: [${describeTarget(s.target)}]`,
```

- [ ] **Step 5: 계약 문구를 추가한다**

`src/run/buildPrompt.ts` 의 `[Assertions]` 섹션, `assert_value` 줄 다음에:

```
- assert_not_visible: the target must be ABSENT from the DOM, or present but not visible (display:none, visibility:hidden, zero size). Visible → FAIL. Check ONCE.
- A page that has not rendered yet passes assert_not_visible for free. Judge only after the area has settled — the scenario should wait_for a stable container first. If the page is still loading, that is NOT_TESTED, not PASS.
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (171건). 이어서 `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 7: 커밋**

```bash
git add src/scenario/types.ts src/scenario/actions.ts src/run/buildPrompt.ts tests/
# 메시지를 파일에 쓴 뒤:
git commit -F <msgfile>
```

제목: `feat(dsl): assert_not_visible 액션 추가`
본문: 부정 단언 부재로 "목록에서 사라졌는가"를 검증 못 하던 문제. settle 규약(안정된 뒤 판정, 로딩 중이면 NOT_TESTED)을 계약에 함께 명시한다 — 이게 없으면 아직 안 그려진 페이지가 단언을 거저 통과시킨다.

---

## Task 2: config `preflight:` 파싱

**Files:**
- Modify: `src/config/loadConfig.ts`
- Test: `tests/config/loadConfig.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  ```typescript
  export interface PreflightCheck { url: string; expect_status?: number[]; expect_title?: string; }
  // Config 에 preflight?: PreflightCheck[] 추가
  ```
  `expect_status`는 YAML에서 숫자 하나든 배열이든 받아 **항상 `number[]`로 정규화**해 내보낸다. Task 3·4가 이 타입에 의존한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/config/loadConfig.test.ts` 에 추가:

```typescript
describe("parseConfig (preflight)", () => {
  const base = "targets:\n  frontend: http://localhost:5173\n  backend: http://localhost:8081\n";

  it("substitutes ${targets.*} so the port is declared once", () => {
    const c = parseConfig(base + "preflight:\n  - { url: \"${targets.frontend}\", expect_title: eBill }\n  - { url: \"${targets.backend}/v3/api-docs\", expect_status: [200, 401] }\n");
    expect(c.preflight?.[0].url).toBe("http://localhost:5173");
    expect(c.preflight?.[1].url).toBe("http://localhost:8081/v3/api-docs");
  });
  it("normalizes a single expect_status into a list", () => {
    const c = parseConfig(base + "preflight:\n  - { url: \"${targets.frontend}\", expect_status: 200 }\n");
    expect(c.preflight?.[0].expect_status).toEqual([200]);
  });
  it("fails when preflight refers to a target that is not configured", () => {
    const noBackend = "targets:\n  frontend: http://x\n";
    expect(() => parseConfig(noBackend + "preflight:\n  - { url: \"${targets.backend}/h\" }\n"))
      .toThrow(/targets\.backend/);
  });
  it("rejects a non-numeric expect_status", () => {
    expect(() => parseConfig(base + "preflight:\n  - { url: \"${targets.frontend}\", expect_status: ok }\n"))
      .toThrow(/expect_status/);
  });
  it("leaves preflight undefined when the block is absent", () => {
    expect(parseConfig(base).preflight).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/config/loadConfig.test.ts`
Expected: 5건 FAIL — `c.preflight` 가 `undefined` (필드 자체가 없음).

- [ ] **Step 3: 구현한다**

`src/config/loadConfig.ts` — `Config` 인터페이스 위에 타입 추가:

```typescript
export interface PreflightCheck { url: string; expect_status?: number[]; expect_title?: string; }
```

`Config` 에 필드 추가:

```typescript
  preflight?: PreflightCheck[];
```

치환 + 파싱 함수를 `parseConfig` 위에 추가:

```typescript
function substituteTargets(url: string, targets: Config["targets"]): string {
  return url.replace(/\$\{targets\.(frontend|backend)\}/g, (_m, key: string) => {
    const v = (targets as Record<string, string | undefined>)[key];
    if (!v) throw new Error(`config preflight refers to \${targets.${key}} but targets.${key} is not set`);
    return v;
  });
}

function parsePreflight(raw: unknown, targets: Config["targets"]): PreflightCheck[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error("config field 'preflight' must be a list");
  return raw.map((e: any, i: number): PreflightCheck => {
    if (typeof e?.url !== "string") throw new Error(`config preflight[${i}] is missing a required field: url`);
    let expect_status: number[] | undefined;
    if (e.expect_status !== undefined) {
      const list = Array.isArray(e.expect_status) ? e.expect_status : [e.expect_status];
      if (!list.every((n: unknown) => typeof n === "number"))
        throw new Error(`config preflight[${i}] expect_status must be a number or a list of numbers`);
      expect_status = list;
    }
    if (e.expect_title !== undefined && typeof e.expect_title !== "string")
      throw new Error(`config preflight[${i}] expect_title must be a string`);
    return { url: substituteTargets(e.url, targets), expect_status, expect_title: e.expect_title };
  });
}
```

`parseConfig` 의 return 문에서 `targets` 를 먼저 지역 변수로 만든 뒤 `preflight` 를 채운다:

```typescript
  const parsedTargets = { frontend, backend: raw?.targets?.backend };
  return {
    project: typeof raw.project === "string" ? raw.project : "unknown",
    targets: parsedTargets,
    runner: { /* 기존 그대로 */ },
    vars,
    preflight: parsePreflight(raw?.preflight, parsedTargets),
  };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/config/loadConfig.test.ts` → PASS
Run: `npx vitest run` → 전체 PASS

- [ ] **Step 5: 커밋**

제목: `feat(config): preflight 점검 항목 선언 지원`
본문: `${targets.frontend}`/`${targets.backend}` 치환으로 포트를 한 곳에만 적는다. `expect_status`는 단일 숫자도 배열로 정규화해 소비 측 분기를 없앤다.

---

## Task 3: `checkPreflight` 순수 함수

**Files:**
- Create: `src/preflight/checkPreflight.ts`
- Test: `tests/preflight/checkPreflight.test.ts`

**Interfaces:**
- Consumes: Task 2의 `PreflightCheck`
- Produces:
  ```typescript
  export const PREFLIGHT_TIMEOUT_MS = 5_000;
  export interface PreflightFailure { url: string; reason: string; }
  export type PreflightFetch = (url: string) => Promise<{ status: number; text(): Promise<string> }>;
  export function checkPreflight(checks: PreflightCheck[], fetchFn: PreflightFetch): Promise<PreflightFailure[]>;
  ```
  빈 배열 = 전부 통과. Task 4가 이걸 호출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/preflight/checkPreflight.test.ts` (신규):

```typescript
import { describe, it, expect } from "vitest";
import { checkPreflight, type PreflightFetch } from "../../src/preflight/checkPreflight.js";

const ok = (status: number, body = ""): PreflightFetch =>
  async () => ({ status, text: async () => body });

describe("checkPreflight", () => {
  it("passes when the title matches and the status is allowed", async () => {
    const f = await checkPreflight(
      [{ url: "http://x", expect_title: "eBill", expect_status: [200] }],
      ok(200, "<html><head><title>eBill KG</title></head></html>")
    );
    expect(f).toEqual([]);
  });

  // The real failure: law_alarm's dev server held IPv6 [::1]:5173, so the port answered 200
  // with a different app and the executor reported a bogus "login failed".
  it("catches another app squatting the port, which a status check alone would pass", async () => {
    const f = await checkPreflight(
      [{ url: "http://localhost:5173", expect_title: "eBill" }],
      ok(200, "<title>건축법규 자동검토</title>")
    );
    expect(f).toHaveLength(1);
    expect(f[0].reason).toContain("eBill");
    expect(f[0].reason).toContain("건축법규 자동검토");
  });

  it("reports a status outside the allowed list", async () => {
    const f = await checkPreflight([{ url: "http://x", expect_status: [200, 401] }], ok(503));
    expect(f[0].reason).toMatch(/expected status 200\|401, got 503/);
  });

  it("treats a connection failure as a failure, not a crash", async () => {
    const boom: PreflightFetch = async () => { throw new Error("ECONNREFUSED"); };
    const f = await checkPreflight([{ url: "http://dead" }], boom);
    expect(f[0].reason).toContain("ECONNREFUSED");
  });

  it("checks only connectivity when no expectation is declared", async () => {
    expect(await checkPreflight([{ url: "http://x" }], ok(404))).toEqual([]);
  });

  it("does not report a title mismatch on top of a status failure", async () => {
    const f = await checkPreflight(
      [{ url: "http://x", expect_status: [200], expect_title: "eBill" }],
      ok(500, "<title>Error</title>")
    );
    expect(f).toHaveLength(1);
    expect(f[0].reason).toMatch(/status/);
  });

  it("reports every failing check, not just the first", async () => {
    const f = await checkPreflight(
      [{ url: "http://a", expect_status: [200] }, { url: "http://b", expect_status: [200] }],
      ok(500)
    );
    expect(f).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/preflight/checkPreflight.test.ts`
Expected: 모듈이 없어 import 에러로 전체 FAIL.

- [ ] **Step 3: 구현한다**

`src/preflight/checkPreflight.ts` (신규):

```typescript
import type { PreflightCheck } from "../config/loadConfig.js";

export const PREFLIGHT_TIMEOUT_MS = 5_000;

export interface PreflightFailure { url: string; reason: string; }
export type PreflightFetch = (url: string) => Promise<{ status: number; text(): Promise<string> }>;

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

export async function checkPreflight(
  checks: PreflightCheck[],
  fetchFn: PreflightFetch
): Promise<PreflightFailure[]> {
  const failures: PreflightFailure[] = [];
  for (const c of checks) {
    let res: { status: number; text(): Promise<string> };
    try {
      res = await fetchFn(c.url);
    } catch (e) {
      failures.push({ url: c.url, reason: `request failed — ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (c.expect_status && !c.expect_status.includes(res.status)) {
      failures.push({ url: c.url, reason: `expected status ${c.expect_status.join("|")}, got ${res.status}` });
      continue;
    }
    if (c.expect_title !== undefined) {
      const title = (await res.text()).match(TITLE_RE)?.[1]?.trim() ?? "";
      if (!title.includes(c.expect_title))
        failures.push({ url: c.url, reason: `expected <title> to contain "${c.expect_title}", got "${title}"` });
    }
  }
  return failures;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/preflight/checkPreflight.test.ts` → 7건 PASS
Run: `npx vitest run` → 전체 PASS

- [ ] **Step 5: 커밋**

제목: `feat(preflight): 대상 점검 순수 함수`
본문: fetch를 주입받아 네트워크 없이 단위 테스트한다. 상태코드가 이미 틀렸으면 제목은 보지 않는다 — 실패 하나에 이유 하나.

---

## Task 4: CLI 배선 + `--no-preflight`

**Files:**
- Modify: `src/cli.ts` (run 커맨드: 옵션 정의 25-36행, 액션 본문 38행 직후)
- Test: 실제 CLI 실행 (cli.ts는 기존에도 단위 테스트가 없다)

**Interfaces:**
- Consumes: Task 2의 `Config.preflight`, Task 3의 `checkPreflight` / `PREFLIGHT_TIMEOUT_MS`
- Produces: 없음 (종단 배선)

- [ ] **Step 1: import 와 옵션을 추가한다**

`src/cli.ts` 상단 import 에 추가:

```typescript
import { checkPreflight, PREFLIGHT_TIMEOUT_MS } from "./preflight/checkPreflight.js";
```

`run` 커맨드 옵션에 추가 (`--tag` 다음 줄):

```typescript
  .option("--no-preflight", "skip the pre-run target health check")
```

액션 시그니처의 opts 타입에 `preflight?: boolean` 을 추가한다. commander는 `--no-x` 형태를 `opts.x === false` 로 준다.

- [ ] **Step 2: 스폰 전에 호출한다**

`const config = loadConfig(resolve(opts.config));` **바로 다음**에 삽입한다. 시나리오 로딩보다 먼저다 — 대상이 죽었으면 시나리오가 뭐든 의미가 없다.

```typescript
      if (opts.preflight !== false && config.preflight?.length) {
        // Do NOT normalize the URL (e.g. localhost → 127.0.0.1). Chrome resolves localhost to ::1
        // first, and rewriting it here would check a different listener than the executor sees —
        // exactly the bug this catches (another app held IPv6 [::1]:5173).
        const failures = await checkPreflight(config.preflight, (url) =>
          fetch(url, { signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS) }));
        if (failures.length) {
          for (const f of failures) console.error(`preflight failed: ${f.url} — ${f.reason}`);
          console.error("no executor was spawned. Fix the target(s) or re-run with --no-preflight.");
          process.exit(2);
        }
      }
```

- [ ] **Step 3: 타입체크와 전체 테스트**

Run: `npx tsc --noEmit` → 출력 없음
Run: `npx vitest run` → 전체 PASS

- [ ] **Step 4: 죽은 대상으로 실제 동작을 확인한다**

임시 config를 스크래치패드에 만든다 (`preflight-dead.yaml`):

```yaml
project: probe
targets:
  frontend: http://localhost:59999
preflight:
  - { url: "${targets.frontend}", expect_title: "eBill" }
```

Run: `npx tsx src/cli.ts run scenarios/ebill/seed/03-committee-referral.yaml -c <임시경로>/preflight-dead.yaml`

Expected: `preflight failed: http://localhost:59999 — request failed — ...` 출력, exit code 2, **executor 프로세스 0개**. 확인: `Get-Process claude -ErrorAction SilentlyContinue` 가 비어 있어야 한다.

- [ ] **Step 5: 건너뛰기가 동작하는지 확인한다**

Run: 같은 명령에 `--no-preflight` 를 붙인다.
Expected: preflight 메시지 없이 평소대로 진행(대상이 죽었으니 결국 실패하지만, **preflight 단계는 건너뛴 것**이 확인되면 된다). 확인 후 즉시 중단(Ctrl+C)해도 된다.

- [ ] **Step 6: 커밋**

제목: `feat(cli): 실행 전 preflight — 실패 시 executor 0회 스폰`
본문: 대상이 죽었거나 다른 앱이 포트를 선점한 경우를 5초 안에 잡는다. 실패는 즉시 종료(exit 2)이며 결과 파일을 남기지 않는다 — 실행이 일어나지 않은 것을 run으로 기록하지 않는다. `--no-preflight` 로 건너뛴다.

---

## Task 5: 스크린샷 계약 + 결과 봉투

**Files:**
- Modify: `src/run/buildPrompt.ts` (`[Screenshots]` 31-33행, 출력 형식 107-113행)
- Modify: `src/result/types.ts` (`StepResult` 4행, `ScenarioResult` 6-14행)
- Modify: `src/result/parseExecutorResult.ts` (`PartialResult`, 정상 파싱 경로, `salvage`)
- Modify: `src/scenario/types.ts` (screenshot Step에서 `save` 제거, 23행)
- Test: `tests/run/buildPrompt.test.ts`, `tests/result/parseExecutorResult.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `ScenarioResult.screenshots?: string[]`, `PartialResult.screenshots?: string[]`. Task 6이 이걸 채워 넣은 경로로 덮어쓴다.

- [ ] **Step 1: 죽은 필드의 참조를 먼저 확인한다**

Run: `npx tsc --noEmit` 은 지우기 전이라 무의미하다. 대신 grep으로 참조를 센다:

```bash
grep -rn "StepResult" src tests
grep -rn "\.save\b" src tests scenarios
```

Expected: `StepResult` 는 `src/result/types.ts` 정의와 `ScenarioResult.steps` 타입 참조뿐. `screenshot` 필드를 **읽는 곳은 0건**이어야 한다(한 번도 채워진 적 없음). `save:` 를 쓰는 시나리오 YAML도 0건이어야 한다. **0건이 아니면 지우지 말고 보고할 것.**

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/run/buildPrompt.test.ts` 의 `describe("SYSTEM_CONTRACT")` 에 추가:

```typescript
  it("tells the executor to persist screenshots and report their paths", () => {
    expect(SYSTEM_CONTRACT).toContain("save_to_disk");
    expect(SYSTEM_CONTRACT).toContain("screenshots");
  });
```

`describe("buildUserPrompt")` 에 추가:

```typescript
  it("puts screenshots at the top level, not inside the fragile steps array", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    const shotAt = p.indexOf('"screenshots"');
    const stepsAt = p.indexOf('"steps"');
    expect(shotAt).toBeGreaterThan(-1);
    expect(shotAt).toBeLessThan(stepsAt);
  });
```

`tests/result/parseExecutorResult.test.ts` 에 추가:

```typescript
  it("reads the top-level screenshots array", () => {
    const r = parseExecutorResult('{"status":"PASS","screenshots":["C:\\\\tmp\\\\a.png"]}');
    expect(r.screenshots).toEqual(["C:\\tmp\\a.png"]);
  });
  it("salvages screenshots even when the steps array is malformed", () => {
    const t = '{"status":"PASS","screenshots":["C:\\\\tmp\\\\a.png"],"steps":[{"index": 1-2}]}';
    const r = parseExecutorResult(t);
    expect(r.parse_repaired).toBe(true);
    expect(r.screenshots).toEqual(["C:\\tmp\\a.png"]);
  });
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/run/buildPrompt.test.ts tests/result/parseExecutorResult.test.ts`
Expected: 4건 FAIL — 계약 문자열 미포함, `screenshots` 가 `undefined`.

- [ ] **Step 4: 계약과 출력 형식을 고친다**

`src/run/buildPrompt.ts` 의 `[Screenshots — evidence only, not the verdict]` 섹션에서 두 번째 불릿을 아래로 교체:

```
- Take a screenshot only when the scenario has a screenshot action, best-effort, once. Call the computer tool with action "screenshot" and save_to_disk: true, then put the path it returns into the top-level "screenshots" array. If you can't capture it (element gone, capture failed, timeout), just skip and move on. NEVER loop re-triggering/resizing/scrolling/re-capturing. A failed screenshot is not a test failure.
```

출력 형식 JSON에서 `evidence` 다음 줄에 추가:

```
  "screenshots": ["absolute path returned by save_to_disk — one per screenshot step"],
```

- [ ] **Step 5: 타입과 파서를 고친다**

`src/result/types.ts`:
- `StepResult` 에서 `screenshot?: string;` **삭제** (Step 1에서 참조 0건 확인됨)
- `ScenarioResult` 에 `screenshots?: string[];` 추가

`src/scenario/types.ts` 23행:

```typescript
  | { action: "screenshot"; name?: string };
```

`src/result/parseExecutorResult.ts`:
- `PartialResult` 에 `screenshots?: string[];` 추가
- 정상 반환 객체에 추가:
  ```typescript
    screenshots: Array.isArray(obj.screenshots) ? obj.screenshots.filter((s: unknown) => typeof s === "string") : undefined,
  ```
- `salvage()` 반환 객체에 추가:
  ```typescript
    screenshots: salvageArray(text, "screenshots"),
  ```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run` → 전체 PASS
Run: `npx tsc --noEmit` → 출력 없음

- [ ] **Step 7: 커밋**

제목: `feat(result): 스크린샷 경로를 최상위 screenshots로 받는다`
본문: `steps[]` 안에 넣으면 범위 index 하나로 배열이 깨질 때 경로까지 같이 유실된다 — salvage 경로가 다루는 바로 그 지점이다. 한 번도 채워진 적 없는 `StepResult.screenshot` 과 미사용 `screenshot.save` 를 함께 제거한다.

---

## Task 6: 스크린샷 회수

**Files:**
- Create: `src/result/collectScreenshots.ts`
- Modify: `src/run/runScenario.ts` (`RunScenarioOptions`, 반환 직전)
- Modify: `src/run/runScenarios.ts` (run 디렉터리 전달, 56행)
- Test: `tests/result/collectScreenshots.test.ts`, `tests/run/runScenario.test.ts`

**Interfaces:**
- Consumes: Task 5의 `PartialResult.screenshots`
- Produces:
  ```typescript
  export interface ScreenshotFs { mkdir(dir: string): void; copy(src: string, dest: string): void; }
  export function collectScreenshots(paths: string[], destDir: string, fs: ScreenshotFs): string[];
  ```
  `RunScenarioOptions` 에 `resultDir?: string`, `screenshotFs?: ScreenshotFs` 추가.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/result/collectScreenshots.test.ts` (신규):

```typescript
import { describe, it, expect } from "vitest";
import { collectScreenshots, type ScreenshotFs } from "../../src/result/collectScreenshots.js";

function fakeFs(failOn?: string) {
  const copied: Array<[string, string]> = [];
  const made: string[] = [];
  const fs: ScreenshotFs = {
    mkdir: (d) => { made.push(d); },
    copy: (s, d) => { if (s === failOn) throw new Error("EPERM"); copied.push([s, d]); },
  };
  return { fs, copied, made };
}

describe("collectScreenshots", () => {
  it("copies each screenshot into the run directory and returns the new paths", () => {
    const { fs, copied, made } = fakeFs();
    const out = collectScreenshots(["/tmp/a.png", "/tmp/b.png"], "runs/RID/s1", fs);
    expect(made).toEqual(["runs/RID/s1"]);
    expect(copied).toHaveLength(2);
    expect(out[0]).toMatch(/a\.png$/);
    expect(out[0]).not.toBe("/tmp/a.png");
  });
  it("keeps the original path when a copy fails, instead of losing the evidence", () => {
    const { fs } = fakeFs("/tmp/a.png");
    const out = collectScreenshots(["/tmp/a.png", "/tmp/b.png"], "runs/RID/s1", fs);
    expect(out[0]).toBe("/tmp/a.png");
    expect(out[1]).toMatch(/b\.png$/);
  });
  it("does nothing and creates no directory for an empty list", () => {
    const { fs, made } = fakeFs();
    expect(collectScreenshots([], "runs/RID/s1", fs)).toEqual([]);
    expect(made).toEqual([]);
  });
});
```

`tests/run/runScenario.test.ts` 에 추가:

```typescript
  it("collects the executor's screenshots into the run directory", async () => {
    const withShot = JSON.stringify({ type: "result",
      result: '```json\n{"status":"PASS","screenshots":["/tmp/a.png"]}\n```' });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(withShot); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, {
      ...base, spawner, logLine: () => {},
      resultDir: "runs/RID",
      screenshotFs: { mkdir: () => {}, copy: () => {} },
    });
    expect(r.screenshots?.[0]).toMatch(/runs[/\\]RID[/\\]s1[/\\]a\.png$/);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/result/collectScreenshots.test.ts tests/run/runScenario.test.ts`
Expected: collectScreenshots는 import 에러, runScenario는 `r.screenshots` 가 `["/tmp/a.png"]` (복사 안 됨).

- [ ] **Step 3: 모듈을 만든다**

`src/result/collectScreenshots.ts` (신규):

```typescript
import { basename, join } from "node:path";

export interface ScreenshotFs {
  mkdir(dir: string): void;
  copy(src: string, dest: string): void;
}

// The executor writes screenshots into its own session temp dir, whose lifetime we do not control.
// Copy them next to the run's results so "check the screenshot afterwards" actually works.
// A copy failure keeps the original path — half the evidence beats none.
export function collectScreenshots(paths: string[], destDir: string, fs: ScreenshotFs): string[] {
  if (!paths.length) return [];
  try {
    fs.mkdir(destDir);
  } catch {
    return paths;
  }
  return paths.map((src) => {
    const dest = join(destDir, basename(src));
    try {
      fs.copy(src, dest);
      return dest;
    } catch {
      return src;
    }
  });
}
```

- [ ] **Step 4: 러너에 배선한다**

`src/run/runScenario.ts`:

import 추가:

```typescript
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { collectScreenshots, type ScreenshotFs } from "../result/collectScreenshots.js";
```

`RunScenarioOptions` 에 추가:

```typescript
  resultDir?: string;                 // run output dir; screenshots are copied under it
  screenshotFs?: ScreenshotFs;        // injected for tests
```

파일 하단, `runScenario` 위에 기본 구현:

```typescript
const defaultScreenshotFs: ScreenshotFs = {
  mkdir: (d) => { mkdirSync(d, { recursive: true }); },
  copy: (s, d) => { copyFileSync(s, d); },
};
```

최종 return 문 직전에:

```typescript
  const shots = parsed.screenshots ?? [];
  const screenshots = opts.resultDir
    ? collectScreenshots(shots, join(opts.resultDir, scenario.id), opts.screenshotFs ?? defaultScreenshotFs)
    : shots;
```

return 객체에 `screenshots: screenshots.length ? screenshots : undefined,` 추가.

`src/run/runScenarios.ts` 56행의 `runScenario` 호출에 `resultDir: dir` 을 추가한다 (`dir` 은 42행에서 이미 계산됨).

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run` → 전체 PASS
Run: `npx tsc --noEmit` → 출력 없음

- [ ] **Step 6: 커밋**

제목: `feat(result): 스크린샷을 runs/ 로 회수`
본문: executor 세션 임시 디렉터리는 수명을 우리가 통제하지 못한다. 결과 옆으로 복사해야 사후 확인이 실제로 된다. 복사 실패 시 원경로를 유지한다.

---

## Task 7: 문서·계약 정정

**Files:**
- Modify: `src/run/buildPrompt.ts` (SYSTEM_CONTRACT — P3 문구)
- Modify: `skills/tester-mcp/document-guide.md` (액션 목록 105-122행, Target 절 190-196행)
- Modify: `scenarios/ebill/seed/README.md` (114행 "DSL 액션은 9개다")
- Test: `tests/run/buildPrompt.test.ts`

**Interfaces:**
- Consumes: Task 1의 `assert_not_visible`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/run/buildPrompt.test.ts` 의 `describe("SYSTEM_CONTRACT")` 에 추가:

```typescript
  it("forbids inventing expectations the steps do not state", () => {
    expect(SYSTEM_CONTRACT).toMatch(/do not invent expectations/i);
    expect(SYSTEM_CONTRACT).toMatch(/disappearing from a list/i);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/run/buildPrompt.test.ts`
Expected: 1건 FAIL.

- [ ] **Step 3: 계약에 P3 문구를 넣는다**

`src/run/buildPrompt.ts` — `[Status labels]` 섹션 **바로 앞**에 새 섹션을 추가한다:

```
[Judge only what the steps assert]
- Do not invent expectations the steps do not state. Your verdict covers the given steps and nothing else.
- An item disappearing from a list after you acted on it is NOT a failure unless a step asserts it should still be there. Approving a document removes it from the approval queue — that is the action working, not a missing record. If the scenario wants that checked, it says so with assert_not_visible.
```

> 이 문구는 관대해지라는 지시가 아니다. "사라진 것도 성공의 증거일 수 있다"라고 쓰면 진짜 실패도 성공으로 합리화하는 편향이 생긴다. 문제는 executor가 시나리오에 없는 기대를 스스로 만든 것이므로, 처방은 "기대를 만들지 말 것"이어야 한다.

- [ ] **Step 4: 가이드의 액션 목록을 갱신한다**

`skills/tester-mcp/document-guide.md` 114행 `assert_visible` 항목 **다음**에 추가:

```markdown
- `assert_not_visible` — `{ action: assert_not_visible, target: <target> }`. The target must be
  absent from the DOM, or present but not visible. Use it for "it is gone from the list" — after a
  delete, an approval that clears the queue, or a filter that should exclude a row.
  **A page that has not rendered yet passes this for free**, so put a `wait_for` on a stable
  container immediately before it. Without that, the check is vacuous and always passes.
```

- [ ] **Step 5: `description` 정정을 넣는다**

`skills/tester-mcp/document-guide.md` — "**Authoring rule (selector-first).**" 문단(190-196행) **다음**에 문단을 추가:

```markdown
**`description` is also read as an expectation.** It is a last-resort *locator*, but the executor
also compares it against what it sees, and bails with NOT_TESTED when the two disagree — even when
`css` or a `ref` alias already pinned the element. A stale description is therefore a scenario bug,
not a harmless comment: `seed-08` stopped because its description said "법적행위 목록" while the
screen read "본회의검증". Keep every description true to the screen, or leave it out. This check is
the model's judgment, not a deterministic rule, so never rely on it to verify content — use
`assert_value` for that.
```

- [ ] **Step 6: seed README의 액션 개수를 고친다**

`scenarios/ebill/seed/README.md` 114-115행:

```markdown
DSL 액션은 10개다: `navigate` `fill` `click` `double_click` `upload` `wait_for` `assert_visible`
`assert_not_visible` `assert_value` `screenshot`.
```

- [ ] **Step 7: 통과를 확인한다**

Run: `npx vitest run` → 전체 PASS

- [ ] **Step 8: 커밋**

제목: `docs: description은 기대값이기도 하다 + 부수효과 오독 방지 계약`
본문: 가이드는 `description`을 "최후 수단 폴백"이라고만 했는데 seed README에는 이미 "사실과 맞아야 한다"가 적혀 있었다 — AI가 읽는 정본은 가이드이므로 그쪽에 올린다. 계약에는 시나리오에 없는 기대를 만들지 말라는 조항을 넣는다(seed-08이 자기가 결재해서 빠진 문서를 미처리로 읽었다).

---

## Task 8: 라이브 검증

**Files:** 없음 (실행만)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 검증 결과. **설계 §9에 미검증으로 표시된 두 가지를 여기서 가른다.**

> **선행 조건:** 백엔드(8081)와 프론트(5173)가 떠 있어야 하고, Chrome에 claude-in-chrome 확장이 연결돼 있어야 한다. 실행 중 Chrome 창을 전면에 유지한다(백그라운드면 렌더러가 얼어 스크린샷이 타임아웃된다).

- [ ] **Step 1: preflight 정상 통과를 확인한다**

`tester-mcp.config.yaml` 에 preflight 블록을 추가한다:

```yaml
preflight:
  - { url: "${targets.frontend}", expect_title: "eBill" }
  - { url: "${targets.backend}/v3/api-docs", expect_status: [200, 401] }
```

Run: `npx tsx src/cli.ts validate scenarios/ebill/seed/03-committee-referral.yaml`
그다음 실제 run 을 한 건 돌린다.
Expected: preflight 메시지 없이 곧장 executor 스폰. **실측한 `<title>` 값이 "eBill" 을 포함하지 않으면 config 를 실제 값으로 고칠 것** — 이 값은 추정이며, 브라우저에서 확인한 실제 제목을 써야 한다.

- [ ] **Step 2: 백엔드를 내리고 다시 돌린다**

백엔드를 중지한 뒤 같은 명령.
Expected: `preflight failed: http://localhost:8081/v3/api-docs — request failed — ...`, exit 2, executor 0개.

- [ ] **Step 3: `save_to_disk` 가 실제로 파일을 남기는지 가른다**

**설계 §9의 미검증 항목이다.** `screenshot` 스텝이 있는 시나리오를 1건 돌린다 (예: `scenarios/ebill/seed/03-committee-referral.yaml` — screenshot 6개).

Expected: `runs/<run_id>/03-committee-referral/` 아래에 png 파일이 생기고, 결과 JSON의 `screenshots` 가 그 경로들을 가리킨다.

**실패 시 대응:** `screenshots` 가 비어 있으면 `runs/<run_id>/<id>.log` 에서 `computer` 호출의 인자를 확인한다. executor가 `save_to_disk` 를 안 보냈으면 계약 문구를 강화하고, 보냈는데 경로가 안 왔으면 **도구가 `-p --chrome` 환경에서 이 파라미터를 지원하지 않는 것**이므로 Task 5·6을 되돌리지 말고 설계 문서 §10에 실측 결과로 기록한 뒤 사용자에게 보고한다.

- [ ] **Step 4: `assert_not_visible` 을 실화면에서 확인한다**

`assert_not_visible` 을 쓰는 시나리오를 1건 새로 쓴다 — 검색 필터로 목록을 좁힌 뒤, 존재하지 않는 의안번호 행이 없음을 단언한다:

```yaml
  - { action: wait_for,           target: { css: ".board_list" } }
  - { action: assert_not_visible, target: { css: ".board_list tr[data-bill='NO-SUCH-BILL']" } }
```

Expected: PASS. 이어서 **실제로 존재하는 행**으로 바꿔 한 번 더 돌려 FAIL 이 나오는지 확인한다 — 항상 통과하는 헛단언이 아님을 증명하는 것이 이 스텝의 목적이다.

- [ ] **Step 5: 결과를 문서에 기록한다**

`docs/superpowers/specs/2026-08-12-run-reliability-design.md` 에 "## 12. 라이브 검증 결과 (2026-08-12)" 절을 추가하고, Step 1~4의 실측을 표로 적는다. Obsidian `Projects/testMcp/specs/2026-08-12-run-reliability-design.md` 의 진행 체크박스와 `progress` frontmatter 도 갱신한다.

- [ ] **Step 6: 커밋**

제목: `test: 라이브 검증 — preflight·스크린샷 저장·부정 단언`

---

## Task 9: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` (6행 `## [0.7.0]` 위에 삽입)
- Modify: `package.json` (version 3행)

**Interfaces:**
- Consumes: Task 1~8
- Produces: 없음

> **주의:** npm publish 는 하지 않는다. 배포 시점은 사용자가 정한다.

- [ ] **Step 1: 항목을 추가한다**

`CHANGELOG.md` 3-4행의 머리말 다음, `## [0.7.0]` 앞에:

```markdown
## [0.8.0]

### Added
- **`assert_not_visible` action** — the target must be absent from the DOM, or present but not
  visible. Fills the gap that made "it is gone from the list" unverifiable. A page that has not
  rendered yet passes it for free, so the contract requires judging only after the area has settled
  (`wait_for` a stable container first); still loading is NOT_TESTED, not PASS.
- **`preflight:` config block** — declares what proves a target is the right, live app before any
  executor is spawned: `expect_title` for the frontend (a status code alone passes when another app
  squats the port) and `expect_status` for the backend (401 is the liveness signal behind an auth
  filter). URLs interpolate `${targets.frontend}` / `${targets.backend}` so the port is declared
  once, and are never normalized — rewriting localhost to 127.0.0.1 would check a different listener
  than Chrome resolves. A failure exits immediately with the expected-vs-observed reason and spawns
  nothing; `--no-preflight` skips it.
- **Screenshots are persisted.** The executor saves them with the browser tool's `save_to_disk` and
  reports the paths in a top-level `screenshots` array; the runner copies them under
  `runs/<run_id>/<scenario_id>/`. Paths sit at the top level, not inside `steps[]`, because that
  array is exactly what breaks when the executor emits a malformed index.

### Changed
- **A result whose JSON fails to parse is no longer discarded.** `status`, `evidence`,
  `handoff_notes` and `not_tested_reason` are recovered from the raw text and flagged with
  `parse_repaired: true`. Measured on two eBill runs where an `"index": 35-36` range made the whole
  envelope unparseable and filed a real PASS as NOT_TESTED, losing the handoff notes with it.
  `status` is read only from the text before `"steps"`: a status inside the steps array belongs to
  one step, and promoting it would turn a failed run into a pass.
- **Contract: `description` is read as an expectation, not only as a locator.** The executor
  compares it against what it sees and bails when they disagree, even when `css`/`ref` already
  pinned the element — so a stale description is a scenario bug. Documented in the authoring guide.
- **Contract: the executor no longer invents expectations.** A row disappearing from a list after
  it acted on it is not a failure unless a step asserts otherwise.

### Removed
- `StepResult.screenshot` and the `screenshot` step's `save` field — both were declared but never
  populated or read.
```

- [ ] **Step 2: 버전을 올린다**

`package.json` 3행: `"version": "0.8.0",`

- [ ] **Step 3: 확인**

Run: `npx vitest run` → 전체 PASS

- [ ] **Step 4: 커밋**

제목: `chore(release): v0.8.0 — preflight + 부정 단언 + 스크린샷 증거`

---

## 자체 검토 결과

**스펙 커버리지** — 설계 §3(봉투) → Task 5·6 / §4(salvage) → 완료(`642ff2f`) / §5(부정 단언) → Task 1 / §6(preflight) → Task 2·3·4 / §7(문서·계약) → Task 7 / §9(테스트) → 각 태스크에 분산 + Task 8 / §10 리스크의 미검증 2건 → Task 8 Step 3·4. **누락 없음.**

**타입 일관성** — `PreflightCheck`(Task 2 정의 → Task 3·4 소비), `PreflightFailure`·`PREFLIGHT_TIMEOUT_MS`(Task 3 → Task 4), `ScreenshotFs`·`collectScreenshots`(Task 6 내부), `PartialResult.screenshots`(Task 5 → Task 6). 이름 불일치 없음.

**남은 불확실성** — Task 8 Step 1의 `expect_title: "eBill"` 은 **추정값**이다. 실제 `<title>` 을 브라우저에서 확인해 고쳐야 하며, 그 지시를 스텝에 명시해 뒀다.
