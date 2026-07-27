# E2E 진행 워크플로우 문서 분리 — 재사용 자산을 자동으로 쓰게 만들기

- 날짜: 2026-07-27
- 상태: 설계 승인 완료 (구현 계획 대기)
- 설계 기준(2026-07-21 사용자 위임 유지): **AI가 사용자 추가 요청 없이 tester-mcp만으로 재사용을 처리할 수 있어야 하며, 토큰을 낭비하지 않아야 한다.**
- 사용자 지시: 이미 작성된 시나리오는 고치지 않는다. 신규 작성분에만 적용한다.

## 1. 배경 — 재사용 규율이 무너진 실측

2026-07-21 재사용 기반(fragments/refs/vars/tags/validate)을 도입한 뒤, 07-22 작업은 규율을 지켰으나 07-27 작업에서 무너졌다.

| 시점 | 파일 | login_as | ref | 신규 셀렉터 등록 | 판정 |
|---|---|---|---|---|---|
| 07-22 | `billMng/assigned-toggle-{save,persist}` | O | 5 / 2회 | `bill_view_*` 4개 등록 | 모범 |
| 07-27 | `gvrnTrsfWork/` 5개 | O | 4회(confirm_* 만) | **0개** | 누락 |

07-27의 구체적 누락:

- **별칭이 이미 있는데 raw CSS로 재작성한 곳 13군데.** `smoke-sign-flow.yaml:14,15,19,21,23,24`(6), `letter-send-flow.yaml:27,33,34`(3), `send-resume.yaml:17,18`(2), `letter-modal-close-fix.yaml:26`(1), `signer-assign-ui.yaml:27`(1). 프로젝트 전체 raw 사용 19회 중 13회(68%)가 이 5개 파일에 몰려 있다.
- **신규 셀렉터 등록 0건.** `.gtw-stepper`, `.gtw-tabs`, `.gtw-user_row`, `.gtw_row_turn`, `.user-autocomplete-overlay .list-item` 등. 마지막 것은 2개 파일에서 8회 반복됐다.
- **URL 하드코딩 5개 파일 전부.** `EB_126d83ed`는 3개 파일에서 반복되며, 같은 bill이 이미 `tester-mcp.config.yaml:12`에 `legalact_doc_url`로 등록돼 있다.
- `validate` 는 35/35 통과했다. **파싱·확장 유효성만 보고 재사용 여부는 보지 않기 때문이다.**

## 2. 진단 — 개선된 지침이 저작 시점에 로드된 적이 없다

초기 진단은 "지침은 있었고(`SKILL.md:16-19`) 지켜지지 않았다 = 모드 전환 실패"였다. **이 진단은 틀렸다.** 설치본을 조사해 정정한다.

| 경로 | 최종 수정 | 재사용 키워드(`_selectors`/`_fragments`/`login_as`/`ref:`/`validate`) |
|---|---|---|
| `skills/tester-mcp/SKILL.md` (리포) | 2026-07-21 | 포함 |
| `.claude/skills/tester-mcp/SKILL.md` (**실제 로드되는 것**) | 2026-05-26 | **0건** |

설치본의 워크플로우는 3단계(Write → Run → Branch)로, "Check reuse assets first"도 validate 단계도 없다. 시나리오 경로도 구버전(`scenarios/<area>/`)이다. 내가 근거로 인용한 `SKILL.md:16-19`는 리포 파일이지 저작 시점에 로드된 파일이 아니었다.

근본 원인은 배포 배관이다:

- `init.ts:117-128`이 **SKILL.md 한 파일만** 복사한다(`document-guide.md`는 `loadGuide.ts:10-23`로 패키지 내부에서 읽는 별도 경로).
- 리포 문서를 고쳐도 `tester-mcp init`을 다시 돌리기 전엔 설치본에 반영되지 않는다. 07-21 개선분이 2개월간 그 상태로 방치됐다.
- 게다가 `init.ts:131-133`이 기존 config를 무조건 덮어쓰므로(`renderConfigYaml`은 `targets`/`runner`만 출력), 재설치하면 `tester-mcp.config.yaml:9-12`의 `vars`가 소실된다. **재설치가 안전하지 않아서 아무도 재설치하지 않는 구조였다.**

### 유보 — 확인하지 못한 것

07-27 파일들은 `login_as`를 100% 쓰고 `confirm_popup`/`confirm_accept` ref도 썼다. 낡은 SKILL.md만 봤다면 `login_as`의 존재 자체를 몰랐을 것이므로, 저작 세션이 기존 시나리오 파일을 보고 패턴을 모방했을 가능성이 높다. **어느 문서를 실제로 읽었는지는 세션 기록이 없어 확인하지 못했다.** 확실한 것은 "체계적 재사용 지침이 활성 스킬에 없었다"까지이며, "그래서 누락이 발생했다"는 정황 추론이다.

따라서 §6 Phase 3 rule 2("신규 화면 = 신규 셀렉터" 오인 차단)는 **관측된 증상에 대한 예방책으로는 유효하되, 확증된 원인에 대한 처방은 아니다.** 실제 처방의 1순위는 배포 동기화다.

## 3. 결정 요약

| # | 결정 | 근거 |
|---|---|---|
| 1 | 재사용 규율은 도구(기능) 변경 없이 문서로 해결 | 사용자 선택 |
| 1b | 단 **배포 배관은 고친다** — `init`이 스킬 디렉토리의 `.md` 전부를 복사하고, 기존 config를 덮어쓰지 않게 한다 | §2. 이건 기능 추가가 아니라 버그 수정이며, 이걸 안 고치면 workflow.md가 설치 위치에 존재하지 않아 나머지 결정이 전부 무효가 된다 |
| 2 | E2E 진행 절차를 `skills/tester-mcp/workflow.md`로 **분리 신설** | SKILL.md는 스킬 invoke마다 전문이 로드됨 → 절차·게이트·체크리스트를 넣으면 모든 세션 비용 증가 |
| 3 | 문서 경계 = **"절차는 workflow.md, 문법은 document-guide.md"** | `document-guide.md:85-118`(Reuse 섹션)은 이미 문법 위주라 거의 손대지 않는다. 이동 대상은 SKILL.md의 절차 문구다 |
| 4 | SKILL.md에는 진입 지시만 남기고 기존 절차 문구(`SKILL.md:14-32`)는 **이동**(순증 아님) | SKILL.md 분량은 오히려 감소 |
| 4b | `SKILL.md:19`의 기존 fragment 기준 "repeated across ≥3 scenarios"는 **폐기하고** 결정 #7로 교체 | §7.1 실측이 길이 기반 임계값을 부정 |
| 5 | 게이트(Phase 3)에는 **기계적 검사 2개만** — alias sweep, 신규 commons 등록 | 판단을 요구하는 규칙은 상황에 따라 합리화된다(07-27이 그 사례). 체크리스트가 길면 앞 항목만 수행되는 경향 |
| 6 | 게이트 통과 전 "작성 완료" 선언 금지 | 완료를 보고하려는 압력이 강한 지점에 게이트를 두면 실효가 있다 |
| 7 | fragment 추출은 **강제하지 않고 보고만** (≥8스텝 × ≥2파일) | §7.1 실측 — 기계적 임계값이 성립하지 않음 |
| 8 | tags는 게이트에 넣지 않음. 파괴성은 `precondition` 선언 + 실행 방식으로 처리 | §7.2 실측 — 현재 CLI 필터로는 안전장치가 될 수 없음 |
| 9 | Phase 5에서 **실행 통과한 셀렉터만** `_selectors.yaml`에 환류 | 파일 헤더가 스스로를 "verified selector cache"로 정의(`_selectors.yaml:1`) |
| 10 | 산출 문서 텍스트는 영어 (설계 문서인 본 스펙만 한글) | 배포 원칙 10 |

## 4. 문서 역할 분리

| 문서 | 로딩 시점 | 담는 것 |
|---|---|---|
| `SKILL.md` | 스킬 invoke마다 (항상) | 언제 쓰는가, CLI 개요, secrets, workflow.md 진입 지시 |
| `workflow.md` (신규) | 시나리오를 쓰거나 고칠 때 | Phase 절차, 재사용 게이트, 결과 분기 |
| `document-guide.md` | DSL 문법이 필요할 때 | 필드·액션·target 전략·치환 문법 |

`document-guide.md`는 실질적으로 변경이 없다. Reuse 섹션(`:85-118`)은 디렉토리 구조·nearest-ancestor 탐색·fragment 정의 문법·치환 타이밍으로 구성돼 이미 문법 레퍼런스다. 이관 대상은 `SKILL.md:16-19`의 절차 문구("Check reuse assets first", 별칭 등록 기준, fragment 추출 기준)이며, 이 중 fragment 기준은 이관이 아니라 §7.1에 따라 교체된다.

SKILL.md 진입 지시:

```markdown
## Workflow

E2E work runs on a fixed workflow. **Read `workflow.md` (same directory) before you
write or edit any scenario file.** It holds the phases, the reuse gate, and the
result-handling branches. Authoring from this file alone skips the gate — that is
how inline selectors and duplicated sequences get in.
```

조건을 "시나리오를 쓰거나 고치기 전"으로 한정한 이유: 결과만 확인하는 작업까지 workflow.md를 로드하면 토큰 낭비다.

## 5. workflow.md Phase 구성

```
Phase 1  Load the reuse surface     _selectors.yaml + _fragments (앱 소스 grep보다 먼저)
Phase 2  Design & write             파괴성 판정 포함
Phase 3  Reuse gate                 기계적 2항목 · 통과 전 "완료" 선언 금지
Phase 4  Validate → run             파괴적이면 디렉토리 run 금지, 파일 지정
Phase 5  Judge & feed back          결과 판정 + 검증된 셀렉터 환류
```

Phase 1·2·4·5는 기존 `SKILL.md:14-32`의 4단계 워크플로우를 옮겨 재배치한 것이다. 신규는 Phase 3뿐이다.

## 6. Phase 3 — 재사용 게이트 (핵심)

```markdown
### Phase 3 — Reuse gate

Two mechanical checks. Not a judgement call — run them.

1. **Alias sweep.** Grep the files you just wrote for every `css` value in
   `_selectors.yaml` (one alternation pattern covers all). Each hit is a defect:
   replace the inline target with `{ ref: <alias> }`. Sole exception — a hit needing
   scoping the alias cannot express (e.g. `.popup_footer` + alias css, where
   `{...alias, ...local}` overwrites it). Keep inline, say why in `description`.
2. **Register new commons.** A NEW selector that is framework/layout chrome
   (`.p-*`, shared button/table/dialog classes) goes into `_selectors.yaml` now.
   These are identical across screens: a new screen never means new commons.
   Screen-specific selectors (`.gtw-*`) get registered when a 2nd scenario uses them.

Report from the grep output, not from memory:
`reuse: N aliases applied, M registered, K deliberate inline`

Do not say the scenario is written/ready before this passes.

Also flag (do NOT auto-extract): a step sequence repeated across ≥2 files and ≥8
steps long. Report it and let the user decide — fragment extraction needs param
design and is awkward to undo.
```

설계 근거:

- **1번은 결정적이다.** 별칭의 css 값을 시나리오에서 역으로 찾는 방식으로, 2026-07-27 대화에서 실제로 실행해 누락 13곳을 전수 검출했다. `.p-` 프리픽스 grep 같은 부분 규칙은 `button.v_btn.btn_primary.btn_md`(btn_primary_md), `.v_table.table_list`(datatable) 계열을 놓치므로 채택하지 않는다.
- **2번은 §2의 오인을 직접 겨냥한다.** "신규 화면 = 신규 셀렉터"를 부정하는 문장을 규칙 본문에 명시한다.
- **보고 형식을 grep 출력 기반으로 못박은 이유**: 검사를 실제로 수행하지 않고 그럴듯한 수치를 생성할 위험이 있다.
- `signer-assign-ui.yaml:27`의 `.popup_footer button.v_btn.btn_primary.btn_md`는 정당한 예외다. `expandScenario.ts:52-55`의 `{...alias, ...local}` 병합은 로컬 `css`가 별칭 `css`를 덮어쓰므로 스코프를 추가할 수 없다. 예외 사유를 `description`에 남기게 한다.

## 7. 기각한 대안과 실측 근거

### 7.1 fragment 추출 강제 — 기각

초안은 "≥2 파일 AND ≥4 스텝이면 fragment 추출"이었다. 전체 시나리오의 파일 간 반복 시퀀스를 전수 측정한 결과 기각한다.

```
길이 히스토그램(≥3스텝, ≥2파일, maximal): {3:4, 4:6, 5:5, 6:2, 7:2, 8:1, 10:1, 11:2}
≥4스텝 & ≥2파일 = 19건 · 정확히 2파일 = 15건
```

- 초안 기준 적용 시 **추출 대상 19건**. 시나리오 35개에 프래그먼트 21개는 과잉이다.
- 잡히는 내용의 상당수가 **이미 별칭으로 압축이 끝난 시퀀스**다. 예: `billRegWait` 02·03·04·05의 5스텝 공유 시퀀스는 전 스텝이 `ref=`다. 여기에 fragment를 씌우면 압축 이득은 미미하고 시나리오 가독성만 떨어진다.
- 즉 **별칭 재사용과 fragment 추출은 부분적으로 대체 관계**이므로, 길이만으로 세운 기준은 이미 정리된 코드를 다시 건드리게 만든다.
- 진짜 추출 대상인 "별칭으로도 안 풀리는 잔여 중복"은 기계적으로 판정되지 않는다. 또한 fragment 추출은 params 설계·명명이 필요한 설계 판단이며 되돌리기 번거롭다.

**대체 결정**: 추출을 강제하지 않고 **≥8스텝 × ≥2파일**만 보고한다. 이 임계값은 전체에서 4건만 걸러내 노이즈가 아니며, 07-27의 InsertLetter 11스텝 중복(`letter-send-flow.yaml` × `letter-modal-close-fix.yaml`, 전 스텝 raw css)은 정확히 걸린다.

### 7.2 tags를 파괴성 안전장치로 사용 — 기각

```
9/35 (26%) 가 쓰기/파괴 신호 보유 · 그중 5건은 precondition에 "⚠ 파괴적" 이미 선언
tags: 전 시나리오 0건
```

위험은 실재한다. `SKILL.md:28`이 디렉토리 통째 run을 권장하는데, `gvrnTrsfWork/`를 통으로 돌리면 5개 중 3개가 비가역 워크플로 전환을 실행한다.

그러나 `tags.ts:6-9`의 `matchesTagFilter`는 **OR 포함 필터일 뿐 제외 필터가 없다.** `--tag safe`로 안전한 것만 돌리려면 35개 전부에 태그를 달아야 하는데, 기존 파일을 고치지 않기로 했으므로 기존 30개가 필터에서 빠져 오히려 위험하다. 파괴적인 것에만 `destructive`를 달아도 제외 필터가 없어 무용하다. `--exclude-tag` 추가는 도구 변경이라 결정 #1의 범위 밖이다.

**대체 결정**: 이미 작동 중인 관행(`send-resume.yaml:8`의 `⚠ 파괴적: 전송 시 의안 워크플로 실전환(비가역)`)을 표준으로 규칙화하고, Phase 2에 파괴성 판정을, Phase 4에 **"파괴적 시나리오는 디렉토리 run 금지, 파일 지정 run"** 을 넣는다.

### 7.3 validate에 재사용 lint 추가 — 범위 밖

기술적으로는 가장 강한 처방이다. `SKILL.md:26-28`이 validate를 필수 관문으로 두고 있어 검사를 붙이면 자동으로 걸린다. 다만 사용자가 도구 변경 대신 문서 해결을 선택했다. 문서 방식의 효과가 부족할 경우 재검토 대상이다.

## 8. 검증 방법

1. **배포 배관** (자동 테스트): `skillAssetNames`가 SKILL.md 단독이 아니라 `.md` 전부를 반환하는지, 비마크다운을 거르는지. `tests/init.test.ts`.
2. **회고 검증**: Phase 3의 alias sweep을 07-27 `gvrnTrsfWork/` 5개 파일에 적용해 13곳이 전수 검출되는지 확인한다(2026-07-27 대화에서 이미 1회 확인). 문서의 절차 서술만으로 같은 결과가 재현되는지 본다.
3. **동기화 확인**: `.claude/skills/tester-mcp/`에 `SKILL.md`와 `workflow.md`가 최신으로 존재하는지.
4. **다음 신규 시나리오 작성 시 준수 여부 관찰**: `reuse:` 보고 라인이 출력되는지, raw CSS 재작성이 0인지.
5. 기존 35개 파일은 대상이 아니다(사용자 지시).

## 9. 비범위 (non-goals)

- tester-mcp 코드 변경 전반 — validate lint, `--exclude-tag`, `assets` 명령, `--fix` 자동 치환
- 이미 작성된 35개 시나리오의 소급 수정
- 별도 스킬 신설 — `tester-mcp` 스킬 하나로 유지하고 문서만 분리
- 작성용/실행용 워크플로우 2분할 — 실제 작업은 작성→실행→수정으로 순환하므로 단일 문서가 적합
- 작업별 체크리스트 md 파일 생성 — 저장소에 산출물이 누적됨
