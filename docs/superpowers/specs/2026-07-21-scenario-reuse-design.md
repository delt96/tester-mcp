# 시나리오 재사용 기반 설계 — 프로젝트 단위 저장 + 파스타임 확장

- 날짜: 2026-07-21
- 상태: 설계 승인 대기
- 설계 기준(사용자 명시): **AI가 사용자 추가 요청 없이 tester-mcp만으로 재사용을 처리할 수 있어야 하며, 토큰을 낭비하지 않아야 한다.**

## 1. 배경 — 중복 실측 데이터

시나리오 26개(455스텝) 분석 결과:

| 중복 | 규모 | 영향 |
|---|---|---|
| 로그인 5스텝 블록 | 26/26 시나리오, 130스텝(29%) | 로그인 UI 변경 시 26개 파일 수정 |
| 화면 진입 체인(외부문서 열기, 집행수신함 검색 등) | 3~4개 시나리오 × 6스텝 | 도메인 흐름 변경 시 다발 수정 |
| PrimeVue 위젯 셀렉터(confirmpopup, toast, datatable 등) | 3~8회 재작성 | UI 리팩토링 비용이 시나리오 수에 비례 |
| 환경 종속 URL(`?id=EB_...&taskId=...`) | 4곳 | feature 등 다른 환경에서 즉시 깨짐 |

`login_as` 필드는 DSL 문서에 예약돼 있으나 미구현(파스만 되고 무시됨).

## 2. 결정 요약

| # | 결정 | 기준 적용 근거 |
|---|---|---|
| 1 | 시나리오를 `scenarios/<project>/<area>/`로 프로젝트 단위 저장 (도구 리포 내) | 회귀 스위트 자산으로 프로젝트별 관리 |
| 2 | 재사용은 전부 **파스타임 확장** — executor는 지금처럼 완전히 펼쳐진 스텝만 받음 | executor 무변경 → 위험 격리, 실행 토큰 불변 |
| 3 | fragment 파라미터는 `{{param}}` 문법 | `${secrets}`(런타임)와 시각 구분 → AI 오작성으로 인한 실패 런(최대 토큰 낭비) 예방 |
| 4 | fragment 중첩 금지 | 시나리오 이해에 필요한 파일이 최대 2개로 고정 |
| 5 | `login_as`를 login fragment 호출 sugar로 실제 구현 | 최빈 패턴(26/26)을 톱레벨 1줄로 |
| 6 | `_selectors.yaml` = 셀렉터 별칭 + **검증된 셀렉터 캐시** | 세션마다 Vue 소스 재grep(최대 저작 토큰 비용)을 파일 1개 읽기로 대체 |
| 7 | `tester-mcp validate` 명령 신설 | 실패 executor 런(수만 토큰)을 파스타임 검증(0 토큰)으로 대체 |
| 8 | `tags` + `run --tag` 필터 | 회귀 스위트 선별 실행 |
| 9 | `vars:`는 config에, `${vars.*}`로 참조 | 환경 종속 데이터 분리 — 매니페스트 없이 이식성 확보 |
| 10 | 도구 표면 텍스트(가이드 추가분, CLI 에러, validate 출력)는 영어 | 배포 원칙 10 |

## 3. 저장 구조

```
scenarios/
  ebill/                      # 프로젝트 단위
    _fragments/               # 공통 스텝 조각
      login.yaml
      open-ext-doc.yaml
    _selectors.yaml           # 셀렉터 별칭·캐시
    auth/  letter/  billMng/  billRegWait/  billLink/  workRequest/
```

- `_` 프리픽스 파일·폴더는 `expandScenarioPaths`의 디렉터리 수집에서 제외 (시나리오 아님).
- `_fragments/`·`_selectors.yaml` 탐색: **시나리오 파일 위치에서 상위 디렉터리로 올라가며 가장 가까운 것 사용**(nearest-ancestor). 영역별 오버라이드 가능, 시나리오가 어느 깊이에 있어도 동작.
- config는 기존 방식 유지: `tester-mcp.config.yaml`(local), `tester-mcp.config.feature.yaml`(feature). 프로젝트가 늘면 `tester-mcp.config.<project>.yaml` 네이밍.

## 4. 파스타임 확장 파이프라인

```
YAML 로드
→ login_as 확장 (login fragment를 steps 앞에 삽입)
→ use: fragment 확장 ({{param}} 치환)
→ ref: 셀렉터 별칭 병합 (로컬 필드가 우선)
→ ${vars.*} 치환 (config.vars, url·value 대상)
→ [런타임, 기존 유지] ${secrets.*} 치환
```

치환 시점이 문법으로 구분된다: `{{param}}` = fragment 파라미터(파스타임), `${vars.*}` = 환경 변수(파스타임), `${secrets.*}` = 시크릿(런타임).

모든 확장 오류(미정의 fragment/param/ref, 순환 대신 중첩 감지, `with`에 선언 안 된 파라미터)는 **파스 에러로 즉시 실패** — executor를 띄우기 전에 검출한다. 에러 메시지는 영어, 파일·위치 명시.

## 5. Fragment DSL

정의 (`_fragments/login.yaml`):

```yaml
id: login
params:
  account: tester          # key: default. 기본값 없으면 null(호출 시 필수)
steps:
  - { action: navigate, url: "/" }
  - { action: fill, target: { css: "#userId" }, value: "${secrets.{{account}}.username}" }
  - { action: fill, target: { css: "#pswd" }, value: "${secrets.{{account}}.password}" }
  - { action: click, target: { css: ".btn_login", role: "button" } }
  - { action: wait_for, target: { css: ".search_form input" } }
```

사용:

```yaml
id: inbox-hide-toggle
login_as: gduser                                   # sugar → use: {login, account: gduser}
tags: [letter, smoke]
steps:
  - { action: navigate, url: "/main/letter/inbox" }
  - use: open-ext-doc                              # 짧은 형태(기본 파라미터)
  - { use: open-ext-doc, with: { row: 2 } }        # 파라미터 전달
```

규칙:
- fragment 안에 `use:` 불가(중첩 금지). 위반은 파스 에러.
- `{{param}}`은 fragment의 `steps` 내 문자열 어디든 허용(url, value, css, text, description).
- `{{...}}`가 fragment 밖(시나리오 본문)에 남아 있으면 파스 에러 — 복붙 실수를 실행 전에 검출.
- `params`에 없는 이름을 `with`로 넘기면 에러. 기본값 없는 param을 생략해도 에러.

## 6. 셀렉터 별칭 (`_selectors.yaml`)

```yaml
confirm_accept:
  css: '.p-confirmpopup [data-pc-section="acceptbutton"]'
  description: ConfirmPopup accept button
toast_success:
  css: ".p-toast-message-success"
```

- 값은 Target 오브젝트 전체(css/role/text/description) — description 힌트까지 재사용.
- 사용: `target: { ref: confirm_accept }`. 로컬 필드는 별칭 위에 병합되며 로컬이 우선:
  `target: { ref: confirm_accept, text: "Да" }`.
- **셀렉터 캐시 워크플로우**(SKILL.md에 명시): 시나리오 저작 시 소스 grep 전에 `_selectors.yaml`을 먼저 확인하고, 소스에서 새로 검증한 셀렉터가 2회 이상 쓰일 것 같으면 별칭으로 등록한다. 재사용이 세션을 거치며 자가 축적된다.

## 7. tags / vars

- `tags` (list, optional) — 시나리오 톱레벨. `tester-mcp run scenarios/ebill --tag smoke` 필터.
  `--tag a,b`는 OR(합집합). 태그 없는 시나리오는 `--tag` 사용 시 제외.
- config에 `vars:` 맵 추가:

```yaml
# tester-mcp.config.yaml
vars:
  cmt_doc_url: "/main/billMng/gdMng/billMngCmt/Dtl?id=EB_8eb5a0fd...&taskId=13173"
```

  시나리오에서 `url: "${vars.cmt_doc_url}"`. 미정의 var 참조는 파스 에러. vars는 시크릿이 아니므로 로그 리댁션 대상 아님.

## 8. `tester-mcp validate` 명령

```
tester-mcp validate <scenarios...> [-c config] [--expand]
```

- 파스타임 파이프라인 전체(fragment/ref/vars/스키마)를 실행하고 결과만 출력. executor 없음.
- 기본: 파일별 OK/에러 목록. `--expand`: 펼쳐진 최종 스텝을 YAML로 출력(AI가 확장 결과를 눈으로 검증).
- exit 0 = 전부 유효, 1 = 에러 존재. 출력 영어.
- `run`도 동일 파이프라인을 사용하므로 validate 통과 = run의 파스 단계 통과 보장.

## 9. 스킬·가이드 갱신

- `document-guide.md`: Reuse 섹션 추가(fragments, `use`/`with`/`{{param}}`, `ref`, `tags`, `vars`, validate). **간결하게** — 가이드 자체가 매 저작 세션의 AI 입력 토큰이다.
- `SKILL.md` 워크플로우 개정:
  1. 시나리오는 `scenarios/<project>/<area>/<id>.yaml`에 저장
  2. 저작 전 `_selectors.yaml`·`_fragments/` 확인(소스 grep은 그 다음)
  3. 반복 시퀀스(≥3회 예상)는 fragment로 추출, 검증한 셀렉터는 별칭 등록
  4. 실행 전 `tester-mcp validate`로 확장 검증
- 모든 추가 텍스트 영어.

## 10. 마이그레이션 (구현 단계에서 수행)

1. 기존 26개 시나리오를 `scenarios/ebill/<area>/`로 이동.
2. `_fragments/login.yaml` 추출, 26개 시나리오의 로그인 블록을 `login_as:`로 교체.
3. 진입 체인 2종(외부문서 열기 4회, 집행수신함 검색 3회)을 fragment로 추출.
4. 3회 이상 중복 셀렉터를 `_selectors.yaml`로 이동, 시나리오는 `ref:`로 교체.
5. 하드코딩 문서 URL 4곳을 `vars`로 이동 (local/feature config 각각 값 기입).
6. 전 시나리오 `tester-mcp validate` 통과 확인. (실제 브라우저 재실행은 별도 — 스모크 1~2개만 실행해 회귀 확인.)

## 11. 테스트 전략

vitest 단위 테스트 (파스타임이므로 브라우저 불필요):
- fragment 확장: 짧은/긴 형태, 기본값, `{{param}}` 치환, login_as sugar
- 에러: 미정의 fragment/param/ref/var, 중첩 use, 필수 param 누락
- ref 병합: 로컬 우선 규칙
- vars 치환: url·value
- `--tag` 필터, `_` 프리픽스 제외, nearest-ancestor 탐색
- 마이그레이션된 대표 시나리오 1개의 확장 결과 스냅샷

## 12. 비범위 (non-goals)

- 프로젝트 매니페스트(project.yaml), `--project`/`--suite`/`--env` 체계 — 현 규모에 과함
- fragment 중첩, 조건부 스텝, 루프 — DSL 복잡화 금지
- YAML → 코드 테스트(Playwright 등) 변환 — 사용자 선택: YAML 그대로가 회귀 자산
- 대상 프로젝트 리포로의 시나리오 이관
