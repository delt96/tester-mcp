# tester-mcp document-guide 개선 피드백 (수집)

실제 시나리오 작성·실행 중 발견한 문제점. document-guide/DSL/도구를 명확히 하기 위한 입력.
대상 작업: kg_ebill alert→toast 42건 검증.

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
