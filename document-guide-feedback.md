# tester-mcp document-guide 개선 피드백 (수집)

실제 시나리오 작성·실행 중 발견한 문제점. document-guide/DSL/도구를 명확히 하기 위한 입력.
대상 작업: kg_ebill alert→toast 42건 검증.

> **처리 상태는 문서 맨 끝 [처리 결과 (2026-08-28)](#처리-결과-2026-08-28) 표를 볼 것.**
> 본문은 발견 당시 기록 그대로 두었다(왜 그렇게 판단했는지가 근거로 남아야 하므로).

## A. DSL / 작성 가이드

### A1. `assert_toast` 전용 action — 보류 (이번 작업 한정 + assert_visible로 충분 확인됨)
- 사용자 판단: toast 검증은 이번 alert→toast 작업에 한정돼 범용 가이드 개선으로는 애매 → **보류**.
- **검증(2026-05-26)**: `assert_visible`(text 매칭) + `screenshot`으로 toast가 **정상 검증됨** — search-warn PASS 시 "Пожалуйста, введите минимум 2 символа" 텍스트 정확 일치 + 우하단 노란 토스트 스크린샷 확보. 즉 텍스트는 assert_visible, 색상(severity)은 screenshot으로 커버 가능. 전용 action 없이도 충분.

### A2. `login_as` — 철회 (가이드 공백 아님)
- 사용자 판단: `login_as`는 가이드의 **샘플 예시**일 뿐, 로그인 처리 방식은 **시나리오 작성자가 정하면 됨**.
- 결정(kg_ebill): named login 미사용. `admin`/`best1234`로 `#userId`·`#pswd` fill + `.btn_login` click을 각 시나리오 steps에 직접 넣는다(또는 공통 prelude로 재사용). secrets는 `${secrets.tester.*}` 참조.

### A3. native `<select>` 조작 action 부재 — 인정 (개선 채택)
- 문제: fill(input)/click(button)만으론 native `<select>` 옵션 선택이 어려움. kg_ebill의 TEST ID 자동로그인 드롭다운(`<select @change>`)이 대표 사례.
- 개선안: `select_option` action(`{ action: select_option, target, value | label }`) 추가. 또는 가이드에 native select 처리법(option value 직접 set + change 디스패치) 명시.

### A4. placeholder/testid 없는 요소의 셀렉터 전략 (핵심 고민)
- 문제: 중복 class(`.form_control`) 좁히기뿐 아니라, **placeholder도 testid도 없는 요소**(아이콘 버튼, class 없는 div onClick 등)를 어떻게 안정적으로 지목하나.
- 결정한 우선순위(코드에서 안정 셀렉터 1개 확정):
  1. 고유 id (`#userId`)
  2. 의미 있는 단일 class (`.btn_search`)
  3. 부모 컨테이너 + 자식 (`.search_form input`, `.btn_group .btn_outline_error`) — 중복 class를 컨텍스트로 좁힘
  4. role + 접근명(텍스트) — 텍스트가 i18n이면 **`locale:` 고정 필수**
  5. 구조적(nth-of-type) — 깨지기 쉬워 **지양**(최후 전 단계)
  6. description(자연어) — 진짜 최후. 1회 시도 미스 시 NOT_TESTED
- 개선안: 가이드 selector-first 섹션에 위 우선순위 표 + "구조적 nth 지양, 자연어는 최후" 명시. placeholder 없는 케이스 예시 추가.

### A5. ⭐⭐⭐ ephemeral(자동소멸) UI 검증 — `screenshot` 금지 + 즉시 단일 체크 (2026-05-27 실측, 핵심)
- 배경: PrimeVue toast는 `life:3000`(3초 후 자동소멸). 이 3초가 **executor 도구 라운드트립 지연보다 짧아** 검증이 구조적으로 불안정.
- **증상1 — screenshot 무한루프(letter-insert-empty-warn)**: `assert_visible`(text)는 **이미 통과**("완벽합니다! 우하단 노란 toast 보임")했는데, 뒤따르는 `screenshot` 단계가 toast를 못 담음(찍는 사이 소멸 + 무거운 screenshot 도구 느림) → "재클릭→리사이즈→스크롤→JS이동→재촬영"을 **36회 반복**하다 5분 하드 타임아웃 → 최종 verdict 못 냄 → `steps:[]` NOT_TESTED. **`screenshot` 단계 제거 → 즉시 PASS(1.5분)**. (verbose+last_tool/tool_count 필드로 진단됨 — B1 반영 확인)
- **증상2 — assert 레이스(external-insert-empty-warn)**: 클릭 후 executor가 탐지를 **JS innerText→find→read_page 순차 다중 시도** → 각 라운드트립 사이 toast 소멸 → 1회차 NOT_TESTED. **동일 시나리오 재실행 → PASS**(body.innerText에서 'Выберите тип.' 즉시 포착). **플래키 = 레이스 확정**.
- 근본: **toast 수명(3s) < executor 다중 탐지 지연**. 두 증상 모두 같은 원인.
- 개선안(가이드 반영 요청):
  1. **ephemeral UI 검증에 `screenshot` 단계 넣지 말 것** — `assert_visible`(text/DOM)만으로 충분. screenshot은 verdict를 막고 루프를 유발. (executor는 PASS 시 자연히 증거 스크린샷을 남기기도 함)
  2. **트리거 직후 단일·즉시 체크** — 클릭 바로 다음 스텝에 assert_visible 1개. executor가 여러 탐지법으로 폴백하지 않도록(첫 시도는 가장 빠른 JS innerText) 가이드/executor 정책 명시.
  3. (선택) DSL에 `ephemeral: true` 힌트 → executor가 "트리거+즉시 단일 DOM 체크, 실패 시 트리거 1회 재시도 후 즉시 체크"의 atomic 패턴 적용. 또는 테스트 빌드에서 toast `life` 상향 안내.
- 비고: A1(assert_toast 보류) 재검토 — 전용 toast action보다 "ephemeral 검증 정책"이 더 일반적이고 본질적. A1은 여전히 보류, A5가 상위 개념.

### A6. runs 출력 경로가 CWD 기준 (사소)
- 실측: `-c`/`--secrets`를 절대경로로 줘도 `runs/`는 **CWD 기준**(`C:\workspace\runs\...`)에 생성. config/시나리오 위치와 무관.
- 개선안: 가이드에 "결과는 CWD/runs에 생성" 명시, 또는 config 위치/별도 옵션(`--out-dir`) 기준으로 통일.

## B. 실행 / 진단

### B0. ⛔ executor 좀비 누적 + 재spawn 폭주 (치명적 — 모든 NOT_TESTED의 진짜 근본 원인, 실측)
- 실측: `search-warn` 단일 시나리오를 4회 run 했는데, 정리 시점에 `claude -p --chrome` executor 프로세스가 **22개** 살아있었음(8:23~8:27 초 단위 연속 생성). 타임아웃된 executor가 Windows에서 안 죽고(부모 kill해도 자식 claude 프로세스 잔존) 누적 + tester-mcp가 계속 재spawn한 것으로 보임.
- 영향: 22개 executor가 **같은 claude-in-chrome/브라우저를 동시 점유·조작**(검색창에 a/aa 반복 입력 목격) → 완전 경합 → 전부 무응답 → `steps:[]` NOT_TESTED. 앞서 추정한 "executor가 못 붙음/경합/연결 불안정(extension not connected)"은 모두 이 좀비 폭주의 증상이었음.
- 요청:
  1. 타임아웃 시 executor **자식 프로세스까지 확실히 종료** (Windows: `taskkill /PID <pid> /T /F` 또는 Job Object로 트리 kill). 부모만 kill하면 claude 자식이 좀비로 남음.
  2. **재spawn 폭주 방지** — 시나리오당 executor 1개 보장, 실패 시 재시도 상한.
  3. 동시 실행(--concurrency) 시 executor마다 **브라우저 인스턴스 격리**(별도 프로필/유저데이터디렉터리) — 단일 claude-in-chrome을 다수가 공유하면 경합.
- **검증(2026-05-26)**: 좀비 22개 정리 후 **깨끗한 상태에서 단일 run → PASS** + executor **0개 잔존**(정상 종료 시 자동 정리됨). 즉 좀비는 "타임아웃 난 run이 안 죽고 남긴 executor"가 누적된 것. **정상 완료 = 클린 / 타임아웃 = 좀비**. 따라서 위 요청1(타임아웃 시 자식 트리 kill)이 핵심 수정 포인트.
- 운영 회피책(수정 전까지): run은 **한 번에 1개씩, 끝나면 잔여 executor 정리** 후 다음 run.
- **검증2(--concurrency 3, 2026-05-26)**: executor는 3개 **병렬 spawn은 정상**(동시 생성 확인)이나, **단일 claude-in-chrome 브라우저 공유**로 3개가 경합 → 실질 병렬 처리 불가. 한 개가 막히자 재spawn(4번째 생성) → 좀비 누적 시작.
- **⚠️ 정정(--concurrency 3, 2026-05-27 — 로그 tabId 검증)**: 어제 "탭 격리로 병렬 해소"는 **오판이었음**. 2회 연속 `--concurrency 3` 실행 모두 **3 executor가 동일 탭(tabId=963424579)을 공유**했고 `tabs_create` 호출 0회 — 전부 `tabs_context_mcp {createIfEmpty:true}`로 **기존 단일 탭 재사용**. 즉:
  - **병렬인 것은 executor 프로세스뿐, 브라우저 탭은 단일 공유.** 명령이 claude-in-chrome 연결로 직렬화되어 인터리빙됨(한 executor가 느린 라운드트립 대기 중 다른 executor 명령 처리 → 벽시계 373s→179s 단축은 사실이나 "동시 조작"은 아님).
  - **3건 PASS는 우연**: 각 시나리오가 `navigate /`로 매번 상태 리셋 + 짧아서 안 겹친 것. 같은 탭이라 한 executor의 navigate가 다른 executor가 보던 페이지를 갈아치우는 **구조적 레이스** 존재. 안전 보장 아님(상태 변경/긴 시나리오면 깨질 수 있음).
- **남은 요청(B0-3 유효)**: 진짜 병렬 격리는 tester-mcp가 **executor마다 `tabs_create_mcp`로 전용 탭 생성 + 그 tabId에 고정**해야 함. 현재 DSL엔 탭 지정 필드 없음 → executor 기본동작(createIfEmpty)이 단일 탭으로 수렴. 가이드/실행기에 "executor별 전용 탭 할당" 추가 필요.
- **현 운영 권고**: 읽기·검증 위주 + 매 시나리오 `navigate`로 자기 상태를 처음부터 세팅하는 짧은 시나리오에 한해 `--concurrency`로 속도 이득 가능하나 레이스 가능성 인지. 결과 민감하면 `--concurrency 1` 순차가 안전.

### B1. ✅ 해결 확인(2026-05-27): 로그/`last_tool`/`tool_count`/`--verbose` 추가됨
- (과거) `search-too-short-warn` run → NOT_TESTED, `steps: []`, 로그/마지막 상태 없음.
- **해결 실측(2026-05-27)**: 결과 JSON에 `last_tool`, `tool_count`, `executor_log`(경로) 추가 + `not_tested_reason`에 "하드 타임아웃 — 마지막 도구 X(N회)" 기록 + `--verbose` 추가됨. 이 데이터로 A5의 screenshot-loop(last_tool=javascript_tool, tool_count=36)를 즉시 진단함. **B1 요청 거의 충족.** 남은 것: `--verbose` 콘솔 출력이 277KB로 과다 → 결과 JSON/요약에 핵심만 요약하는 옵션이 있으면 더 좋음.

### B2. 5분 통째 소진 후에야 실패 (조기 감지 없음)
- 문제: 첫 도구부터 무응답이어도 하드 타임아웃(기본 300s)까지 대기. 진단·반복이 매우 느림.
- 개선안: 스텝별 타임아웃 + 무응답 N초 시 조기 bail. 진행 하트비트 로그.

### B3. claude-in-chrome 무응답이 근본 병목인데 가이드에 진단/복구 절차 없음
- 문제: prerequisites가 "확장 연결돼야 함"만 다룸. **연결돼도 명령에 무응답**인 경우(이 환경에서 실제 발생)를 안 다룸. executor도 같은 확장을 쓰므로 동일하게 5분씩 날림.
- 개선안: run 전 **사전 헬스체크**(간단 navigate+assert로 확장 응답성 확인, 실패 시 즉시 안내). 가이드에 "무응답 시 확장 재연결/Chrome 재시작" 복구 절차 추가.

## 상태
- 환경: Windows, node v22, runner_model haiku, claude-in-chrome("업무용") 연결됨
- 현재 블로커: claude-in-chrome 무응답으로 executor가 진전 못 함 → 확장 응답성 회복이 선결

## 2026-07-06 billLink 파일럿 검증에서 발견한 가이드/DSL 개선점

1. **제출→라우팅 흐름의 ephemeral toast는 지침대로 해도 캡처 실패**: referral-request-success에서 등록 성공 toast가 fnReload/리디렉션과 겹쳐 단일 즉시 체크로도 놓침(PARTIAL). 가이드에 "제출이 페이지 전환을 유발하는 흐름은 toast 대신 사후 상태(버튼 소멸, 목록 반영)를 assert하라" 항목 필요. assert_not_visible(부정 단언)이 DSL에 없어 '버튼이 사라짐'을 표현할 수 없는 것도 한계.
2. **targets.frontend와 백엔드 CORS 결합**: 5174(임시 vite)로 타겟팅하자 로그인부터 Network Error — 백엔드 CORS 화이트리스트(5173)에 없는 origin이었음. prerequisites에 "frontend 타깃 origin이 백엔드 CORS 허용 목록에 있어야 함" 명시 필요.
3. **css+text 복합 타겟은 안정적으로 동작** (같은 클래스 버튼 4개 중 텍스트로 구분 성공). PrimeVue4 클래스(.p-autocomplete-dropdown/-overlay/-option, .p-toast-message-warn/-success) 기반 타겟팅 모두 1회 명중 — 가이드의 selector-first 원칙 유효성 재확인.

## 2026-07-13 — inbox-save-to-mydocs 작성 중 발견

- **`:has()` 셀렉터로 groping 발생**: `button:has(i.pi-download)` 타겟이 첫 시도 미스 후 browser_batch 28회 반복 → groping kill. 아이콘 전용 버튼(접근성 이름 없음)은 read_page 트리에 일부만 노출되어 description 폴백도 실패. **해결**: 아이콘 요소 직접 타겟(`i.pi-download`)으로 교체 — 클릭이 버튼으로 버블되므로 동작 동일. 가이드에 ":has() 등 관계형 의사클래스 지양 + 아이콘 전용 버튼은 아이콘 클래스를 직접 타겟" 명시 필요.

## 2026-08-28 — 발의→공포 전 구간(14 시나리오) 완주 중 발견 · 변경 요청

대상 작업: kg_ebill seed 스위트로 의안 1건을 step 0 → 3300(공포)까지 전진.
아래 1~2는 **요청**, 3은 이미 이 저장소에 반영한 것(재작성 방지용 기록).

### 1. ⭐ 실행 단위 마커를 시나리오에 주입할 수단 — `--var` 플래그 + 내장 `${today}`

**문제**: seed 스위트는 의안명에 고정 문자열 `E2E-SEED` 마커를 넣는다. 돌릴 때마다 **같은 이름의
의안이 쌓이고**, 뒤 단계가 `target.text: "E2E-SEED"` 로 행을 잡으므로 **어느 의안을 여는지 보장이 없다.**
2026-08-28 실측: 옛 `6-6989/26`(step 1200)이 남아 있어 법무실검토서 목록에서 신규 건과 겹쳤다.
이번엔 '이행받은 의안' 토글 덕에 우연히 갈렸을 뿐이고, 구조적으로는 **엉뚱한 의안을 전진시킬 수 있다.**
(같은 부류의 사고가 이미 있었다 — seed README 의 `seed-05` 1차 오부의.)

**요청 A — `run --var key=value` (반복 가능)**
- 체인의 각 시나리오는 **별개의 CLI 실행**이다(러너가 시나리오마다 `node bin/tester-mcp.js run` 호출).
  따라서 실행마다 달라지는 `run_id` 계열 값은 쓸 수 없다 — 뒤 시나리오가 앞 시나리오의 의안을 못 찾는다.
  **운영자가 체인 전체에 같은 값을 넘길 수 있어야 한다.**
- 예: `--var marker=20260828-2` → 시나리오에서 `E2E-SEED ${marker}`

**요청 B — 내장 `${today}`(YYYYMMDD)**
- 하루 한 번 도는 흔한 경우를 위해 기본 제공. 하루에 두 번 돌릴 때는 요청 A 로 덮어쓴다.

**요청 C — 치환 범위 확장 (이게 없으면 A·B 가 무의미하다)**
- 현재 `${var}` 치환은 **`url` 과 `value` 에만** 걸린다 (`src/scenario/expandScenario.ts:91-105`
  — `if (out.url !== undefined) … if (out.value !== undefined) …`).
- 의안명은 `value` 로 들어가니 **등록은 되지만**, 뒤 단계가 행을 찾는 `target.text` 는 치환되지 않아
  **여전히 옛 의안까지 매칭된다.** 구분이 목적인데 구분이 안 된다.
- → **`target.text` 를 치환 대상에 추가**할 것. (`description` 도 넣으면 로그 가독성에 도움)

**부수 요청**: 미정의 var 는 지금도 `var '<name>' not defined` 로 즉시 실패하므로(같은 파일 96-98행)
오타 안전성은 이미 확보돼 있다. `--var` 도 같은 경로를 타면 된다.

### 2. 시나리오 `screenshot` 스텝은 계약상 best-effort 라 워밍업 용도로는 못 쓴다

**배경**: claude-in-chrome 의 새 탭은 **`screenshot` 을 한 번 찍기 전까지 `computer` 의 클릭·타이핑이
전부 조용히 버려진다**(도구는 성공을 반환한다). `browser_batch` 로 새 탭 3개에서 재현해 확정했다 —
횟수가 아니라 screenshot 이 게이트이고, `document.hidden` 과는 무관하다.

**문제**: 이 워밍업을 시나리오의 `screenshot` 스텝으로 넣었더니 executor 가 **그냥 건너뛰었다**
(SYSTEM_CONTRACT 의 "Take a screenshot … best-effort, once … If you can't capture it, just skip"),
그 결과 로그인 클릭이 통째로 무시돼 `seed-01b` 가 NOT_TESTED 로 죽었다.

**요청**: 워밍업을 **런타임 구조로** 보장할 것 — 탭 생성/첫 navigate 직후 러너가 screenshot 을 강제하거나,
executor 계약에서 "첫 screenshot 은 skip 불가"로 예외 처리. 지금은 프롬프트 문구로만 막아 뒀는데
(아래 3번) 모델이 계약의 다른 조항과 충돌로 읽으면 다시 건너뛸 수 있다.

### 3. 이미 이 저장소에 반영한 변경 (재작성·되돌림 방지용 기록)

`src/run/buildPrompt.ts` SYSTEM_CONTRACT 에 3개 규칙을 추가하고 `npm run build`·`npm test`(198/198) 통과.

| 규칙 | 근거 |
|---|---|
| 새 탭 navigate 직후 **screenshot 1장 필수** | 위 2번. 없으면 첫 입력이 유실된다 |
| **css 타깃이 우선** — find 결과와 대조하고 어긋나면 javascript_tool 로 조작 | find 는 자연어만 받아 **접근성 이름 없는 요소**(라벨 없는 textarea, 아이콘 버튼)는 css 로 지정해도 못 잡는다. `seed-01b` 가 이행내용 textarea 대신 수행자 콤보박스에 타이핑했다 |
| **좌표 클릭 금지**(더블클릭 포함, ref 로) | 스크린샷은 축소 + **레터박스**라 `imageWidth/innerWidth` 로 환산해도 틀리고, coordinate 는 스크린샷 좌표계라 `getBoundingClientRect()`(페이지 좌표)를 넣어도 틀린다. 실측 `#userId` 중심 DOM (1422,559) ↔ 스크린샷 (705,277). 비밀번호 칸 ~16px 빗나감 2회, 행 더블클릭 실패 3회 |

**부작용(의도된 것)**: 세 번째 규칙 때문에 executor 가 임기응변을 멈추고 **정직하게 실패**하게 됐다.
그 덕에 오래 숨어 있던 잘못된 셀렉터 2건이 드러났다 —
결재 버튼 별칭(`btn_primary` → 실제는 `btn_outline_primary`, 12곳)과
안건등록 러시아어 문서 업로드(`tr:nth-of-type(4)` → 실제는 같은 행의 두 번째 `td`).
둘 다 executor 폴백에 가려 **PASS 로 통과해 오던 것**이다. → 라벨이 PASS 라도 셀렉터가 맞다는 뜻은 아니다.

---

## 처리 결과 (2026-08-28)

문서 전체를 코드와 대조해 미해결 항목을 처리했다. `vitest` 221 통과, `tsc` 통과,
기존 시나리오 `validate` 130/130 무회귀.

### 코드로 처리

| 항목 | 처리 | 파일 |
|---|---|---|
| 2026-08-28 #1-A `--var k=v` | `run`·`validate` 양쪽에 반복 가능 플래그 추가. config `vars:` 를 덮어쓴다 | `src/cli.ts`, `src/scenario/vars.ts` |
| 2026-08-28 #1-B 내장 `${today}` | `YYYYMMDD`. 층위는 builtin → config → `--var` (뒤가 이김) | `src/scenario/vars.ts` |
| 2026-08-28 #1-C 치환 범위 | `url`·`value` 에 더해 **`target.text`·`target.description`** 치환. 바 형태 `${name}` 도 `${vars.name}` 과 같은 맵에서 해석(점이 없어 `${secrets.a.b}` 와 안 겹침) | `src/scenario/expandScenario.ts` |
| 2026-08-28 #2 워밍업 screenshot | ① 첫 `navigate` 스텝 줄에 워밍업 지시를 인라인으로 붙였다 — **스텝 번호는 그대로**(별도 스텝으로 넣으면 뒤 인덱스가 전부 밀려 결과 매핑이 깨진다). ② SYSTEM_CONTRACT 의 "screenshot 은 best-effort" 조항에 워밍업 예외를 명시(충돌 제거). ③ **탐지 추가** — 탭의 첫 screenshot 이전에 click/type 이 나가면 결과 JSON `warnings` 에 기록 | `src/run/buildPrompt.ts`, `src/run/streamParser.ts`, `src/run/runScenario.ts` |
| B0-1 좀비 executor | win32 에서 SIGKILL 단계를 `taskkill /pid <pid> /T /F` 로 교체. `child.kill()` 은 직계 자식만 죽여서 실제 작업을 하는 `claude` 손자 프로세스가 살아남았다 | `src/run/spawnExecutor.ts` |

**#2 의 한계 (정직하게)**: 러너는 `claude -p` 를 spawn 할 뿐 브라우저 도구를 직접 못 부른다.
따라서 워밍업을 **강제 실행**할 수단은 없다. 위 ①②는 강제력을 높인 것이고, ③은
"실제로 건너뛰었는지"를 사후에 드러내는 것이다. 탐지는 `computer` 도구의 `action`
열거값만 읽는다 — 스트림 파서의 "도구 입력은 저장하지 않는다"(시크릿 안전) 원칙은 유지.

### 가이드로 처리 (`skills/tester-mcp/document-guide.md`)

| 항목 | 반영 위치 |
|---|---|
| A4 셀렉터 우선순위 | Target 섹션에 6단계 표(id > 단일 class > 컨테이너+자식 > role+이름 > nth(지양) > description). nth 로 통과해 오던 실제 사고 예시 포함 |
| 2026-07-13 `:has()` groping | 같은 섹션 — 관계형 의사클래스 금지 + **아이콘 전용 버튼은 아이콘 클래스를 직접 타깃**(클릭은 버블링됨) |
| 2026-07-06 #1 전환 동반 toast | Ephemeral 섹션 — 제출이 페이지 전환을 유발하면 toast 대신 **사후 상태**(행 존재 / 버튼 소멸)를 assert |
| 2026-07-06 #2 CORS | Prerequisites — `targets.frontend` 오리진이 백엔드 CORS 허용목록에 있어야 함. 증상은 화면 없이 "Network Error" 뿐 |
| A6 출력 경로 | Running — `runs/` 는 **CWD 기준**, `--out-dir` 로 변경 |
| `--var`/`${today}`/치환 범위 | Running + Reuse 섹션. 마커로 실행 단위를 구분하는 이유와 예시 포함 |
| `warnings` 필드 | Result labels — 이 경고가 붙은 실패는 앱 버그로 보기 전에 재실행할 것 |

프로젝트 설치본 `.claude/skills/tester-mcp/` 이 2026-08-06 판으로 낡아 있어 함께 동기화했다
(전역 `~/.claude/skills/tester-mcp/` 는 자체 사본 없이 `tester-mcp document-guide` 를 호출하므로 영향 없음).

### 처리 안 한 것

| 항목 | 이유 |
|---|---|
| A1 `assert_toast` 전용 action | 사용자 보류 유지. A5(ephemeral 정책)가 상위 개념이고 이미 반영됨 |
| B0-3 executor 별 브라우저 **인스턴스** 격리 | 별도 프로필/유저데이터디렉터리는 `claude -p --chrome` 에 주입할 수단이 없다. 현재는 **탭 격리**(SYSTEM_CONTRACT 가 `tabs_create_mcp` 강제)로 대응 중 |
| 2026-08-28 #3 | 이미 반영된 것의 기록이므로 조치 불필요 |

### 대조 결과 — 이미 반영돼 있던 항목

A2(`login_as` 구현됨) · A3(native `select` → `fill`, 가이드 136행) · A5(`ephemeral:` 필드 + 계약 + 가이드) ·
B0-3 탭 격리 · B1(`last_tool`/`tool_count`/`executor_log`/`--verbose` + 요약 출력) ·
B2(stall 60s·groping 25연속 워치독) · B3(`preflight:` 사전 헬스체크) · 2026-07-06 부정 단언(`assert_not_visible`).
