# 파일 업로드 액션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시나리오 DSL에 `upload` 액션을 추가해, `_fixtures/`의 실제 파일을 file input에 올리고 파일 필수 화면(의견서 등록·톡돔·법률 등록 등)을 자동화한다.

**Architecture:** 픽스처 경로 해석은 전부 **파스타임**에 끝난다 — `discoverReuseAssets`가 `_fixtures/`를 nearest-ancestor로 찾고(`_fragments/`와 같은 루프), `expandRawScenario`가 `file:` 파일명을 절대경로로 치환하며 부재 시 executor 스폰 전에 실패한다. 실행 측은 `claude-in-chrome`의 `file_upload`를 쓰는데, 이 도구가 `Read` 권한에 게이트돼 있어 **upload 스텝이 있는 시나리오에서만** `Read`를 연다(스펙 §2 실측). 설계 근거: `docs/superpowers/specs/2026-08-12-upload-action-design.md`.

**Tech Stack:** TypeScript(ESM, import에 `.js` 접미사 필수), commander, yaml, vitest. 새 의존성 추가 금지.

## Global Constraints

- 도구 표면 텍스트(에러 메시지, CLI help, 가이드 추가분, validate 출력, SYSTEM_CONTRACT)는 **영어**. 새 코드의 주석·테스트 `it()` 설명도 영어. 대화·문서(md)만 한국어.
- 시나리오 YAML의 기존 한국어 `description`은 그대로 유지한다.
- `file:`는 **파일명만** 허용한다(경로 구분자 `/`·`\` 금지). 절대경로 허용 금지 — 머신 종속 시나리오 차단.
- `--add-dir`은 도입하지 않는다(실측상 불필요, 스펙 §2-2).
- 다중 파일(`files: [...]`)은 구현하지 않는다(YAGNI).
- Node >= 20. 테스트: `npx vitest run <파일>` (전체: `npm test`).
- 커밋은 태스크마다. 커밋 트레일러:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` +
  `Claude-Session: https://claude.ai/code/session_01ErTa9E2vrTLqmtRAhAcBWH`

## 선행 상태 (중요 — 읽고 시작할 것)

2026-08-12 실측 스파이크에서 **아래 5개는 이미 구현돼 있고 라이브 PASS로 검증됐다.** 다시 만들지 말 것:

| 파일 | 이미 들어간 것 |
|---|---|
| `src/scenario/types.ts` | `Step` 유니온의 `{ action: "upload"; target: Target; file: string }` |
| `src/scenario/actions.ts` | `RENDERERS.upload` |
| `src/run/buildPrompt.ts` | `SYSTEM_CONTRACT`의 `[Upload]` 블록 |
| `src/run/buildExecutorArgs.ts` | `allowRead` 옵션 + `denied` 배열 조립 |
| `src/run/runScenario.ts` | `hasUpload()` + `allowRead` 전달 |
| `scenarios/ebill/_fixtures/documentSample.pdf` | 픽스처 파일(89KB, 미커밋) |

**따라서 Task 1·2는 TDD가 아니라 회귀 테스트를 뒤에 붙이는 작업이다.** 테스트를 먼저 실행해 실패를 보는 단계가 없는 것이 정상이며, 다만 `actions.test.ts`는 **현재 실패 중**이다(액션 8개를 단언). Task 3·4는 미구현이므로 정상 TDD로 진행한다.

미구현: `_fixtures/` 탐색, 경로 해석·검증, 전 테스트, 문서.

## File Structure

```
src/scenario/reuseAssets.ts     # [수정] ReuseAssets.fixturesDir + _fixtures/ 탐색 (Task 3)
src/scenario/expandScenario.ts  # [수정] upload.file 검증 + 절대경로 치환 (Task 4)
tests/scenario/actions.test.ts       # [수정] 9개 액션 + upload 렌더러 (Task 1)
tests/run/buildPrompt.test.ts        # [수정] [Upload] 계약 (Task 1)
tests/run/buildExecutorArgs.test.ts  # [수정] allowRead (Task 2)
tests/run/runScenario.test.ts        # [수정] hasUpload (Task 2)
tests/scenario/reuseAssets.test.ts   # [수정] fixturesDir 탐색 (Task 3)
tests/scenario/expandScenario.test.ts# [수정] 경로 해석 4케이스 (Task 4)
skills/tester-mcp/document-guide.md  # [수정] 액션 목록 + _fixtures 규약 (Task 5)
scenarios/ebill/seed/README.md       # [수정] "업로드 불가" 제약 철회 (Task 5)
scenarios/ebill/seed/02-lgreview-complete.yaml # [수정] 실검증 (Task 6)
```

---

### Task 1: `upload` 액션 등록 회귀 테스트

**Files:**
- Test: `tests/scenario/actions.test.ts:15-19` (수정), `tests/run/buildPrompt.test.ts` (추가)

**Interfaces:**
- Consumes: `KNOWN_ACTIONS`, `renderStep` (`src/scenario/actions.ts` — 구현 완료), `SYSTEM_CONTRACT` (`src/run/buildPrompt.ts` — 구현 완료)
- Produces: 없음(테스트 전용)

- [ ] **Step 1: 현재 실패를 확인한다**

Run: `npx vitest run tests/scenario/actions.test.ts`
Expected: FAIL — `knows the eight screen actions`가 `upload`를 포함한 9개 배열을 받아 불일치.

- [ ] **Step 2: 액션 목록 단언을 9개로 갱신**

`tests/scenario/actions.test.ts`의 `it("knows the eight screen actions", ...)`을 통째로 교체:

```ts
  it("knows the nine screen actions", () => {
    expect([...KNOWN_ACTIONS].sort()).toEqual(
      ["assert_value", "assert_visible", "click", "double_click", "fill", "navigate", "screenshot", "upload", "wait_for"]
    );
  });
```

- [ ] **Step 3: upload 렌더러 테스트를 추가**

`tests/scenario/actions.test.ts`의 `renders double_click ...` 블록 **뒤에** 추가:

```ts
  it("renders upload with the parse-time resolved absolute path", () => {
    expect(renderStep({ action: "upload", target: { css: "input[type=file]" }, file: "C:\\fx\\doc.pdf" }))
      .toBe('Upload: [css input[type=file]] ← file "C:\\fx\\doc.pdf"');
  });
```

- [ ] **Step 4: SYSTEM_CONTRACT의 upload 계약 테스트를 추가**

`tests/run/buildPrompt.test.ts` 파일 끝의 마지막 `describe` 블록 안에 추가(파일에 `SYSTEM_CONTRACT` import가 없으면 상단 import에 추가):

```ts
  it("contracts upload: use file_upload, never click the input", () => {
    expect(SYSTEM_CONTRACT).toContain("[Upload]");
    expect(SYSTEM_CONTRACT).toContain("file_upload");
    expect(SYSTEM_CONTRACT).toContain("NEVER click a file input");
    expect(SYSTEM_CONTRACT).toContain("display:none");
  });
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/scenario/actions.test.ts tests/run/buildPrompt.test.ts`
Expected: PASS (전부)

- [ ] **Step 6: 커밋**

```bash
git add tests/scenario/actions.test.ts tests/run/buildPrompt.test.ts src/scenario/types.ts src/scenario/actions.ts src/run/buildPrompt.ts
git commit -m "test(dsl): upload 액션 등록·프롬프트 계약 회귀 테스트"
```

---

### Task 2: executor `Read` 권한 조건부 개방 테스트

**Files:**
- Test: `tests/run/buildExecutorArgs.test.ts` (추가), `tests/run/runScenario.test.ts` (추가)

**Interfaces:**
- Consumes: `buildExecutorArgs({ prompt, systemPrompt, model, effort?, allowRead? }): string[]`, `hasUpload(scenario: Scenario): boolean` (둘 다 구현 완료)
- Produces: 없음(테스트 전용)

- [ ] **Step 1: `allowRead` 테스트를 추가**

`tests/run/buildExecutorArgs.test.ts`의 마지막 `it` 블록 뒤에 추가:

```ts
  it("denies Read by default but opens it for upload scenarios (file_upload gates on it)", () => {
    const denied = (o: Parameters<typeof buildExecutorArgs>[0]) => {
      const a = buildExecutorArgs(o);
      return a[a.indexOf("--disallowedTools") + 1].split(",");
    };
    const base = { prompt: "P", systemPrompt: "S", model: "sonnet" };
    expect(denied(base)).toContain("Read");
    expect(denied({ ...base, allowRead: true })).not.toContain("Read");
    // every other wandering tool stays denied either way
    for (const t of ["Skill", "Task", "Bash", "Write", "Edit"])
      expect(denied({ ...base, allowRead: true })).toContain(t);
  });
```

- [ ] **Step 2: `hasUpload` 테스트를 추가**

`tests/run/runScenario.test.ts` 상단 import에 `hasUpload`를 더하고(`import { runScenario, notTestedReason, chromeDenialReason, hasUpload } from "../../src/run/runScenario.js";` 형태), 파일 끝에 추가:

```ts
describe("hasUpload", () => {
  it("is true only when a step uploads a file", () => {
    const base = { id: "s", title: "t", on_failure: "stop" as const };
    expect(hasUpload({ ...base, steps: [{ action: "navigate", url: "/" }] })).toBe(false);
    expect(hasUpload({
      ...base,
      steps: [{ action: "navigate", url: "/" }, { action: "upload", target: { css: "input" }, file: "C:\\fx\\d.pdf" }],
    })).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run tests/run/buildExecutorArgs.test.ts tests/run/runScenario.test.ts`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add tests/run/buildExecutorArgs.test.ts tests/run/runScenario.test.ts src/run/buildExecutorArgs.ts src/run/runScenario.ts
git commit -m "feat(run): upload 시나리오에만 Read 허용 — file_upload가 Read 권한에 게이트됨"
```

---

### Task 3: `_fixtures/` nearest-ancestor 탐색

**Files:**
- Modify: `src/scenario/reuseAssets.ts:12-15` (인터페이스), `:69-95` (탐색 루프)
- Test: `tests/scenario/reuseAssets.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `ReuseAssets.fixturesDir?: string` — Task 4의 `expandRawScenario`가 `ctx.assets.fixturesDir`로 읽는다. 값은 `_fixtures` 디렉토리의 **절대경로**이며, 없으면 `undefined`.

- [ ] **Step 1: 실패하는 테스트를 작성**

`tests/scenario/reuseAssets.test.ts`의 `describe("discoverReuseAssets", ...)` 안에 추가. 상단 import를 `import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";`로 바꾼다:

```ts
  it("finds the nearest _fixtures/ directory walking up from the scenario", () => {
    const root = mkdtempSync(join(tmpdir(), "fixtures-lookup-"));
    try {
      const fixDir = join(root, "_fixtures");
      mkdirSync(fixDir);
      writeFileSync(join(fixDir, "doc.pdf"), "%PDF-1.5");
      const deep = join(root, "area", "sub");
      mkdirSync(deep, { recursive: true });
      expect(discoverReuseAssets(join(deep, "s.yaml")).fixturesDir).toBe(fixDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves fixturesDir undefined when no _fixtures/ exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "fixtures-none-"));
    try {
      expect(discoverReuseAssets(join(dir, "s.yaml")).fixturesDir).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: 실패를 확인**

Run: `npx vitest run tests/scenario/reuseAssets.test.ts`
Expected: FAIL — `fixturesDir`가 `undefined`(첫 테스트에서 경로 불일치).

- [ ] **Step 3: 인터페이스에 `fixturesDir`를 추가**

`src/scenario/reuseAssets.ts`:

```ts
export interface ReuseAssets {
  fragments: Map<string, Fragment>;
  selectors: Record<string, Target>;
  fixturesDir?: string;
}
```

- [ ] **Step 4: 탐색 루프에 `_fixtures/`를 합류시킨다**

같은 파일 `discoverReuseAssets`. 선언부에 한 줄 추가:

```ts
  let fixturesDir: string | undefined;
```

`selectors` 탐색 블록 **뒤**, `const parent = ...` **앞**에 추가:

```ts
    if (!fixturesDir) {
      const fixDir = join(dir, "_fixtures");
      if (existsSync(fixDir) && statSync(fixDir).isDirectory()) fixturesDir = fixDir;
    }
```

종료 조건과 반환을 교체:

```ts
    const parent = dirname(dir);
    if ((fragments && selectors && fixturesDir) || parent === dir) break;
    dir = parent;
  }
  return { fragments: fragments ?? new Map(), selectors: selectors ?? {}, fixturesDir };
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/scenario/reuseAssets.test.ts`
Expected: PASS. 기존 `picks the nearest _selectors.yaml ...` 테스트도 그대로 통과해야 한다(종료 조건이 느슨해져 루트까지 더 올라갈 수 있으나 결과는 동일).

- [ ] **Step 6: 커밋**

```bash
git add src/scenario/reuseAssets.ts tests/scenario/reuseAssets.test.ts
git commit -m "feat(scenario): _fixtures/ nearest-ancestor 탐색 추가"
```

---

### Task 4: `upload.file` 파스타임 검증 + 절대경로 치환

**Files:**
- Modify: `src/scenario/expandScenario.ts` (상단 import, 신규 `resolveUploadFile`, 파이프라인 1행)
- Test: `tests/scenario/expandScenario.test.ts`

**Interfaces:**
- Consumes: `ReuseAssets.fixturesDir`(Task 3), `ExpandContext { assets, vars, source }`
- Produces: `expandRawScenario`가 반환하는 `upload` 스텝의 `file`이 절대경로로 치환된다. 검증 실패 시 `Error`.

- [ ] **Step 1: 실패하는 테스트를 작성**

`tests/scenario/expandScenario.test.ts` 끝에 추가. 상단 import에 다음 3줄을 더한다:

```ts
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
```

**주의:** 이 파일에는 이미 `assets()`·`ctx()`·`nav` 헬퍼가 있다(19행). `ctx`를 재선언하면 컴파일 에러이므로
아래처럼 `uploadCtx`라는 별도 이름을 쓰고, 기존 `assets(over)`에 `fixturesDir`를 주입해 재사용한다.

```ts
describe("upload fixture resolution", () => {
  const withFixtures = (fn: (fixDir: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), "upload-fix-"));
    try {
      const fixDir = join(root, "_fixtures");
      mkdirSync(fixDir);
      writeFileSync(join(fixDir, "doc.pdf"), "%PDF-1.5");
      fn(fixDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  const uploadCtx = (fixturesDir?: string) => ({ assets: assets({ fixturesDir }), vars: {}, source: "s.yaml" });
  const uploadScenario = (file: string) => ({
    id: "s", title: "t",
    steps: [{ action: "upload", target: { css: "input[type=file]" }, file }],
  });

  it("resolves a bare filename against the nearest _fixtures/", () => {
    withFixtures((fixDir) => {
      const out = expandRawScenario(uploadScenario("doc.pdf"), uploadCtx(fixDir));
      expect(out.steps[0].file).toBe(join(fixDir, "doc.pdf"));
    });
  });

  it("rejects a path instead of a bare filename", () => {
    withFixtures((fixDir) => {
      expect(() => expandRawScenario(uploadScenario("sub/doc.pdf"), uploadCtx(fixDir))).toThrow(/bare filename/);
      expect(() => expandRawScenario(uploadScenario("C:\\abs\\doc.pdf"), uploadCtx(fixDir))).toThrow(/bare filename/);
    });
  });

  it("fails before the executor when the fixture does not exist", () => {
    withFixtures((fixDir) => {
      expect(() => expandRawScenario(uploadScenario("missing.pdf"), uploadCtx(fixDir))).toThrow(/fixture not found/);
    });
  });

  it("fails when there is no _fixtures/ directory at all", () => {
    expect(() => expandRawScenario(uploadScenario("doc.pdf"), uploadCtx(undefined))).toThrow(/no _fixtures\//);
  });
});
```

- [ ] **Step 2: 실패를 확인**

Run: `npx vitest run tests/scenario/expandScenario.test.ts`
Expected: FAIL — 첫 테스트가 `"doc.pdf"`를 그대로 반환(치환 미구현), 나머지는 throw하지 않음.

- [ ] **Step 3: 해석 함수를 구현**

`src/scenario/expandScenario.ts` 상단 import에 추가:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
```

`resolveRef` 함수 뒤에 추가:

```ts
const PATH_SEP_RE = /[\\/]/;

// upload fixtures resolve at parse time, so a missing file fails before any executor is spawned.
function resolveUploadFile(step: any, i: number, ctx: ExpandContext): any {
  if (!step || step.action !== "upload") return step;
  const file = step.file;
  if (typeof file !== "string" || file === "")
    throw new Error(`${ctx.source}: steps[${i}]: upload requires a 'file' filename`);
  if (PATH_SEP_RE.test(file))
    throw new Error(`${ctx.source}: steps[${i}]: upload 'file' must be a bare filename inside _fixtures/ (got "${file}")`);
  if (!ctx.assets.fixturesDir)
    throw new Error(`${ctx.source}: steps[${i}]: no _fixtures/ directory found (searched upward from the scenario)`);
  const abs = join(ctx.assets.fixturesDir, file);
  if (!existsSync(abs))
    throw new Error(`${ctx.source}: steps[${i}]: upload fixture not found: ${abs}`);
  return { ...step, file: abs };
}
```

- [ ] **Step 4: 파이프라인에 연결**

같은 파일 `expandRawScenario`의 `${vars.*}` 치환 `steps = steps.map(...)` 블록 **뒤**, `deepMapStrings(steps, ...)` stray 검사 **앞**에 한 줄 추가:

```ts
  steps = steps.map((st, i) => resolveUploadFile(st, i, ctx));
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/scenario/expandScenario.test.ts`
Expected: PASS

- [ ] **Step 6: 전체 스위트 확인**

Run: `npm test`
Expected: 전부 PASS (149개 + 신규분).

- [ ] **Step 7: 커밋**

```bash
git add src/scenario/expandScenario.ts tests/scenario/expandScenario.test.ts
git commit -m "feat(scenario): upload 픽스처 파스타임 검증·절대경로 치환"
```

---

### Task 5: 문서 갱신 + 픽스처 커밋

**Files:**
- Modify: `skills/tester-mcp/document-guide.md:121` 부근(액션 목록), `:126-136` 부근(재사용 구조)
- Modify: `scenarios/ebill/seed/README.md:25-39`
- Add: `scenarios/ebill/_fixtures/documentSample.pdf` (이미 존재, 미커밋)

**Interfaces:**
- Consumes: Task 1~4의 최종 DSL 표면
- Produces: 없음

- [ ] **Step 1: 액션 목록에 `upload`를 추가**

`skills/tester-mcp/document-guide.md`의 `- \`screenshot\` — ...` 줄 **뒤**에 추가:

```markdown
- `upload` — `{ action: upload, target: <target>, file: "documentSample.pdf" }`. Uploads a real file
  to a file input through the browser tool's `file_upload`. `file` is a BARE FILENAME inside the
  nearest `_fixtures/` directory (same nearest-ancestor lookup as `_fragments/`); the runner resolves
  it to an absolute path at parse time and fails before spawning an executor if it is missing, so
  `validate` catches a typo for free. Point `target` at the `input[type=file]` element ITSELF, never
  at the visible "choose file" button — clicking that opens a native file picker the executor cannot
  see and the session freezes there. The input is often hidden (`display:none`) with a styled
  `label[for=...]` in front of it; that is expected and `find` still resolves it.
```

- [ ] **Step 2: 재사용 구조 트리에 `_fixtures/`를 추가**

같은 파일의 구조 블록에서 `_selectors.yaml` 줄 뒤에 추가:

```
      _fixtures/<name>.<ext>     # files uploaded by the `upload` action
```

그리고 그 아래 "Lookup is nearest-ancestor: from the scenario file upward, the first `_fragments/` dir and the first `_selectors.yaml` win." 문장을 다음으로 교체:

```markdown
Lookup is nearest-ancestor: from the scenario file upward, the first `_fragments/` dir, the first
`_selectors.yaml` and the first `_fixtures/` dir win (each resolved independently).
```

- [ ] **Step 3: seed README의 제약 문단을 철회**

`scenarios/ebill/seed/README.md`의 `## ⚠ 가장 큰 제약 — tester-mcp는 파일을 업로드할 수 없다` 섹션(표 포함, `반대로 **의안접수·...` 문단까지)을 통째로 교체:

````markdown
## 파일 업로드 (2026-08-12부터 가능)

DSL 액션은 9개다: `navigate` `fill` `click` `double_click` `upload` `wait_for` `assert_visible`
`assert_value` `screenshot`. `upload`가 추가되어 **공문파일이 필수인 지점도 자동화된다.**

```yaml
- { action: upload, target: { css: "input[type=file]" }, file: "documentSample.pdf" }
```

파일은 `scenarios/ebill/_fixtures/`에 두고 파일명만 적는다. 과거 이 문서는 아래 지점들을
"업로드 불가라 막힘"으로 기록했으나, 이제 전부 시도 가능하다 — 다만 각 화면의 실제 셀렉터는
개별 검증이 필요하다.

| 지점 | 필요한 파일 |
|---|---|
| 각 부서 **의견서 등록** | 공문파일 1개 |
| **톡돔 작성** | 공문파일 1개 |
| **법률 등록**(정부이송작업) | 법률파일 kg/ru 2개 (`upload` 2회, input이 각각 별도) |
| **정부이송 공문** | 공문파일 1개 |
| 외부수신문서 오프라인 등록 | 공문파일 1개 |
````

- [ ] **Step 4: seed README의 파일 표를 갱신**

같은 파일의 `| 파일 | 하는 일 | 계정 | 파일업로드 |` 표에서 `02-lgreview-complete.yaml` 행의
`**필요**`를 `**필요** (upload 액션으로 가능)`로 바꾼다.

- [ ] **Step 5: 커밋**

```bash
git add skills/tester-mcp/document-guide.md scenarios/ebill/seed/README.md scenarios/ebill/_fixtures/documentSample.pdf
git commit -m "docs(dsl): upload 액션·_fixtures 규약 문서화 + 픽스처 추가"
```

---

### Task 6: 실제 eBill 화면 실검증 (스펙 §11 리스크 1 해소)

지금까지의 검증은 전부 합성 테스트 페이지였다. **PrimeVue FileUpload 실물과 서버 전송까지는 미검증**이다. 이 태스크는 그것을 확인한다.

**Files:**
- Modify: `scenarios/ebill/seed/02-lgreview-complete.yaml`

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음

- [ ] **Step 1: 프론트 dev 서버가 떠 있는지 확인**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`
Expected: `200`. 아니면 `cd C:\workspace\kg_ebill_front && npm run local`로 띄운다(`npm run dev`는 빌드지 서버가 아니다).

- [ ] **Step 2: 업로드 스텝을 추가한다**

셀렉터는 소스에서 확인 완료다 — `kg_ebill_front/src/components/approve/insert/AddDragAndDropFileComponent.vue:133`이
`type='official'`일 때 `id="officialfile"`(`accept=".pdf"`, `multiple` 없음)을 렌더한다. 공문파일(Расмий документ)
칸이 바로 이것이다. 같은 컴포넌트의 `label[for="officialfile"]`(`.v_btn` 업로드 아이콘)은 **누르면 네이티브
선택창이 열리므로 절대 클릭 대상이 아니다.**

`02-lgreview-complete.yaml`의 `[등록]` 클릭 스텝(현재 51행 부근, `description`에 "공문 파일이 없으면 여기서
조용히 실패한다"가 적힌 스텝) **앞**에 추가:

```yaml
  - { action: upload, target: { css: "#officialfile", description: "공문파일(Расмий документ) input — label[for] 클릭 금지, input 자체에 업로드" }, file: "documentSample.pdf" }
```

`_fixtures/`는 `scenarios/ebill/`에 있으므로 이 시나리오에서 그대로 참조된다.

주의: 이 시나리오는 모달 안에서 동작하므로, `#officialfile`이 모달 밖 다른 컴포넌트와 중복되면
`.p-dialog #officialfile`로 좁힌다. 중복 여부는 실행 결과의 `handoff_notes`로 판단한다.

- [ ] **Step 3: 파스타임 검증**

Run: `node bin/tester-mcp.js validate scenarios/ebill/seed -c tester-mcp.config.yaml`
(`dist/`가 오래됐으면 `npm run build` 후 실행하거나 `npx tsx src/cli.ts validate ...`)
Expected: `OK` — 픽스처 경로가 해석되고 파일이 존재함.

- [ ] **Step 4: 실행**

Run: `npx tsx src/cli.ts run scenarios/ebill/seed/02-lgreview-complete.yaml -c tester-mcp.config.yaml`
Chrome 창을 전면에 유지할 것. 순차 실행(병렬 금지).

- [ ] **Step 5: 결과를 판정하고 기록**

- PASS → 실물 검증 완료. 스펙 `docs/superpowers/specs/2026-08-12-upload-action-design.md` §11의 리스크 1 항목에 `해소(2026-08-12, seed-02 PASS)`를 덧붙인다.
- NOT_TESTED → `handoff_notes`의 관찰 내용으로 셀렉터를 교정하고 Step 3부터 반복. **셀렉터를 추측으로 바꾸지 말 것** — `handoff_notes`에 적힌 실제 관찰 요소를 쓴다.
- FAIL(업로드는 됐으나 등록이 거부됨) → 서버측 파일 검증 문제(스펙 §11-4). 결과 JSON의 evidence를 스펙 §11-4에 실측으로 기록한다.

- [ ] **Step 6: 커밋**

```bash
git add scenarios/ebill/seed/02-lgreview-complete.yaml docs/superpowers/specs/2026-08-12-upload-action-design.md
git commit -m "test(seed): 의견서 등록에 공문파일 업로드 스텝 추가 — 실화면 검증"
```

---

## 완료 기준

- `npm test` 전부 통과.
- `tester-mcp validate scenarios/ebill` 통과.
- `seed-02`가 실제 eBill 화면에서 업로드를 수행함(Task 6 Step 5의 판정 기록 존재).
- `document-guide.md`만 읽고도 AI가 `upload` 시나리오를 작성할 수 있다(설계 기준: AI 단독 재사용).
