# executor 보고 채널 · optional 스텝 · 가드 설계 — 리포터 도구 · 오류형 사유 · 핀 검증 · 자동 경고 · 반복 클릭 가드

- 날짜: 2026-09-28
- 상태: 설계 승인됨 (사용자 "설계하고 진행해"). 승인 서버 동봉(`bin/approver.cjs`)은 같은 날 선행 구현·미커밋.
- 설계 기준(사용자 명시): **AI가 사용자 추가 요청 없이 tester-mcp만으로 재사용을 처리할 수 있어야 하며, 토큰을 낭비하지 않아야 한다.**
- 발단: Claude Code 2.1.252~2.1.283 변경 대조 + 2.1.283 스모크·A/B 실측. 원본은 Obsidian
  `Projects/testMcp/specs/2026-09-28-claude-code-update-candidates.md` §7·§9·§11·§12.

## 1. 배경 — 결과가 runner에 도달하지 못하거나, 도달해도 원인이 가려진다

실행 로그 `runs/` 496건(결과 457건) 집계:

| 증상 | 실측 | 손실 |
|---|---|---|
| executor가 kill됨(timeout 13·groping 7·stall 2) 또는 결과 없음(4) | 26건 | steps·evidence·handoff_notes 전부 유실. 결과 JSON은 `steps: []` |
| 최종 텍스트 JSON 파싱 실패 | 36건 | salvage로 status만 회수, steps 유실 |
| 스텝 0건으로 끝난 결과 | 77건 | 어디까지 갔는지 모름 |
| haiku 보고 누락 | 30스텝 중 22 | 실행은 했는데 인덱스로 안 적음(스크린샷 4·로그인 조각 4·헤더 확인 1) |
| result 이벤트에 `result` 문자열이 없는 오류형(`error_max_budget_usd`, `error_max_structured_output_retries`) | 스모크 J·K | 지금 코드는 `""`로 받아 "파싱 실패"로 둔갑 |
| `permission_denied` 시스템 이벤트의 `decision_reason` | 스모크 Q1~Q3 | 결과에 안 남음. 0.5.0 때 haiku 거부 원인이 가려졌던 패턴 그대로 |
| 같은 대상 반복 클릭(같은 좌표·ref·셀렉터를 8호출 안에 다시 클릭) | 496 run 중 124 run, 153회 | 저장·전송 버튼이면 중복 레코드. 계약은 요소 찾기 반복만 금지 |
| 로그인 조각이 "이미 로그인된 Chrome"을 전제 | 2026-09-28 NOT_TESTED 3건 | 시작 상태에 따라 첫 단계에서 멈춤. DSL에 스텝 단위 분기 없음 |
| Claude Code가 한 달에 32버전 | 2.1.252→283 | deny 목록 밖 내장 도구 16종 노출, ReportFindings 실호출 12 run |

## 2. 결정 요약

| # | 결정 | 기준 적용 근거 |
|---|---|---|
| 1 | 스텝·판정 보고를 **MCP 도구 호출**(`report_steps`·`report_final`)로 받는다. runner는 stream-json의 `tool_use` 인자에서 수집(접근법 A) | kill 시점까지의 스텝이 남는다. 파싱·salvage가 폴백으로 내려간다. 프로세스 간 통신 신설 없음 |
| 2 | 서버 파일 `bin/approver.cjs` → `bin/executor-tools.cjs`, 서버명 `tester`, 도구 `approve`·`report_steps`·`report_final` | 승인 서버가 이미 executor에 붙어 있다. 도구 2개 추가는 수백 토큰 |
| 3 | `report_steps`는 **배열**을 받고 `index`가 정수가 아니면 서버가 거부 | 같은 턴에 끝낸 연속 스텝을 한 번에 보내 턴 수를 안 늘린다. "35-36" 범위 표기는 서버 검증에서 막힌다 |
| 4 | 텍스트 JSON 경로(`parseExecutorResult`)는 **폴백으로 유지**, `reported_via: "tool" \| "text"`로 어느 경로였는지 기록 | 옛 로그·계약을 안 따른 executor 호환. 제거는 후속 |
| 5 | result 이벤트의 `subtype`·`errors`·`terminal_reason`, `permission_denied`의 `decision_reason`을 `not_tested_reason`에 쓴다 | 원인이 증상 뒤에 가려지는 패턴의 재발 방지 |
| 6 | 디바이스 핀은 **검증만**: `select_browser` 호출 유무·성공 여부를 runner가 본다 | 계약이 이미 첫 호출로 선택시키고 승인 서버로 통과가 확인됨(2026-09-28 haiku·sonnet). 남은 구멍은 실패를 조용히 지나치는 것뿐 |
| 7 | doctor 명령은 **만들지 않는다**. 대신 매 run의 `init` 이벤트에서 자동 경고 | 별도 프로브는 executor 스폰 1회 = 돈·탭. 잡으려는 것은 실 run의 init에 이미 있다 |
| 8 | 스텝 단위 `optional: true` → 실패 시 `SKIPPED`, 계속 진행, 판정 무관 | 사용자 선택(블록·전용 액션 대비). 인덱스가 평평하게 유지돼 결과→시나리오 매핑이 안 깨진다 |
| 9 | 반복 클릭은 **계약 금지 + runner 경고**. 강제 종료는 이번에 안 넣는다 | 경고 빈도를 먼저 잰다. 중복 제출은 kill해도 되돌릴 수 없다 |
| 10 | `claude_code_version`을 결과 JSON과 summary에 기록, 직전 run과 다르면 경고 | 버전 회귀를 suite 실행 전이 아니라 실행 중에 잡는 가장 싼 방법 |
| 11 | `--tools ""`, DB 단언 스텝, Playwright 백엔드는 **범위 밖** | 사용자 보류·제외 |

## 3. 결과 채널 — 도구 · 계약 · 수집 · 조립

### 3.1 서버 `bin/executor-tools.cjs` (서버명 `tester`)

JSON-RPC stdio, 의존성 없음. 도구 3개.

| 도구 | 입력 | 응답 |
|---|---|---|
| `approve` | `{ tool_name, input, tool_use_id }` | `{"behavior":"allow","updatedInput":<input>}` (현행) |
| `report_steps` | `{ steps: [{ index: integer ≥1, status: "PASS"\|"FAIL"\|"SKIPPED"\|"NOT_TESTED", note?: string }] }` | `recorded N step(s)`. `index`가 정수가 아니거나 `status`가 넷 밖이면 **오류 응답**(`isError: true`, 어떤 항목이 왜 틀렸는지) → 모델이 고쳐 다시 부른다 |
| `report_final` | `{ status: "PASS"\|"PARTIAL"\|"FAIL"\|"NOT_TESTED", evidence: string[], handoff_notes?: string, not_tested_reason?: string, screenshots?: string[] }` | `recorded final: <status>`. `status` 밖이면 오류 응답 |

서버는 **저장하지 않는다**. runner가 스트림에서 읽는다. 플래그는 `--permission-prompt-tool mcp__tester__approve`, `--disallowedTools`에 `mcp__tester__approve`만 (보고 도구 2개는 모델이 불러야 하므로 열어 둔다).

### 3.2 계약(`SYSTEM_CONTRACT`)과 사용자 프롬프트

- `[Output]` 절 → `[Reporting]` 절. 규칙: 스텝을 끝낼 때마다 `mcp__tester__report_steps`(같은 턴에 끝낸 연속 스텝은 한 번에), 끝에 `mcp__tester__report_final` 한 번, 그 뒤 텍스트 JSON은 내지 않는다. NOT_TESTED로 멈출 때도 `report_final`을 먼저 부른다. `index`는 프롬프트의 스텝 번호(1부터).
- 사용자 프롬프트의 `# Output format` 블록 → `# Reporting` 블록으로 교체. "index는 단일 정수" 경고는 유지(서버가 막지만 예방이 싸다).
- `[One click per click step]` 절 신설: 클릭 스텝은 클릭 1회. 변화가 안 보이면 다시 누르지 말고 스크린샷 1장 뒤 관찰과 함께 그 스텝을 FAIL로 보고. `destructive: true` 스텝(프롬프트에 `(destructive — never repeat)`로 표시)은 어떤 이유로도 반복 금지. `[Double-click]` 절은 유지.
- `[Optional steps]` 절 신설: `(optional)`로 표시된 스텝은 타깃이 없거나 실패해도 `SKIPPED`로 보고하고 다음 스텝으로. NOT_TESTED로 끝내지 않는다. optional `wait_for`는 주어진 `timeout_ms`만 기다린다.
- `renderStep`: optional이면 ` (optional)`, click이고 destructive면 ` (destructive — never repeat)` 접미.

### 3.3 수집(`streamParser`)

`StreamState`에 추가:

| 필드 | 출처 | 비고 |
|---|---|---|
| `reportedSteps: { index, status, note? }[]` | `tool_use` name `mcp__tester__report_steps`의 `input.steps` | 도구 인자를 저장하는 **유일한 예외**. 결과 전체가 `redactSecrets`를 거치므로 비밀값은 같은 층에서 가려진다. 같은 index는 나중 것이 이긴다 |
| `finalReport?: { status, evidence, handoff_notes?, not_tested_reason?, screenshots? }` | `tool_use` name `mcp__tester__report_final` | 두 번 오면 나중 것 |
| `permissionDenied: { tool, reasonType?, reason? }[]` | `system` `subtype: "permission_denied"` | 이름·사유 문자열만 |
| `resultMeta?: { subtype, isError, errors?: string[], terminalReason? }` | `result` 이벤트 | `result` 문자열 유무와 무관하게 기록 |
| `init?: { claudeCodeVersion?, builtinTools: string[], mcpServers: { name, status }[] }` | `system` `subtype: "init"` | `tools`에서 `mcp__` 접두가 아닌 것이 내장 도구 |
| `browserPin?: { requested?: string, ok?: boolean, error?: string }` | `tool_use` name `…select_browser`의 `input.deviceId` + 짝 `tool_result`의 `is_error`/본문 앞 200자 | 첫 select_browser만 |
| `repeatedClicks: { call: number, key: string }[]` | 클릭 호출의 키가 직전 8개 호출 안의 키와 같을 때 | 키 = `computer`(`action` + coordinate/ref) / `browser_batch` 안의 computer 클릭 / `javascript_tool` 텍스트에 `.click()`·`MouseEvent`·`.submit()`이 있으면 그 텍스트의 **sha1 앞 8자** |

`tool_use`↔`tool_result` 짝은 `id`/`tool_use_id`로 맞춘다(지금은 순서만 기록). 기존 `trail`·`consecutiveTool`·`deniedTools`·`inputBeforeScreenshot`은 그대로.

### 3.4 조립(`runScenario`) 우선순위

1. **`finalReport` 있음** → status·evidence·handoff_notes·not_tested_reason·screenshots는 그것. `steps`는 `reportedSteps`를 index 오름차순으로 두고 runner가 `action`을 `scenario.steps[index-1].action`에서 채운다(범위 밖 index는 `action: "?"`로 두고 버리지 않는다). `reported_via: "tool"`.
2. **없고** kill됐거나(`killedReason`) `resultMeta.isError` → `status: NOT_TESTED`, `not_tested_reason`은 (a) chrome 거부 사유 (b) `resultMeta.subtype + errors` (c) kill 사유 순. `steps`는 `reportedSteps`(있으면). `reported_via: "tool"` (steps가 있을 때) 아니면 생략.
3. **없고** 텍스트 결과 있음 → 기존 `parseExecutorResult` + salvage. `steps`는 `reportedSteps`가 있으면 그것을 우선, 없으면 텍스트의 것. `reported_via: "text"`.

`chromeDenialReason`: `permissionDenied`에 사유 문자열이 있으면 그 문자열을 앞세우고, 2026-08-05 haiku 문구는 사유가 없을 때만 남긴다.

### 3.5 결과 JSON 변경(추가만)

- `StepResult.status`에 `"SKIPPED"` (scenario `Status` 네 값은 불변), `StepResult.note?`.
- `ScenarioResult`: `reported_via?`, `claude_code_version?`, `browser_pin?: { requested, ok, error? }`, `warnings[]`에 새 종류 3개(§4·§6).
- `RunSummary`: `claude_code_version?`.

## 4. 자동 경고(doctor 대체)

run 시작 시 `runs/<outDir>`에서 가장 최근 `summary.json`의 `claude_code_version`을 읽는다(없으면 비교 생략). 각 시나리오 결과의 `warnings`에:

| 경고 | 조건 | 문구 골자 |
|---|---|---|
| 내장 도구 유출 | `init.builtinTools` 중 `KNOWN_BUILTIN_TOOLS`(2.1.283 실측 16종 + `StructuredOutput`) 밖의 이름 | "executor was offered built-in tools outside the known set: X, Y — deny them or adopt --tools" |
| tester 서버 미연결 | `init.mcpServers`에 `tester`가 없거나 `status !== "connected"` | "tester tool server not connected — permission gate and step reports are off" |
| CLI 버전 변화 | `init.claudeCodeVersion !== 직전 summary 버전` | "Claude Code changed A → B since the last run; flag semantics may have moved" |
| 브라우저 핀 | §6 | |
| 반복 클릭 | §6 | |

경고는 판정을 바꾸지 않는다. `cli.ts`는 이미 `warning:`을 출력한다.

## 5. optional 스텝

- 타입: `Step` 각 변형에 `optional?: boolean` (교차 타입으로 한 번에). `parseScenario`는 `optional`이 있으면 boolean인지 검사.
- 프래그먼트 확장은 스텝 객체를 그대로 통과시키므로 추가 작업 없음(`login.yaml`의 `wait_for #v_header`·`click logout`에 `optional: true` + `timeout_ms: 3000`을 붙이는 것은 시나리오 측 후속).
- 계약·프롬프트: §3.2. 판정 규칙: `SKIPPED`는 PASS 계산에서 제외, FAIL로 세지 않는다. `on_failure: stop`이어도 optional 실패는 멈추지 않는다.
- `document-guide.md` 스텝 필드 표에 `optional` 추가, `on_failure`·시나리오 `optional`과의 관계 한 줄.

## 6. 핀 검증과 반복 클릭 가드(runner 측)

- **핀**: `browserDeviceId`가 설정됐을 때 (a) `browserPin.ok === true`면 조용, (b) `ok === false`면 `warnings`에 "browser pin failed: <error>" + status가 NOT_TESTED면 `not_tested_reason` 앞에 같은 문구, (c) 첫 탭 도구 호출 전에 select_browser가 없었으면 `warnings`에 "executor did not pin the browser before touching tabs". `browser_pin` 필드에 요약.
- **반복 클릭**: `repeatedClicks.length > 0`이면 `warnings`에 "clicked the same target again N time(s) (calls #a, #b …) — a repeated click on a save/submit button may have duplicated a record". 강제 종료 없음.

## 7. 테스트

| 파일 | 검증 |
|---|---|
| `tests/run/executorTools.test.ts`(신규) | `bin/executor-tools.cjs`를 child_process로 띄워 initialize/tools/list/tools/call: approve 응답, report_steps 정상·정수 아닌 index·잘못된 status 오류, report_final 정상·오류 |
| `tests/run/buildExecutorArgs.test.ts` | 서버명 `tester`, 파일명, `--permission-prompt-tool mcp__tester__approve`, deny에 approve만 |
| `tests/run/streamParser.test.ts` | reportedSteps(중복 index 후승), finalReport, permissionDenied, resultMeta(오류형), init, browserPin(성공/실패/없음), repeatedClicks(좌표·ref·js 해시·batch, 8호출 창) |
| `tests/run/runScenario.test.ts` | 조립 우선순위 1·2·3, action 채움, 범위 밖 index, kill+reportedSteps 보존, 오류형 사유, 핀 경고·사유, 반복 클릭 경고, reported_via |
| `tests/run/buildPrompt.test.ts` | `[Reporting]`·`[One click per click step]`·`[Optional steps]` 문구, renderStep 접미, Output format 블록 제거 |
| `tests/scenario/parseScenario.test.ts` | `optional` boolean 검사 |
| `tests/result/writeResult.test.ts`·`tests/run/runScenarios.test.ts` | summary의 `claude_code_version`, 직전 버전 비교 경고 |
| `tests/guide/*` | document-guide에 `optional` 필드·보고 규약 문구 |

효과 실측은 단위테스트 범위 밖: 구현 후 `uzb-mng-screens-load`를 sonnet으로 1회 돌려 `reported_via: "tool"`, steps 30/30, 경고 0을 확인한다.

## 8. 비범위 (YAGNI)

- 텍스트 JSON 경로 제거, `--json-schema`, `--tools ""`, `--max-budget-usd`: 후속 또는 보류.
- 반복 클릭 강제 종료, 클릭↔스텝 매핑(리포터 index로 근사 가능하지만 이번엔 안 씀).
- DB 단언 스텝, Playwright 백엔드, doctor 명령.
- `when_visible` 블록·`click_if_visible` 액션.

## 9. 리스크

- 모델이 `report_final`을 잊으면 폴백(텍스트)으로 떨어진다 → `reported_via: "text"`가 남으므로 빈도를 볼 수 있다. 계약 문구를 강하게 두고, 첫 실측에서 빈도를 확인한다.
- `report_steps` 호출이 턴을 늘릴 수 있다 → 배열 허용 + "같은 턴에 끝낸 스텝은 한 번에" 문구. 실측으로 턴·비용을 A/B(2026-09-28 sonnet 31턴 $0.47)와 비교한다.
- 반복 클릭 키의 오탐(드롭다운 열기·닫기처럼 정당한 재클릭) → 경고일 뿐 판정 불변. 빈도를 보고 임계·창을 조정.
- `SKIPPED`를 읽는 다른 소비자(스킬·가이드)가 새 상태를 모른다 → document-guide 결과 해석 절에 한 줄 추가.
