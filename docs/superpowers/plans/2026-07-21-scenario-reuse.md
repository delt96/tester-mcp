# 시나리오 재사용 기반 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시나리오를 `scenarios/<project>/` 구조로 저장하고, 파스타임 확장(fragments·selector 별칭·tags·vars)과 `validate` 명령으로 재사용 기반을 구축한다.

**Architecture:** 모든 재사용 장치는 CLI 파스 단계에서 펼쳐진다(스펙: `docs/superpowers/specs/2026-07-21-scenario-reuse-design.md`). executor 프롬프트·result 스키마·runScenarios는 무변경. 새 모듈 `reuseAssets`(자산 탐색)·`expandScenario`(확장 파이프라인)·`loadScenario`(파일→Scenario)를 추가하고 cli가 이를 사용한다.

**Tech Stack:** TypeScript(ESM, import에 `.js` 접미사 필수), commander, yaml, vitest. 새 의존성 추가 금지.

## Global Constraints

- 도구 표면 텍스트(에러 메시지, CLI help, 가이드 추가분, validate 출력)는 **영어** (배포 원칙 10). 새 코드의 주석·테스트 `it()` 설명도 영어.
- 수정하는 함수의 기존 한국어 에러 문자열은 영어로 전환하고 해당 테스트 기대값도 갱신한다. 수정하지 않는 파일은 건드리지 않는다.
- executor 관련 코드(`src/run/buildPrompt.ts`, `src/run/runScenario*.ts`, `src/scenario/actions.ts`의 renderStep) 무변경.
- 시나리오 YAML의 기존 한국어 `description`은 **그대로 유지** (executor 동작 동일성 보장 — 마이그레이션에서 원문 verbatim 복사).
- Node >= 20. 커밋은 태스크마다. 커밋 트레일러:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_016znzs44iegBR7uLjuUrbj1`
- 테스트 실행 명령: `npx vitest run <파일>` (전체: `npm test`).

## File Structure

```
src/scenario/expandScenarioPaths.ts   # [수정] 재귀 수집 + "_" 제외
src/config/loadConfig.ts              # [수정] vars 로딩
src/scenario/types.ts                 # [수정] Scenario.tags
src/scenario/parseScenario.ts         # [수정] parseScenarioObject 추출 + tags 파싱
src/scenario/reuseAssets.ts           # [신규] fragment/_selectors 파싱 + nearest-ancestor 탐색
src/scenario/expandScenario.ts        # [신규] use/{{param}}/login_as/ref/vars 확장 파이프라인
src/scenario/loadScenario.ts          # [신규] 파일 → 탐색 → 확장 → Scenario
src/scenario/tags.ts                  # [신규] --tag 필터
src/validate.ts                       # [신규] validate 명령 로직
src/cli.ts                            # [수정] run 배선 + --tag + validate 명령
skills/tester-mcp/document-guide.md   # [수정] Reuse 섹션
skills/tester-mcp/SKILL.md            # [수정] 워크플로우 개정
scenarios/ebill/...                   # [마이그레이션] 26개 이동 + _fragments/ + _selectors.yaml
tests/scenario/*.test.ts, tests/config/loadConfig.test.ts, tests/validate.test.ts, tests/fixtures/reuse/...
```

---

### Task 1: expandScenarioPaths — 재귀 수집 + `_` 제외

**Files:**
- Modify: `src/scenario/expandScenarioPaths.ts`
- Test: `tests/scenario/expandScenarioPaths.test.ts` (기존 파일에 추가·갱신)

**Interfaces:**
- Produces: `expandScenarioPaths(inputs: string[]): string[]` — 시그니처 불변. 디렉터리는 이제 **재귀** 수집하며 `_` 프리픽스 파일·디렉터리를 건너뜀. 에러 메시지 영어화.

- [ ] **Step 1: 기존 테스트 읽기** — `tests/scenario/expandScenarioPaths.test.ts`를 Read로 확인 (임시 디렉터리 생성 패턴 파악, 한국어 에러 기대값 위치 확인).

- [ ] **Step 2: 실패하는 테스트 추가**

```ts
// tests/scenario/expandScenarioPaths.test.ts 에 추가 (기존 import 재사용)
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("recursive collection", () => {
  it("collects *.yaml from nested subdirectories, sorted depth-first by name", () => {
    const root = mkdtempSync(join(tmpdir(), "esp-"));
    mkdirSync(join(root, "b"));
    mkdirSync(join(root, "a", "deep"), { recursive: true });
    writeFileSync(join(root, "b", "2.yaml"), "x");
    writeFileSync(join(root, "a", "deep", "1.yaml"), "x");
    expect(expandScenarioPaths([root])).toEqual([
      join(root, "a", "deep", "1.yaml"),
      join(root, "b", "2.yaml"),
    ]);
  });
  it("skips underscore-prefixed files and directories", () => {
    const root = mkdtempSync(join(tmpdir(), "esp-"));
    mkdirSync(join(root, "_fragments"));
    writeFileSync(join(root, "_fragments", "login.yaml"), "x");
    writeFileSync(join(root, "_selectors.yaml"), "x");
    writeFileSync(join(root, "ok.yaml"), "x");
    expect(expandScenarioPaths([root])).toEqual([join(root, "ok.yaml")]);
  });
  it("errors when a directory yields only underscore assets", () => {
    const root = mkdtempSync(join(tmpdir(), "esp-"));
    writeFileSync(join(root, "_selectors.yaml"), "x");
    expect(() => expandScenarioPaths([root])).toThrow(/no scenarios/);
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/scenario/expandScenarioPaths.test.ts` / Expected: 신규 3건 FAIL (재귀 미지원).

- [ ] **Step 4: 구현**

```ts
// src/scenario/expandScenarioPaths.ts 전체 교체
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const YAML_RE = /\.ya?ml$/i;

// Underscore-prefixed entries are reuse assets (_fragments/, _selectors.yaml), not scenarios.
function collectDir(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.name.startsWith("_")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collectDir(p, out);
    else if (YAML_RE.test(e.name)) out.push(p);
  }
}

// Expand CLI scenario inputs into a sorted, de-duplicated list of resolved file paths.
// - a directory → all *.yaml/*.yml under it, recursively
// - a file      → itself
export function expandScenarioPaths(inputs: string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    const p = resolve(input);
    let st;
    try { st = statSync(p); }
    catch { throw new Error(`scenario path not found: ${input}`); }
    if (st.isDirectory()) {
      const before = out.length;
      collectDir(p, out);
      if (out.length === before) throw new Error(`no scenarios (*.yaml/*.yml) under directory: ${input}`);
    } else {
      out.push(p);
    }
  }
  return [...new Set(out)];
}
```

- [ ] **Step 5: 기존 테스트의 한국어 에러 기대값 갱신** — Step 1에서 확인한 기존 케이스 중 `시나리오 경로 없음`/`디렉토리에 시나리오` 기대값을 `scenario path not found`/`no scenarios`로 교체.

- [ ] **Step 6: 통과 확인** — Run: `npx vitest run tests/scenario/expandScenarioPaths.test.ts` / Expected: 전부 PASS.

- [ ] **Step 7: 커밋** — `git add src/scenario/expandScenarioPaths.ts tests/scenario/expandScenarioPaths.test.ts && git commit -m "feat(scenario): recursive path expansion, skip _-prefixed reuse assets"`

---

### Task 2: Config `vars` 로딩

**Files:**
- Modify: `src/config/loadConfig.ts`
- Test: `tests/config/loadConfig.test.ts` (추가)

**Interfaces:**
- Produces: `Config.vars: Record<string, string>` (필드 없으면 `{}`). 나머지 Config 필드 불변.

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
// tests/config/loadConfig.test.ts 에 추가
describe("vars", () => {
  it("parses vars as a string map", () => {
    const c = parseConfig(`targets: { frontend: "http://x" }\nvars: { doc_url: "/main/a?id=1" }`);
    expect(c.vars).toEqual({ doc_url: "/main/a?id=1" });
  });
  it("defaults to empty map when absent", () => {
    const c = parseConfig(`targets: { frontend: "http://x" }`);
    expect(c.vars).toEqual({});
  });
  it("rejects non-string var values", () => {
    expect(() => parseConfig(`targets: { frontend: "http://x" }\nvars: { n: 3 }`))
      .toThrow(/var 'n' must be a string/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/config/loadConfig.test.ts` / Expected: 신규 3건 FAIL.

- [ ] **Step 3: 구현** — `src/config/loadConfig.ts`의 `Config`에 `vars: Record<string, string>;` 추가, `parseConfig` return 직전에:

```ts
  const rawVars = (raw?.vars ?? {}) as Record<string, unknown>;
  if (typeof rawVars !== "object" || Array.isArray(rawVars))
    throw new Error("config field 'vars' must be a map of string values");
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVars)) {
    if (typeof v !== "string") throw new Error(`config var '${k}' must be a string`);
    vars[k] = v;
  }
```

return 객체에 `vars,` 추가.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/config/loadConfig.test.ts` / Expected: PASS.

- [ ] **Step 5: 커밋** — `git add src/config/loadConfig.ts tests/config/loadConfig.test.ts && git commit -m "feat(config): vars map for environment-specific scenario data"`

---

### Task 3: parseScenarioObject 추출 + `tags` 필드

**Files:**
- Modify: `src/scenario/types.ts`, `src/scenario/parseScenario.ts`
- Test: `tests/scenario/parseScenario.test.ts` (추가)

**Interfaces:**
- Produces: `parseScenarioObject(raw: unknown): Scenario` (신규 export — 확장 파이프라인이 파일 재직렬화 없이 호출), `parseScenario(yamlText: string): Scenario` (기존 유지 — 내부에서 parseScenarioObject 위임), `Scenario.tags?: string[]`.

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
// tests/scenario/parseScenario.test.ts 에 추가
import { parseScenarioObject } from "../../src/scenario/parseScenario.js";

describe("parseScenarioObject + tags", () => {
  const base = { id: "t1", title: "t", steps: [{ action: "navigate", url: "/" }] };
  it("accepts an already-parsed object", () => {
    expect(parseScenarioObject(base).id).toBe("t1");
  });
  it("parses tags as a string list", () => {
    expect(parseScenarioObject({ ...base, tags: ["smoke", "letter"] }).tags).toEqual(["smoke", "letter"]);
  });
  it("leaves tags undefined when absent", () => {
    expect(parseScenarioObject(base).tags).toBeUndefined();
  });
  it("rejects non-string tag entries", () => {
    expect(() => parseScenarioObject({ ...base, tags: [1] })).toThrow(/tags/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/scenario/parseScenario.test.ts` / Expected: 신규 4건 FAIL (export 없음).

- [ ] **Step 3: 구현** — `types.ts`의 `Scenario`에 `tags?: string[];` 추가. `parseScenario.ts`:

```ts
export function parseScenario(yamlText: string): Scenario {
  return parseScenarioObject(parseYaml(yamlText));
}

export function parseScenarioObject(rawIn: unknown): Scenario {
  const raw = rawIn as Record<string, unknown> | null;
  // ... 기존 본문 그대로 (raw 검증부터 steps/locale 처리까지) ...
  let tags: string[] | undefined;
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== "string"))
      throw new Error("scenario field 'tags' must be a list of strings");
    tags = raw.tags as string[];
  }
  return { /* 기존 필드들 */, tags };
}
```

기존 본문을 옮기기만 하고 검증 로직·기존 에러 문자열은 변경하지 않는다 (이 태스크는 이동+추가만).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/scenario/parseScenario.test.ts` / Expected: 기존+신규 전부 PASS.

- [ ] **Step 5: 커밋** — `git add src/scenario/types.ts src/scenario/parseScenario.ts tests/scenario/parseScenario.test.ts && git commit -m "feat(scenario): parseScenarioObject + tags field"`

---

### Task 4: reuseAssets — fragment/_selectors 파싱 + nearest-ancestor 탐색

**Files:**
- Create: `src/scenario/reuseAssets.ts`
- Create: `tests/fixtures/reuse/` (커밋되는 픽스처)
- Test: `tests/scenario/reuseAssets.test.ts`

**Interfaces:**
- Produces:
  - `interface Fragment { id: string; params: Record<string, string | null>; steps: unknown[] }`
  - `interface ReuseAssets { fragments: Map<string, Fragment>; selectors: Record<string, Target> }`
  - `parseFragment(yamlText: string, sourcePath: string): Fragment`
  - `parseSelectors(yamlText: string, sourcePath: string): Record<string, Target>`
  - `discoverReuseAssets(scenarioFile: string): ReuseAssets` — 시나리오 파일 위치에서 상위로 올라가며 자산 종류별로 가장 가까운 것 채택, 파일시스템 루트에서 중단.

- [ ] **Step 1: 픽스처 생성**

```
tests/fixtures/reuse/_fragments/login.yaml:
  id: login
  params:
    account: tester
  steps:
    - { action: navigate, url: "/" }
    - { action: fill, target: { css: "#u" }, value: "${secrets.{{account}}.username}" }

tests/fixtures/reuse/_selectors.yaml:
  toast_success:
    css: ".root-toast"

tests/fixtures/reuse/area/_selectors.yaml:
  toast_success:
    css: ".area-toast"
    description: area override

tests/fixtures/reuse/area/deep/dummy.yaml:
  id: dummy
  title: fixture anchor
  steps:
    - { action: navigate, url: "/" }
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// tests/scenario/reuseAssets.test.ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseFragment, parseSelectors, discoverReuseAssets } from "../../src/scenario/reuseAssets.js";

const FIX = join(__dirname, "..", "fixtures", "reuse");

describe("parseFragment", () => {
  it("parses id, params (string default / null = required), steps", () => {
    const f = parseFragment(`id: a\nparams: { x: "1", y: }\nsteps:\n  - { action: navigate, url: "/" }`, "a.yaml");
    expect(f.params).toEqual({ x: "1", y: null });
    expect(f.steps).toHaveLength(1);
  });
  it("rejects nested use (no fragment nesting)", () => {
    expect(() => parseFragment(`id: a\nsteps:\n  - use: other`, "a.yaml"))
      .toThrow(/cannot nest/);
  });
  it("rejects missing/invalid id and empty steps", () => {
    expect(() => parseFragment(`steps: [{ action: navigate, url: "/" }]`, "a.yaml")).toThrow(/id/);
    expect(() => parseFragment(`id: a\nsteps: []`, "a.yaml")).toThrow(/steps/);
  });
});

describe("parseSelectors", () => {
  it("parses name → target map", () => {
    const s = parseSelectors(`ok:\n  css: ".x"\n  description: d`, "s.yaml");
    expect(s.ok).toEqual({ css: ".x", description: "d" });
  });
  it("rejects unknown target fields and non-object values", () => {
    expect(() => parseSelectors(`bad:\n  href: "/x"`, "s.yaml")).toThrow(/unknown target field/);
    expect(() => parseSelectors(`bad: ".css-string"`, "s.yaml")).toThrow(/target object/);
  });
});

describe("discoverReuseAssets", () => {
  it("picks the nearest _selectors.yaml and keeps walking up for fragments", () => {
    const assets = discoverReuseAssets(join(FIX, "area", "deep", "dummy.yaml"));
    expect(assets.selectors.toast_success).toEqual({ css: ".area-toast", description: "area override" });
    expect(assets.fragments.get("login")?.params).toEqual({ account: "tester" });
  });
  it("returns empty assets when nothing is found", () => {
    const assets = discoverReuseAssets(join(__dirname, "no-assets-here.yaml"));
    expect(assets.fragments.size).toBe(0);
    // 주의: 이 경로 상위에 _selectors.yaml 이 없는 위치인지 확인 후 단언
  });
});
```

(`__dirname`은 vitest ESM 환경에서 지원됨 — 기존 테스트가 다른 방식이면 그 방식을 따른다.)

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/scenario/reuseAssets.test.ts` / Expected: 모듈 없음 FAIL.

- [ ] **Step 4: 구현**

```ts
// src/scenario/reuseAssets.ts
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Target } from "./types.js";

export interface Fragment { id: string; params: Record<string, string | null>; steps: unknown[]; }
export interface ReuseAssets { fragments: Map<string, Fragment>; selectors: Record<string, Target>; }

const NAME_RE = /^[A-Za-z0-9_-]+$/;
const YAML_RE = /\.ya?ml$/i;
const TARGET_KEYS = ["css", "placeholder", "label", "text", "role", "description"];

export function parseFragment(yamlText: string, sourcePath: string): Fragment {
  const raw = parseYaml(yamlText) as any;
  if (!raw || typeof raw !== "object") throw new Error(`${sourcePath}: empty fragment document`);
  if (typeof raw.id !== "string" || !NAME_RE.test(raw.id))
    throw new Error(`${sourcePath}: fragment 'id' is required and must match [A-Za-z0-9_-]+`);
  const params: Record<string, string | null> = {};
  if (raw.params !== undefined) {
    if (!raw.params || typeof raw.params !== "object" || Array.isArray(raw.params))
      throw new Error(`${sourcePath}: 'params' must be a map (name → default; empty = required)`);
    for (const [k, v] of Object.entries(raw.params)) {
      if (!NAME_RE.test(k)) throw new Error(`${sourcePath}: param name '${k}' must match [A-Za-z0-9_-]+`);
      if (v !== null && typeof v !== "string")
        throw new Error(`${sourcePath}: param '${k}' default must be a string, or empty for required`);
      params[k] = v as string | null;
    }
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0)
    throw new Error(`${sourcePath}: fragment 'steps' must be a non-empty list`);
  raw.steps.forEach((st: any, i: number) => {
    if (st && typeof st === "object" && "use" in st)
      throw new Error(`${sourcePath}: steps[${i}]: fragments cannot nest other fragments ('use' is not allowed here)`);
  });
  return { id: raw.id, params, steps: raw.steps };
}

export function parseSelectors(yamlText: string, sourcePath: string): Record<string, Target> {
  const raw = parseYaml(yamlText) as any;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${sourcePath}: _selectors.yaml must be a map of name → target`);
  const out: Record<string, Target> = {};
  for (const [name, val] of Object.entries(raw)) {
    if (!NAME_RE.test(name)) throw new Error(`${sourcePath}: selector name '${name}' must match [A-Za-z0-9_-]+`);
    if (!val || typeof val !== "object" || Array.isArray(val))
      throw new Error(`${sourcePath}: selector '${name}' must be a target object (css/text/role/...)`);
    const target: Record<string, string> = {};
    for (const [k, v] of Object.entries(val as object)) {
      if (!TARGET_KEYS.includes(k)) throw new Error(`${sourcePath}: selector '${name}' has unknown target field '${k}'`);
      if (typeof v !== "string") throw new Error(`${sourcePath}: selector '${name}.${k}' must be a string`);
      target[k] = v;
    }
    if (Object.keys(target).length === 0) throw new Error(`${sourcePath}: selector '${name}' is empty`);
    out[name] = target as Target;
  }
  return out;
}

// Nearest-ancestor lookup: from the scenario's directory upward, take the FIRST
// _fragments/ dir and the FIRST _selectors.yaml found (independently), stop at fs root.
export function discoverReuseAssets(scenarioFile: string): ReuseAssets {
  let fragments: Map<string, Fragment> | undefined;
  let selectors: Record<string, Target> | undefined;
  let dir = dirname(resolve(scenarioFile));
  for (;;) {
    if (!fragments) {
      const fragDir = join(dir, "_fragments");
      if (existsSync(fragDir) && statSync(fragDir).isDirectory()) {
        fragments = new Map();
        for (const f of readdirSync(fragDir).filter((n) => YAML_RE.test(n)).sort()) {
          const p = join(fragDir, f);
          const frag = parseFragment(readFileSync(p, "utf8"), p);
          if (fragments.has(frag.id)) throw new Error(`${p}: duplicate fragment id '${frag.id}'`);
          fragments.set(frag.id, frag);
        }
      }
    }
    if (!selectors) {
      const selFile = join(dir, "_selectors.yaml");
      if (existsSync(selFile)) selectors = parseSelectors(readFileSync(selFile, "utf8"), selFile);
    }
    const parent = dirname(dir);
    if ((fragments && selectors) || parent === dir) break;
    dir = parent;
  }
  return { fragments: fragments ?? new Map(), selectors: selectors ?? {} };
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/scenario/reuseAssets.test.ts` / Expected: PASS.

- [ ] **Step 6: 커밋** — `git add src/scenario/reuseAssets.ts tests/scenario/reuseAssets.test.ts tests/fixtures && git commit -m "feat(scenario): reuse assets — fragments + selector aliases, nearest-ancestor discovery"`

---

### Task 5: expandScenario — 확장 파이프라인 (순수 함수)

**Files:**
- Create: `src/scenario/expandScenario.ts`
- Test: `tests/scenario/expandScenario.test.ts`

**Interfaces:**
- Consumes: `ReuseAssets`, `Fragment` (Task 4).
- Produces: `expandRawScenario(rawIn: unknown, ctx: ExpandContext): any` — raw 객체를 받아 steps가 완전히 펼쳐진 raw 객체 반환 (Scenario 검증은 하지 않음 — Task 3의 parseScenarioObject 몫). `interface ExpandContext { assets: ReuseAssets; vars: Record<string, string>; source: string }`.
- 파이프라인 순서(스펙 §4): login_as → use 확장({{param}}) → ref 병합 → ${vars.*}(url·value) → 잔여 `{{...}}` 검출.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/scenario/expandScenario.test.ts
import { describe, it, expect } from "vitest";
import { expandRawScenario } from "../../src/scenario/expandScenario.js";
import type { ReuseAssets } from "../../src/scenario/reuseAssets.js";

function assets(over: Partial<ReuseAssets> = {}): ReuseAssets {
  return {
    fragments: new Map([["login", {
      id: "login",
      params: { account: "tester" },
      steps: [
        { action: "navigate", url: "/" },
        { action: "fill", target: { css: "#u" }, value: "${secrets.{{account}}.username}" },
      ],
    }]]),
    selectors: { toast: { css: ".p-toast", description: "toast" } },
    ...over,
  };
}
const ctx = (vars: Record<string, string> = {}) => ({ assets: assets(), vars, source: "t.yaml" });
const nav = { action: "navigate", url: "/x" };

describe("fragment expansion", () => {
  it("expands short-form use with param defaults", () => {
    const out = expandRawScenario({ id: "s", title: "t", steps: [{ use: "login" }, nav] }, ctx());
    expect(out.steps).toHaveLength(3);
    expect(out.steps[1].value).toBe("${secrets.tester.username}");
  });
  it("expands long-form use with `with` overriding defaults", () => {
    const out = expandRawScenario({ id: "s", title: "t", steps: [{ use: "login", with: { account: "gduser" } }] }, ctx());
    expect(out.steps[1].value).toBe("${secrets.gduser.username}");
  });
  it("login_as prepends a login fragment call", () => {
    const out = expandRawScenario({ id: "s", title: "t", login_as: "gduser", steps: [nav] }, ctx());
    expect(out.steps[0]).toEqual({ action: "navigate", url: "/" });
    expect(out.steps[1].value).toBe("${secrets.gduser.username}");
    expect(out.steps[2]).toEqual(nav);
  });
  it("errors on unknown fragment / undeclared with-param / missing required param", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "nope" }] }, ctx()))
      .toThrow(/fragment 'nope' not found/);
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "login", with: { bogus: "x" } }] }, ctx()))
      .toThrow(/no param 'bogus'/);
    const a = assets();
    a.fragments.get("login")!.params = { account: null };
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "login" }] }, { assets: a, vars: {}, source: "t.yaml" }))
      .toThrow(/requires param 'account'/);
  });
});

describe("selector refs", () => {
  it("merges alias into target with local fields winning", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "click", target: { ref: "toast", description: "local" } }] }, ctx());
    expect(out.steps[0].target).toEqual({ css: ".p-toast", description: "local" });
  });
  it("errors on unknown ref", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ action: "click", target: { ref: "nope" } }] }, ctx()))
      .toThrow(/selector ref 'nope' not found/);
  });
});

describe("vars", () => {
  it("substitutes ${vars.*} in url and value", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "navigate", url: "${vars.doc_url}" }] }, ctx({ doc_url: "/main/d?id=1" }));
    expect(out.steps[0].url).toBe("/main/d?id=1");
  });
  it("errors on undefined var", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ action: "navigate", url: "${vars.nope}" }] }, ctx()))
      .toThrow(/var 'nope' not defined/);
  });
});

describe("stray {{...}}", () => {
  it("errors when {{param}} appears outside a fragment", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ action: "fill", target: { css: "#u" }, value: "{{oops}}" }] }, ctx()))
      .toThrow(/only valid inside/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/scenario/expandScenario.test.ts` / Expected: 모듈 없음 FAIL.

- [ ] **Step 3: 구현**

```ts
// src/scenario/expandScenario.ts
import type { ReuseAssets } from "./reuseAssets.js";

export interface ExpandContext { assets: ReuseAssets; vars: Record<string, string>; source: string; }

const PARAM_RE = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;
const VAR_RE = /\$\{vars\.([A-Za-z0-9_.-]+)\}/g;

function deepMapStrings(node: unknown, fn: (s: string) => string): unknown {
  if (typeof node === "string") return fn(node);
  if (Array.isArray(node)) return node.map((n) => deepMapStrings(n, fn));
  if (node && typeof node === "object")
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deepMapStrings(v, fn)]));
  return node;
}

function expandUse(step: any, i: number, ctx: ExpandContext): unknown[] {
  if (typeof step.use !== "string")
    throw new Error(`${ctx.source}: steps[${i}]: 'use' must be a fragment name string`);
  const frag = ctx.assets.fragments.get(step.use);
  if (!frag)
    throw new Error(`${ctx.source}: steps[${i}]: fragment '${step.use}' not found (searched _fragments/ upward from the scenario)`);
  const withArgs = (step.with ?? {}) as Record<string, unknown>;
  if (typeof withArgs !== "object" || Array.isArray(withArgs))
    throw new Error(`${ctx.source}: steps[${i}]: 'with' must be a map`);
  for (const [k, v] of Object.entries(withArgs)) {
    if (!(k in frag.params))
      throw new Error(`${ctx.source}: steps[${i}]: fragment '${frag.id}' has no param '${k}'`);
    if (typeof v !== "string")
      throw new Error(`${ctx.source}: steps[${i}]: param '${k}' must be a string`);
  }
  const values: Record<string, string> = {};
  for (const [k, def] of Object.entries(frag.params)) {
    const v = (withArgs[k] as string | undefined) ?? def;
    if (v === null || v === undefined)
      throw new Error(`${ctx.source}: steps[${i}]: fragment '${frag.id}' requires param '${k}'`);
    values[k] = v;
  }
  return frag.steps.map((s) =>
    deepMapStrings(s, (str) =>
      str.replace(PARAM_RE, (_m, p: string) => {
        if (!(p in values))
          throw new Error(`fragment '${frag.id}': unknown param '{{${p}}}' — declare it under 'params'`);
        return values[p];
      })
    )
  );
}

function resolveRef(target: any, i: number, ctx: ExpandContext): any {
  if (!target || typeof target !== "object" || !("ref" in target)) return target;
  const { ref, ...local } = target;
  const alias = ctx.assets.selectors[ref];
  if (!alias)
    throw new Error(`${ctx.source}: steps[${i}]: selector ref '${ref}' not found in _selectors.yaml`);
  return { ...alias, ...local };
}

// Parse-time pipeline (spec §4): login_as → use/{{param}} → ref merge → ${vars.*} → stray {{}} check.
// Returns a raw object with fully expanded steps; schema validation stays in parseScenarioObject.
export function expandRawScenario(rawIn: unknown, ctx: ExpandContext): any {
  const raw = rawIn && typeof rawIn === "object" ? { ...(rawIn as any) } : rawIn;
  if (!raw || !Array.isArray(raw.steps)) return raw;
  let steps: any[] = raw.steps;
  if (typeof raw.login_as === "string")
    steps = [{ use: "login", with: { account: raw.login_as } }, ...steps];
  steps = steps.flatMap((st, i) =>
    st && typeof st === "object" && "use" in st ? expandUse(st, i, ctx) : [st]);
  steps = steps.map((st, i) =>
    st && typeof st === "object" && "target" in st ? { ...st, target: resolveRef(st.target, i, ctx) } : st);
  steps = steps.map((st, i) => {
    if (!st || typeof st !== "object") return st;
    const subst = (s: unknown) =>
      typeof s === "string"
        ? s.replace(VAR_RE, (_m, name: string) => {
            const v = ctx.vars[name];
            if (v === undefined)
              throw new Error(`${ctx.source}: steps[${i}]: var '${name}' not defined (add it to the config 'vars' section)`);
            return v;
          })
        : s;
    const out = { ...st };
    if (out.url !== undefined) out.url = subst(out.url);
    if (out.value !== undefined) out.value = subst(out.value);
    return out;
  });
  deepMapStrings(steps, (s) => {
    const m = s.match(PARAM_RE);
    if (m)
      throw new Error(`${ctx.source}: unresolved '${m[0]}' — {{param}} is only valid inside _fragments/ steps`);
    return s;
  });
  return { ...raw, steps };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/scenario/expandScenario.test.ts` / Expected: PASS.

- [ ] **Step 5: 커밋** — `git add src/scenario/expandScenario.ts tests/scenario/expandScenario.test.ts && git commit -m "feat(scenario): parse-time expansion pipeline (use/{{param}}/login_as/ref/vars)"`

---

### Task 6: loadScenario + tags 필터 + cli run 배선

**Files:**
- Create: `src/scenario/loadScenario.ts`, `src/scenario/tags.ts`
- Modify: `src/cli.ts` (run 명령)
- Test: `tests/scenario/loadScenario.test.ts`, `tests/scenario/tags.test.ts`

**Interfaces:**
- Produces:
  - `loadScenario(filePath: string, vars?: Record<string, string>): Scenario` — read → parseYaml → discoverReuseAssets → expandRawScenario → parseScenarioObject.
  - `parseTagFilter(csv?: string): string[]`, `matchesTagFilter(tags: string[] | undefined, filter: string[]): boolean` (빈 필터 → 항상 true, 아니면 OR).
- Consumes: Task 1~5 전부.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/scenario/tags.test.ts
import { describe, it, expect } from "vitest";
import { parseTagFilter, matchesTagFilter } from "../../src/scenario/tags.js";

describe("tag filter", () => {
  it("parses csv, trimming and dropping empties", () => {
    expect(parseTagFilter(" smoke, letter ,")).toEqual(["smoke", "letter"]);
    expect(parseTagFilter(undefined)).toEqual([]);
  });
  it("empty filter matches everything; otherwise OR over scenario tags", () => {
    expect(matchesTagFilter(undefined, [])).toBe(true);
    expect(matchesTagFilter(["a"], ["a", "b"])).toBe(true);
    expect(matchesTagFilter(["c"], ["a", "b"])).toBe(false);
    expect(matchesTagFilter(undefined, ["a"])).toBe(false);
  });
});
```

```ts
// tests/scenario/loadScenario.test.ts — Task 4 픽스처 재사용
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadScenario } from "../../src/scenario/loadScenario.js";

const FIX = join(__dirname, "..", "fixtures", "reuse");

describe("loadScenario", () => {
  it("loads, discovers assets upward, expands, and validates", () => {
    // 픽스처에 login_as 시나리오 추가
    mkdirSync(join(FIX, "area", "deep"), { recursive: true });
    const p = join(FIX, "area", "deep", "with-login.yaml");
    writeFileSync(p, [
      "id: with-login",
      "title: fixture",
      "login_as: gduser",
      "tags: [smoke]",
      "steps:",
      '  - { action: navigate, url: "/x" }',
    ].join("\n"));
    const sc = loadScenario(p);
    expect(sc.steps).toHaveLength(3);            // login fragment 2 + own 1
    expect((sc.steps[1] as any).value).toBe("${secrets.gduser.username}");
    expect(sc.tags).toEqual(["smoke"]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/scenario/tags.test.ts tests/scenario/loadScenario.test.ts` / Expected: 모듈 없음 FAIL.

- [ ] **Step 3: 구현**

```ts
// src/scenario/tags.ts
export function parseTagFilter(csv?: string): string[] {
  return (csv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Empty filter matches everything; otherwise OR over the scenario's tags.
export function matchesTagFilter(tags: string[] | undefined, filter: string[]): boolean {
  if (filter.length === 0) return true;
  return (tags ?? []).some((t) => filter.includes(t));
}
```

```ts
// src/scenario/loadScenario.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Scenario } from "./types.js";
import { parseScenarioObject } from "./parseScenario.js";
import { discoverReuseAssets } from "./reuseAssets.js";
import { expandRawScenario } from "./expandScenario.js";

// File → nearest reuse assets → parse-time expansion → validated Scenario.
export function loadScenario(filePath: string, vars: Record<string, string> = {}): Scenario {
  const p = resolve(filePath);
  const raw = parseYaml(readFileSync(p, "utf8"));
  const expanded = expandRawScenario(raw, { assets: discoverReuseAssets(p), vars, source: filePath });
  return parseScenarioObject(expanded);
}
```

`src/cli.ts` run 명령 수정:
- import 교체: `parseScenario` → `loadScenario`, `parseTagFilter`/`matchesTagFilter` 추가. (`parseScenario` import와 `readFileSync` 사용처가 run에서 사라짐 — document-guide 쪽 사용은 유지.)
- 옵션 추가: `.option("--tag <tags>", "run only scenarios carrying at least one of these comma-separated tags")`
- 본문 교체:

```ts
      const files = expandScenarioPaths(scenarioPaths);
      const all = files.map((f) => loadScenario(f, config.vars));
      const tagFilter = parseTagFilter(opts.tag);
      const scenarios = all.filter((s) => matchesTagFilter(s.tags, tagFilter));
      if (scenarios.length === 0) {
        console.error(`no scenarios match --tag '${opts.tag}'`);
        process.exit(2);
      }
```

(opts 타입에 `tag?: string` 추가.)

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/scenario` 후 `npm test` / Expected: 전부 PASS. `npm run build`로 타입 확인.

- [ ] **Step 5: 수동 스모크** — `run`은 executor를 실제 스폰하므로 실행하지 않는다. 대신 파스 경로만 확인: 스크래치패드에 `check.ts` 작성 후 실행 (`require`는 ESM 패키지라 불가 — tsx 사용):

```ts
// <scratchpad>/check.ts
import { loadScenario } from "C:/workspace/testMcp/src/scenario/loadScenario.js";
console.log(loadScenario("C:/workspace/testMcp/scenarios/letter/inbox-hide-toggle.yaml").steps.length);
```

Run: `npx tsx <scratchpad>/check.ts` / Expected: `36` (기존 스텝 수 그대로 — 아직 fragment 미사용).

- [ ] **Step 6: 커밋** — `git add src/scenario/loadScenario.ts src/scenario/tags.ts src/cli.ts tests/scenario/tags.test.ts tests/scenario/loadScenario.test.ts tests/fixtures && git commit -m "feat(cli): run uses parse-time expansion; --tag filter"`

---

### Task 7: validate 명령

**Files:**
- Create: `src/validate.ts`
- Modify: `src/cli.ts` (validate 명령 추가, `[확장5]` 주석 갱신)
- Test: `tests/validate.test.ts`

**Interfaces:**
- Produces: `interface ValidationReport { file: string; ok: boolean; error?: string; steps?: number; scenario?: Scenario }`, `validateScenarioFiles(files: string[], vars: Record<string, string>): ValidationReport[]`.
- CLI: `tester-mcp validate <scenarios...> [-c config] [--expand]` — exit 0(전부 유효)/1(에러 존재)/2(자체 오류). config 파일이 없으면 vars 빈 맵으로 진행하며 stderr에 note 출력.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/validate.test.ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { validateScenarioFiles } from "../src/validate.js";

describe("validateScenarioFiles", () => {
  it("reports ok with step count for a valid scenario", () => {
    const dir = mkdtempSync(join(tmpdir(), "val-"));
    const p = join(dir, "ok.yaml");
    writeFileSync(p, `id: ok\ntitle: t\nsteps:\n  - { action: navigate, url: "/" }`);
    const [r] = validateScenarioFiles([p], {});
    expect(r).toMatchObject({ file: p, ok: true, steps: 1 });
  });
  it("reports the expansion error message for a broken scenario", () => {
    const dir = mkdtempSync(join(tmpdir(), "val-"));
    const p = join(dir, "bad.yaml");
    writeFileSync(p, `id: bad\ntitle: t\nsteps:\n  - use: nope`);
    const [r] = validateScenarioFiles([p], {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/fragment 'nope' not found/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/validate.test.ts` / Expected: 모듈 없음 FAIL.

- [ ] **Step 3: 구현**

```ts
// src/validate.ts
import type { Scenario } from "./scenario/types.js";
import { loadScenario } from "./scenario/loadScenario.js";

export interface ValidationReport {
  file: string;
  ok: boolean;
  error?: string;
  steps?: number;
  scenario?: Scenario;
}

export function validateScenarioFiles(files: string[], vars: Record<string, string>): ValidationReport[] {
  return files.map((file) => {
    try {
      const scenario = loadScenario(file, vars);
      return { file, ok: true, steps: scenario.steps.length, scenario };
    } catch (err) {
      return { file, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
```

`src/cli.ts`에 명령 추가 (run 명령 아래; `stringify as stringifyYaml`를 yaml에서 import, `existsSync`는 이미 import됨):

```ts
program
  .command("validate")
  .description("Parse + expand scenarios (fragments/refs/vars) without spawning an executor")
  .argument("<scenarios...>", "scenario YAML path(s) (files or directories)")
  .option("-c, --config <path>", "config file (for 'vars'; if the file is absent, vars are empty)", "tester-mcp.config.yaml")
  .option("--expand", "print each valid scenario's fully expanded steps as YAML")
  .action((scenarioPaths: string[], opts: { config: string; expand?: boolean }) => {
    try {
      let vars: Record<string, string> = {};
      const cfgPath = resolve(opts.config);
      if (existsSync(cfgPath)) vars = loadConfig(cfgPath).vars;
      else console.error(`note: config not found (${opts.config}) — vars treated as empty`);
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
```

`[확장5]` 주석을 `// [확장5] add report/diff commands here.`로 갱신.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/validate.test.ts && npm run build` / Expected: PASS + 빌드 성공.

- [ ] **Step 5: 수동 확인** — Run: `npx tsx src/cli.ts validate scenarios/letter -c tester-mcp.config.yaml` / Expected: 각 파일 `OK ... (steps: N)` + `N/N valid`, exit 0.

- [ ] **Step 6: 커밋** — `git add src/validate.ts src/cli.ts tests/validate.test.ts && git commit -m "feat(cli): validate command — zero-token parse+expand check"`

---

### Task 8: document-guide + SKILL.md 갱신

**Files:**
- Modify: `skills/tester-mcp/document-guide.md` (DSL 필드 목록 + 신규 Reuse 섹션)
- Modify: `skills/tester-mcp/SKILL.md` (워크플로우 개정)

**Interfaces:** 없음 (문서). 모든 추가 텍스트 영어, 간결하게 (가이드는 매 저작 세션의 AI 입력 토큰).

- [ ] **Step 1: document-guide.md 갱신** — 필드 목록의 `login_as` 줄을 다음으로 교체:

```md
- `login_as` (string, optional) — sugar for `- { use: login, with: { account: <value> } }`
  prepended to `steps`; requires a `login` fragment with an `account` param in `_fragments/`.
- `tags` (list of strings, optional) — suite labels; `run --tag a,b` keeps scenarios
  carrying at least one (OR).
```

Actions 섹션 뒤에 신규 섹션 추가:

```md
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
```

- [ ] **Step 2: SKILL.md 워크플로우 개정** — `## Workflow (document first)`의 1·2단계를 다음으로 교체 (3단계 결과 분기 유지):

```md
1. **Check reuse assets first** — read `scenarios/<project>/_selectors.yaml` and `_fragments/`
   BEFORE grepping the app source; reuse an alias/fragment whenever it fits. Resolve NEW
   selectors from the Vue/PrimeVue source, and register any selector likely to recur (≥2
   scenarios) in `_selectors.yaml`. Sequences repeated across ≥3 scenarios become fragments.
2. **Write the scenario** — `scenarios/<project>/<area>/<id>.yaml`. Start with `login_as:` when
   the flow needs a login. **Resolve a stable `css` or `role` selector from the Vue/PrimeVue
   source and put it in the `target`** — don't rely on the executor to find elements by natural
   language (it tries once, then bails NOT_TESTED). `description`/`text` are last-resort
   fallbacks. Pin the language with `locale:`, reference secrets as `${secrets...}`. Full
   schema: `tester-mcp document-guide`.
3. **Validate, then run** — `tester-mcp validate <paths> -c <config>` (fix unknown
   fragment/ref/var and stray `{{...}}` errors — this costs no executor run), then
   `tester-mcp run <scenarios...> -c <config>` (add `--tag <a,b>` for suites). (이하 기존 병렬 실행 문단 유지)
```

- [ ] **Step 3: 검증** — `npx tsx src/cli.ts document-guide | grep -n "Reuse"` 로 가이드 출력에 섹션 포함 확인 (loadGuide가 파일을 읽는 위치 확인 — dist 기준이면 `npm run build` 후 확인).

- [ ] **Step 4: 커밋** — `git add skills/ && git commit -m "docs(skill): reuse workflow — selector cache first, validate before run"`

---

### Task 9: 마이그레이션 A — 폴더 재편 + login fragment + 26개 login_as 전환

**Files:**
- Move: `scenarios/{auth,billLink,billMng,billRegWait,letter,workRequest}` → `scenarios/ebill/<same>` (현재 **untracked** — `mv` 후 `git add`)
- Create: `scenarios/ebill/_fragments/login.yaml`
- Modify: 시나리오 26개 (로그인 5스텝 블록 → `login_as:`)
- Create(scratch): 코드모드 스크립트 (스크래치패드에, 커밋 안 함)

**Interfaces:**
- Consumes: `loadScenario`/`validate` (Task 6·7).
- Produces: `scenarios/ebill/` 트리 — 이후 태스크와 실사용의 기준 경로. login fragment id는 `login`, param은 `account`.

- [ ] **Step 1: 이동** — `mkdir scenarios/ebill && mv scenarios/auth scenarios/billLink scenarios/billMng scenarios/billRegWait scenarios/letter scenarios/workRequest scenarios/ebill/` (bash). `scenariosexternal/`은 건드리지 않음.

- [ ] **Step 2: login fragment 작성** — `scenarios/ebill/_fragments/login.yaml` (스텝 내용은 기존 시나리오의 로그인 블록 **verbatim** — 한국어 description 유지):

```yaml
id: login
params:
  account: tester
steps:
  - { action: navigate, url: "/" }
  - { action: fill, target: { css: "#userId", placeholder: "ИНН" }, value: "${secrets.{{account}}.username}" }
  - { action: fill, target: { css: "#pswd", placeholder: "Ваш пароль" }, value: "${secrets.{{account}}.password}" }
  - { action: click, target: { css: ".btn_login", role: "button", description: "로그인 버튼" } }
  - { action: wait_for, target: { css: ".search_form input", description: "로그인 후 헤더 검색창" } }
```

- [ ] **Step 3: 확장 결과 베이스라인 채집(전환 전)** — Run: `npx tsx src/cli.ts validate scenarios/ebill -c tester-mcp.config.yaml --expand > <scratchpad>/before-login.txt` / Expected: `26/26 valid` (아직 전원 인라인 로그인이므로 fragment 미사용). 이 파일이 전환 무손실 검증의 기준이 된다.

- [ ] **Step 4: 코드모드 작성·실행** — 스크래치패드에 `rewrite-login.cjs` 작성. 텍스트 수술(포맷 보존): 5줄 로그인 블록을 verbatim 정규식으로 찾고, 계정명을 캡처해 제거한 뒤 `locale:` 줄 다음에 `login_as: <account>` 삽입. 매치 0회/2회 이상 파일은 SKIP으로 보고.

```js
// rewrite-login.cjs — usage: node rewrite-login.cjs <file...>
const fs = require("fs");
const LOGIN_RE = new RegExp(
  '  - \\{ action: navigate, url: "/" \\}\\r?\\n' +
  '  - \\{ action: fill, target: \\{ css: "#userId", placeholder: "ИНН" \\}, value: "\\$\\{secrets\\.(\\w+)\\.username\\}" \\}\\r?\\n' +
  '  - \\{ action: fill, target: \\{ css: "#pswd", placeholder: "Ваш пароль" \\}, value: "\\$\\{secrets\\.\\w+\\.password\\}" \\}\\r?\\n' +
  '  - \\{ action: click, target: \\{ css: "\\.btn_login", role: "button", description: "로그인 버튼" \\} \\}\\r?\\n' +
  '  - \\{ action: wait_for, target: \\{ css: "\\.search_form input", description: "로그인 후 헤더 검색창" \\} \\}\\r?\\n'
);
for (const f of process.argv.slice(2)) {
  const orig = fs.readFileSync(f, "utf8");
  const m = orig.match(LOGIN_RE);
  if (!m) { console.log("SKIP (no verbatim login block):", f); continue; }
  let text = orig.replace(LOGIN_RE, "");
  if (LOGIN_RE.test(text)) { console.log("SKIP (second login block):", f); continue; }
  if (!/^locale: /m.test(text)) { console.log("SKIP (no locale line):", f); continue; }
  text = text.replace(/^(locale: .*)$/m, `$1\nlogin_as: ${m[1]}`);
  fs.writeFileSync(f, text);
  console.log("OK", m[1], f);
}
```

Run: `node <scratchpad>/rewrite-login.cjs scenarios/ebill/*/*.yaml` (bash 글롭) / Expected: OK 26건 (SKIP 발생 시 해당 파일을 Read로 직접 확인해 수동 전환하거나 사유 보고).

- [ ] **Step 5: 무손실 검증** — Run: `npx tsx src/cli.ts validate scenarios/ebill -c tester-mcp.config.yaml --expand > <scratchpad>/after-login.txt && diff <scratchpad>/before-login.txt <scratchpad>/after-login.txt` / Expected: **diff 출력 없음** (확장 결과가 전환 전과 바이트 단위 동일). 다르면 해당 파일 원인 규명 후 수정 — 동일해질 때까지 커밋 금지.

- [ ] **Step 6: 샘플 직접 확인** — 전환된 파일 2개(예: `scenarios/ebill/letter/inbox-hide-toggle.yaml`, `scenarios/ebill/billRegWait/02-receive-cancel.yaml`)를 Read로 열어 `login_as` 삽입 위치·잔여 로그인 스텝 없음을 눈으로 확인 (CLAUDE.local.md 검증 규칙).

- [ ] **Step 7: 커밋** — `git add scenarios/ && git commit -m "refactor(scenarios): move under scenarios/ebill; extract login fragment (26 files → login_as)"`

---

### Task 10: 마이그레이션 B — _selectors.yaml + vars + 진입 체인 fragment + 회귀 테스트

**Files:**
- Create: `scenarios/ebill/_selectors.yaml`
- Modify: `tester-mcp.config.yaml`, `tester-mcp.config.feature.yaml` (vars 추가; 최초 커밋)
- Modify: 중복 셀렉터·URL 사용 시나리오들
- Create: `scenarios/ebill/_fragments/open-ext-receive-first.yaml`
- Test: `tests/scenario/loadScenario.ebill.test.ts`

**Interfaces:**
- Consumes: Task 9의 `scenarios/ebill/` 트리.
- Produces: 실사용 자산 3종 + 마이그레이션 회귀 테스트.

- [ ] **Step 1: 베이스라인 채집** — Run: `npx tsx src/cli.ts validate scenarios/ebill -c tester-mcp.config.yaml --expand > <scratchpad>/before-b.txt` / Expected: 26/26 valid.

- [ ] **Step 2: _selectors.yaml 작성** — 분석에서 3회 이상 중복 확인된 별칭:

```yaml
# scenarios/ebill/_selectors.yaml — verified selector cache. Check here before grepping the app source.
confirm_popup:
  css: ".p-confirmpopup"
confirm_accept:
  css: '.p-confirmpopup [data-pc-section="acceptbutton"]'
toast_success:
  css: ".p-toast-message-success"
datatable:
  css: ".v_table.table_list .p-datatable"
datatable_row:
  css: ".p-datatable-tbody > tr"
list_item:
  css: ".lists .list"
list_item_first:
  css: ".lists .list:first-child"
btn_outline_md:
  css: "button.v_btn.btn_outline_primary.btn_md"
btn_primary_md:
  css: "button.v_btn.btn_primary.btn_md"
dialog_textarea:
  css: ".dialog_main_area textarea.form_control.full"
```

- [ ] **Step 3: ref 전환 코드모드** — 스크래치패드 스크립트로 `css: "<셀렉터>"` → `ref: <별칭>` 텍스트 치환 (별칭 표를 정확한 원문 문자열로 매핑; `confirm_accept`는 이스케이프된 쌍따옴표 원문 `css: ".p-confirmpopup [data-pc-section=\"acceptbutton\"]"` 형태로 매치). target 내 다른 필드(text/description)는 그대로 남아 로컬 오버라이드가 된다. 실행 후 grep으로 잔여 원문 셀렉터 0건 확인: `grep -rn "p-confirmpopup \[data" scenarios/ebill --include="*.yaml"` → `_selectors.yaml`만.

- [ ] **Step 4: vars 추출** — 두 config에 추가(값 동일, feature에는 주석):

```yaml
vars:
  billmng_cmt_doc_a: "/main/billMng/gdMng/billMngCmt/Dtl?id=EB_8eb5a0fd-372e-471f-b876-c74c9e450177&taskId=13173"
  billmng_cmt_doc_b: "/main/billMng/gdMng/billMngCmt/Dtl?id=EB_8067fc85-2385-473d-9efa-b7991bfafc22&taskId=13300"
```

(feature 쪽 주석: `# environment-specific record ids — replace with this environment's data`.)
해당 URL을 쓰는 4개 파일(`billLink/referral-empty-executor-warn`, `billLink/referral-request-success`, `workRequest/p2a-referral-main-designate-save`, `workRequest/p2a-referral-main-star-toggle`)에서 `url:` 값을 `${vars.billmng_cmt_doc_a}`/`_b`로 교체 (파일별 원래 URL과 짝 맞춤 — grep으로 확인).

- [ ] **Step 5: 진입 체인 fragment (고신뢰 3스텝만)** — `scenarios/ebill/_fragments/open-ext-receive-first.yaml`:

```yaml
id: open-ext-receive-first
steps:
  - { action: navigate, url: "/main/letter/external/receive" }
  - { action: wait_for, target: { ref: datatable_row, description: "외부 수신함 문서 목록 첫 행" } }
  - { action: click, target: { ref: datatable_row, description: "첫 번째 수신 문서 행 (단일 클릭 → 상세 진입, @row-click=fn_detail)" } }
```

주의: **fragment 안에서도 ref 사용 가능** — 확장 순서상 use가 먼저, ref 병합이 나중이므로 동작한다 (Task 5 파이프라인). `billRegWait/02~05` 4개 파일에서 이 3스텝과 **완전히 동일한**(description까지) 블록만 `- use: open-ext-receive-first`로 교체 — 다르면 SKIP하고 보고. 그 뒤의 버튼·confirm 스텝은 시나리오마다 의미가 달라 인라인 유지.

- [ ] **Step 6: 무손실 검증** — Run: Step 1과 동일한 명령으로 `<scratchpad>/after-b.txt` 생성 후 `diff before-b.txt after-b.txt` / Expected: **차이 없음** (ref·vars·fragment 전환은 확장 결과를 바꾸지 않아야 함 — 단, Step 5에서 description을 fragment 원문으로 통일했으므로 4개 파일에서 description 차이가 날 수 있음. 차이가 나면 각 diff 라인이 description 필드뿐인지 확인하고, css·action·url 차이가 하나라도 있으면 수정).

- [ ] **Step 7: 회귀 테스트 작성**

```ts
// tests/scenario/loadScenario.ebill.test.ts — guards the migrated ebill assets
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadScenario } from "../../src/scenario/loadScenario.js";
import { expandScenarioPaths } from "../../src/scenario/expandScenarioPaths.js";

const EBILL = join(__dirname, "..", "..", "scenarios", "ebill");

describe("ebill migrated scenarios", () => {
  it("all scenarios expand without errors (vars-free files)", () => {
    const vars = {
      billmng_cmt_doc_a: "/stub-a",
      billmng_cmt_doc_b: "/stub-b",
    };
    const files = expandScenarioPaths([EBILL]);
    expect(files.length).toBeGreaterThanOrEqual(26);
    for (const f of files) expect(() => loadScenario(f, vars)).not.toThrow();
  });
  it("login fragment expands at the head of a login_as scenario", () => {
    const sc = loadScenario(join(EBILL, "letter", "inbox-hide-toggle.yaml"));
    expect(sc.steps[0]).toEqual({ action: "navigate", url: "/" });
    expect((sc.steps[1] as any).value).toBe("${secrets.tester.username}");
    expect((sc.steps[3] as any).target.css).toBe(".btn_login");
    const used = JSON.stringify(sc.steps);
    expect(used).not.toContain("{{");
    expect(used).not.toContain('"ref"');
  });
});
```

- [ ] **Step 8: 전체 확인** — Run: `npm test && npm run build && npx tsx src/cli.ts validate scenarios/ebill -c tester-mcp.config.yaml` / Expected: 테스트 전부 PASS, `26/26 valid`.

- [ ] **Step 9: 커밋** — `git add scenarios/ tester-mcp.config.yaml tester-mcp.config.feature.yaml tests/scenario/loadScenario.ebill.test.ts && git commit -m "refactor(scenarios): selector aliases, vars for env-coupled urls, ext-receive fragment"`

- [ ] **Step 10 (선택 — 프론트엔드 기동 시에만): 실 브라우저 스모크** — `npx tsx src/cli.ts run scenarios/ebill/letter/inbox-hide-toggle.yaml -c tester-mcp.config.yaml` 1건으로 확장 경로의 실전 무결성 확인. 프론트엔드(localhost:5173)가 꺼져 있으면 건너뛰고 보고서에 "실 실행 미검증" 명시.

---

## Self-Review 결과

- **스펙 커버리지**: §3 저장구조(T1·T9), §4 파이프라인(T5), §5 fragment(T4·T5), §6 셀렉터(T4·T5·T10), §7 tags/vars(T2·T3·T6·T10), §8 validate(T7), §9 문서(T8), §10 마이그레이션(T9·T10), §11 테스트(각 태스크) — 전 항목 태스크 존재.
- **버전 릴리스(CHANGELOG/package.json 0.3.0)는 의도적 비포함** — 사용자가 릴리스 시점을 정하면 별도 커밋.
- **타입 일관성**: `Fragment`/`ReuseAssets`/`ExpandContext`/`ValidationReport` 시그니처가 태스크 간 동일함을 확인. `loadScenario(filePath, vars?)` 호출부(T6 cli, T7 validate, T10 테스트) 일치.
