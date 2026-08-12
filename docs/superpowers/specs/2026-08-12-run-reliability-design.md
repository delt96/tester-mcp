# 실행 신뢰성 설계 — 결과 salvage · preflight · 부정 단언 · 스크린샷 증거

- 날짜: 2026-08-12
- 상태: 설계 승인됨 (0번 salvage는 선행 구현 완료)
- 설계 기준(사용자 명시): **AI가 사용자 추가 요청 없이 tester-mcp만으로 재사용을 처리할 수 있어야 하며, 토큰을 낭비하지 않아야 한다.**
- 발단: eBill seed 체인 12건 실행 검증에서 나온 피드백. 원본은 Obsidian
  `Projects/kg_ebill_service/docs/tasks/2026-08-12-seed시나리오-실행검증.md` §5·§6.

## 1. 배경 — 실행은 성공했는데 결과가 틀렸다

seed 체인은 의안 1건을 1000 → 3300(공포)까지 자동 전진시켜 완주했다. 그런데 **도구가 결과를
잘못 보고하거나, 시나리오와 무관한 이유로 실행을 통째로 날린 사례**가 같이 나왔다.

| 증상 | 실측 | 손실 |
|---|---|---|
| executor가 `"index": 35-36` 범위 표기를 emit | `seed-02`·`seed-05` 2회 | 실제 PASS가 NOT_TESTED로 기록. handoff_notes까지 유실 |
| 다른 앱이 IPv6 `[::1]:5173` 선점 | `law_alarm` dev 서버 | executor가 엉뚱한 앱을 보고 "로그인 실패" 오진 |
| 백엔드(8081) 다운 | Network Error 토스트 | 실행 다 돌고 나서야 드러남 |
| "목록에서 사라졌는가"를 표현할 DSL 부재 | `seed-03`·`05`·`09` | 총건수 검증이 **항상 통과하는 헛단언**이 됨 |
| 스크린샷이 파일로 안 남음 | `seed-05` | 엉뚱한 의안을 부의하고도 PASS. DB 대조 전엔 몰랐음 |
| executor가 자기 행동의 부수효과를 오독 | `seed-08` | 결재해서 대기함에서 빠진 것을 "등록 안 됨"으로 읽고 PARTIAL |

환경 요인(2·3행)만으로 NOT_TESTED 22건 중 상당수가 발생했다. **시나리오를 한 글자도 안 고쳐도
사라지는 실패**에 executor 스폰 비용(5분 × N)을 전부 지불한 셈이다.

## 2. 결정 요약

| # | 결정 | 기준 적용 근거 |
|---|---|---|
| 1 | 파싱 실패 시 raw에서 status/evidence/handoff_notes 회수 + `parse_repaired` 표시 | 재실행 1회 = executor 스폰 1회. 회수가 훨씬 싸다 |
| 2 | status는 `"steps"` 키 **앞부분에서만** 읽는다 | steps 안의 per-step status를 승격시키면 실패한 실행이 PASS로 둔갑 |
| 3 | 프롬프트에 "index는 단일 정수, 범위 금지" 명시 | 예방이 회수보다 싸다. 둘 다 한다 |
| 4 | 스크린샷 경로는 **최상위 `screenshots`**, `steps[]` 안이 아님 | `steps[]`는 #1이 다루는 바로 그 취약 지점. 배열이 깨지면 경로도 유실 |
| 5 | `assert_not_visible` 신설 (10번째 액션) | 부정 단언 부재로 우회 경로를 만들어야 했던 시나리오 3건 |
| 6 | settle 규약은 **계약 문구로만** 강제 | 사용자 결정. 리스크는 §7 |
| 7 | preflight는 `preflight:` 리스트로 선언 | 프론트는 title, 백엔드는 상태코드 — 검사 종류가 달라 항목별 선언이 솔직함 |
| 8 | preflight 실패 = 즉시 종료, executor 0회 스폰, 결과 파일 없음 | 동일 내용 결과 파일 N개는 AI 판독 비용. 실행이 안 일어난 것을 run으로 기록하지 않는다 |
| 9 | preflight URL은 **정규화하지 않고 그대로** fetch | `127.0.0.1`로 바꾸면 크롬이 보는 `::1`과 다른 대상을 검사 — 잡으려던 버그를 정확히 놓친다 |
| 10 | 스크린샷은 항상 저장 + 러너가 `runs/`로 복사 | 스텝을 넣은 것 자체가 "보고 싶다"는 뜻. executor 임시경로는 수명이 불확실 |
| 11 | 헛단언 정적 린트는 **이번 범위 밖** | 정적 YAML 분석은 런타임/DSL과 독립 서브시스템. 별도 스펙 |

## 3. 결과 봉투 (ScenarioResult) — 최종 형태

이번 설계가 봉투를 건드리는 지점을 **한 번에** 확정한다. 이후 작업이 봉투를 다시 열지 않게 하는 것이
설계 선행의 목적이었다.

```jsonc
{
  "status": "PASS",
  "evidence": ["..."],
  "screenshots": ["C:\\...\\runs\\<run_id>\\<scenario_id>\\03a-referral-list.png"],
  "steps": [{ "index": 3, "action": "click", "status": "PASS" }],
  "parse_repaired": true,          // salvage 경로로 복구된 결과
  "handoff_notes": "...",
  "raw_executor_text": "..."
}
```

- `parse_repaired?: boolean` — **구현 완료** (§4)
- `screenshots?: string[]` — 신규. 러너가 복사 후 최종 경로로 재작성
- `StepResult.screenshot` — 한 번도 채워진 적 없는 죽은 필드. **제거**(제거 전 참조 grep)

`writeResult`·`redactSecrets`는 객체를 통째로 JSON 왕복시키므로 필드 화이트리스트가 없다.
새 필드는 배선만 하면 결과 파일까지 그대로 도달한다(확인함).

## 4. 결과 salvage (선행 구현 완료)

`parseExecutorResult`가 `JSON.parse` 실패 시 즉시 폐기하던 것을, raw 텍스트에서 봉투 필드를
회수하도록 바꿨다.

```
"status" | "evidence" | "handoff_notes" | "not_tested_reason"  → 회수
"steps"                                                        → 폐기(신뢰 불가)
parse_repaired: true                                           → 복구 표시
```

**안전장치**: status는 `"steps"` 키가 나오기 전 구간에서만 매칭한다. steps 배열 안의
`"status": "PASS"`는 개별 스텝의 것이지 실행 전체의 판정이 아니며, 이걸 승격시키면 실패한 실행이
PASS로 둔갑한다. 봉투 status가 없으면 salvage하지 않고 NOT_TESTED를 유지한다 — 테스트로 고정했다.

`buildPrompt`의 출력 형식에 예방 문구를 추가했다:

> `"index"` is a single integer — the step number. NEVER write a range like 35-36: it is not valid
> JSON, and the whole result (including your handoff_notes) is lost. Merged two steps? Report the first one.

## 5. `assert_not_visible` — 10번째 액션

```yaml
- { action: wait_for,           target: { css: ".board_list" } }
- { action: assert_not_visible, target: { css: ".board_list tr[data-bill='6-6977/26']" } }
```

**계약(SYSTEM_CONTRACT):**

- PASS = 대상이 DOM에 없거나, 있어도 보이지 않음(`display:none` / `visibility:hidden` / 크기 0)
- FAIL = 보임
- **1회만** 확인. 재시도 금지 (기존 fast self-bail과 일관)
- **settle 규약** — "아직 그려지지 않은 페이지는 이 단언을 거저 통과시킨다. 영역이 안정된 뒤에만
  판정하라. 로딩 중이면 PASS가 아니라 NOT_TESTED다."

렌더링: `Assert NOT visible: [css .board_list tr[...]]`

## 6. preflight

```yaml
targets:
  frontend: http://localhost:5173
  backend:  http://localhost:8081
preflight:
  - { url: "${targets.frontend}", expect_title: "eBill" }
  - { url: "${targets.backend}/v3/api-docs", expect_status: [200, 401] }
```

| 항목 | 규칙 |
|---|---|
| 치환 | `${targets.frontend}` / `${targets.backend}` **둘뿐**. 새 표현식 문법 없음. 참조한 target이 config에 없으면 파스 타임 에러 |
| `expect_title` | `<title>` **부분 일치, 대소문자 구분**. 다른 앱 선점 감지가 목적이라 충분. 생략 시 제목 무검사 |
| `expect_status` | 숫자 또는 배열. 생략 시 상태코드 무검사 |
| 둘 다 생략 | 연결 가능 여부만 검사(응답이 오면 통과) |
| 타임아웃 | 5초. 죽은 서버를 오래 기다릴 이유가 없다 |
| 실패 | exit≠0 + stderr에 기대 vs 실측. executor 0회 스폰, 결과 파일 없음 |
| 미선언 | `preflight:` 블록이 없으면 무동작 (기존 config 하위호환) |
| 탈출구 | `--no-preflight` |

에러 메시지 형식:

```
preflight failed: http://localhost:5173 — expected <title> to contain "eBill", got "건축법규 자동검토"
preflight failed: http://localhost:8081/v3/api-docs — expected status 200|401, got ECONNREFUSED
```

**백엔드가 401이면 살아있다**는 규칙은 코드에 박지 않고 config가 선언한다. eBill은 인증 필터
(ApiKeyFilter → JwtFilter) 때문에 401이 생존 신호지만, 다른 프로젝트는 다르다.

신규 모듈 `src/preflight/checkPreflight.ts` — fetch를 주입받는 순수 함수. CLI가 executor 스폰 전에
호출한다. `engines: node>=20`이라 전역 `fetch`로 충분하고 의존성 추가가 없다.

## 7. 계약·문서 정정

| 대상 | 내용 |
|---|---|
| `document-guide.md` | `description`은 fallback이면서 동시에 **기대값**이다 — 셀렉터가 `ref`로 확정돼 있어도 executor가 화면과 대조해 어긋나면 중단한다. 단 이 검사는 결정론적이지 않으니 내용 검증은 `assert_value`로 한다 |
| `SYSTEM_CONTRACT` | 스텝이 명시하지 않은 기대를 만들지 말 것. 특히 **네가 조작한 항목이 목록에서 사라진 것은, 그대로 있어야 한다고 단언한 스텝이 없는 한 실패가 아니다** |
| 양쪽 | `assert_not_visible` 추가. 액션 9개 → **10개** |
| `scenarios/ebill/seed/README.md` | 액션 개수 갱신 |

`description` 항목은 문서 두 개가 서로 다른 말을 하던 것을 맞추는 정정이다.
`document-guide.md:181,191`은 "last-resort fallback"이라고만 했고, `seed/README.md:100-102`에는
이미 "사실과 맞아야 한다"가 적혀 있었다. AI가 읽는 정본은 전자다.

P3 문구는 **관대해지라는 지시가 아니다.** "사라진 것도 성공의 증거일 수 있다"고 쓰면 진짜 실패도
성공으로 합리화하는 편향이 생긴다. 문제는 executor가 관대하지 못한 게 아니라 시나리오에 없는 기대를
스스로 만든 것이므로, 처방은 반대 방향(기대를 만들지 말 것)이어야 한다.

## 8. 파일 변경

| 파일 | 변경 | 상태 |
|---|---|---|
| `src/result/parseExecutorResult.ts` | salvage 경로 | **완료** |
| `src/result/types.ts` | `parse_repaired` / `screenshots` 추가, `StepResult.screenshot` 제거 | 일부 완료 |
| `src/run/runScenario.ts` | 새 필드 배선 + 스크린샷 복사 호출 | 일부 완료 |
| `src/run/buildPrompt.ts` | index 정수 명시 / `assert_not_visible` / P3 / `screenshots` 출력 형식 | 일부 완료 |
| `src/scenario/types.ts` | `assert_not_visible` Step, `screenshot.save` 제거 | 신규 |
| `src/scenario/actions.ts` | 렌더러 추가 | 신규 |
| `src/config/loadConfig.ts` | `preflight:` 파싱 + `${targets.*}` 치환 | 신규 |
| `src/preflight/checkPreflight.ts` | 순수 검사 함수 | 신규 |
| `src/cli.ts` | 스폰 전 preflight 호출, `--no-preflight` | 신규 |
| `skills/tester-mcp/document-guide.md` | §7 전부 | 신규 |
| `scenarios/ebill/seed/README.md` | 액션 개수 | 신규 |

## 9. 테스트

- **preflight** — 제목 불일치 / 상태코드 불일치 / 연결 실패 / 통과 / `${targets.*}` 치환 / 미선언 시 무동작 (fetch 주입)
- **salvage** — 완료(7건). 범위 index 회수, `parse_repaired`, evidence·handoff_notes 회수,
  steps 폐기, **per-step status 미승격**, 회수 불가 시 NOT_TESTED 유지
- **`assert_not_visible`** — parseScenario 수용, renderStep 문자열, 계약 문구
- **스크린샷** — 러너 복사, 결과 JSON 경로 재작성, 복사 실패 시 원경로 유지
- **계약 문구** — 기존 `SYSTEM_CONTRACT` 테스트 패턴대로 정규식 assert

## 10. 리스크

- **settle이 계약 문구뿐이라 강제력이 없다.** 가이드가 이미 "`assert_visible`은 존재 확인 전용,
  내용 검사에 쓰지 말 것"이라 써뒀는데도 헛단언 3건(`seed-03` `.board_info`, `seed-05` 2차,
  `letter/temp-save-restore`)이 나왔다. 산문 규약만으로는 안 지켜짐이 실측됐으므로, 작성자가
  `wait_for`를 빼먹으면 `assert_not_visible`이 새 형태의 헛단언이 될 수 있다.
  **사용자 결정으로 수용**하고 §12의 별도 스펙에서 다룬다.
- preflight fetch가 프록시·사설 인증서 환경에서 오탐할 수 있다 → `--no-preflight`
- 스크린샷 상시 저장은 `save_to_disk`가 같은 호출의 파라미터라 라운드트립 추가는 없으나 디스크
  사용량이 늘어난다
- `parse_repaired`는 표시일 뿐 검증이 아니다. 복구된 PASS는 여전히 executor의 자기보고이며,
  중요한 판정은 DB 대조로 확인해야 한다

## 11. 라이브 검증 결과 (2026-08-12)

§10에 미검증으로 남겼던 항목이 전부 해소됐다.

| 항목 | 결과 | 증거 |
|---|---|---|
| preflight가 죽은 대상을 잡는가 | **YES** | 백엔드가 실제로 내려간 상태에서 `preflight failed: .../v3/api-docs — request failed — fetch failed (connect ECONNREFUSED ::1:8081; connect ECONNREFUSED 127.0.0.1:8081)`, exit 2, executor 0회 스폰 |
| `--no-preflight` 가 건너뛰는가 | **YES** | 없는 시나리오 경로로 판별 — 플래그 없으면 preflight 에러가, 있으면 시나리오 경로 에러가 먼저 난다 |
| `save_to_disk` 가 파일을 남기는가 | **YES** | `runs/2026-08-12T08-36-58/probe-a-absent/screenshot-1786523859504-0.jpg` (30,835 bytes). 결과 JSON의 `screenshots`가 executor 임시경로가 아닌 **복사된 최종 경로**를 가리킨다. 이미지는 로그인 화면 전체가 정상 렌더된 상태 |
| `assert_not_visible` 가 판별력이 있는가 | **YES** | 같은 페이지에 대해 없는 요소(`#no-such-element-xyz`) → **PASS**, 보이는 요소(`#userId`) → **FAIL**. 항상 통과하는 헛단언이 아님이 양방향으로 증명됨 |

`expect_title` 실측값은 `Мыйзам документтерин башкаруу системасы` 였다. 플랜이 추정으로 적었던
`eBill`은 **틀렸다** — 추정값이라고 명시해 둔 덕에 걸렀다.

**Node의 fetch 오류 형태 (실측).** `fetch`는 `"fetch failed"`만 던지고 진짜 errno를 `cause`에
감춘다. 그 `cause`는 `AggregateError`이고 **자기 `message`는 빈 문자열**이며, errno는 `.errors`
배열에 해석된 주소마다 하나씩 들어 있다. 단순히 `cause.message`만 읽으면 아무것도 안 나온다 —
단위 테스트는 통과하는데 실제로는 진단 정보가 0인 상태가 됐었다. 주소를 전부 보여주도록 고쳤고,
`::1`과 `127.0.0.1`이 나란히 찍히는 것이 IPv6 전용 리스너를 식별하는 근거가 된다.

### 한계 — preflight는 시점 검사다

seed-03 실행에서 드러났다. preflight 통과 시점에 백엔드는 401(정상 생존)이었는데, executor가
로그인하는 시점에는 죽어 있어 `Network Error` 로 NOT_TESTED가 났다. **preflight는 실행 시작 전
상태만 보증하며, 실행 중에 죽는 대상은 막지 못한다.** 낭비를 줄이는 장치이지 없애는 장치가 아니다.

## 12. 범위 밖 (후속 스펙 후보)

**헛단언·거짓양성 정적 린트.** 원본 §2-2가 "DSL에 부정 단언이 없는 것보다 이쪽이 더 위험하다"고
결론지은 계열이다. `seed-05` 1차가 목록 전체에 assert하고 `tr:first-child`를 조작해 **남의 의안
6-6979/26을 1500→1900까지 밀어버렸다.** 단언 대상과 조작 대상이 갈라지면 시나리오는 실패하는 게
아니라 **틀린 것을 맞다고 보고**한다.

후속 스펙에서 다룰 것:

1. `:first-child` / `:nth-child`로 행을 집는 스텝 앞에 검색 필터가 없으면 `validate` 경고
2. `assert_visible` 대상이 컨테이너·input 등 "항상 존재하는 것"이면 경고
3. 기존 시나리오 일괄 점검 (원본 §8-3 숙제 — `letter/temp-save-restore` 2건, availability 계열 포함)

정적 YAML 분석은 런타임·DSL과 독립 서브시스템이라 이번 스펙에 묶으면 초점이 흐려진다.
