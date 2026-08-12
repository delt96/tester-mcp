# 파일 업로드 액션 설계 — `upload` + `_fixtures/` 규약

- 날짜: 2026-08-12
- 상태: 설계 승인 대기
- 설계 기준(사용자 명시): **AI가 사용자 추가 요청 없이 tester-mcp만으로 재사용을 처리할 수 있어야 하며, 토큰을 낭비하지 않아야 한다.**
- 사용자 결정: 업로드 파일은 **진짜 파일**이어야 한다(합성 더미 불가). 픽스처는 `_fixtures/` 규약으로 관리한다.

## 1. 배경 — 업로드 불가로 막힌 지점

`scenarios/ebill/seed/README.md`가 이 제약을 "가장 큰 제약"으로 기록하고 있다. 파일 업로드가 필수인
화면은 전부 자동화에서 빠졌고, 사람이 미리 데이터를 채워 두는 운영으로 우회 중이다.

| 지점 | 왜 막히나 |
|---|---|
| 각 부서 **의견서 등록** | 공문파일 필수. 없으면 **오류 없이 조용히 실패** |
| **톡돔 작성** | 공문파일 필수 |
| **법률 등록**(정부이송작업) | 법률파일 kg/ru 2개 필수 |
| **정부이송 공문** | 공문파일 필수 |
| 외부수신문서 오프라인 등록 | 공문파일 필수 |

`seed-02`는 이 때문에 "실패하면 handoff_notes에 '공문 파일 필요'로 남긴다"는 주석과 함께
불완전한 상태로 커밋돼 있다.

## 2. 실측 — 설계의 근거 (2026-08-12)

설계 전 두 가지가 미검증이었고, 합성 테스트 페이지(file input 2개: `display:none` + 보임)와
로컬 서버로 5회 실행해 갈랐다.

| # | `Read` 허용 | `--add-dir` | 결과 |
|---|---|---|---|
| 1 | 차단 | 없음 | NOT_TESTED — 경로 거부 |
| 2 | 차단 | 있음 | NOT_TESTED — 거부 (add-dir 무효) |
| 3 | 허용 | 있음 | PASS |
| 4 | 허용 | 없음 | PASS |
| 5 | 조건부 허용(최종형) | 없음 | PASS |

**확정된 사실:**

1. **`file_upload`는 `Read` 권한에 게이트돼 있다.** Read를 `--disallowedTools`로 막으면 레포 내부
   경로조차 거부한다:
   `Cannot upload "...": only files this session is allowed to read can be uploaded.`
   Read 허용이 **필요충분조건**이었다.
2. **`--add-dir`은 불필요하다.** `--dangerously-skip-permissions`가 cwd 밖 경로(`C:\sample\...`)까지
   이미 커버한다. 실행 4가 이를 단독으로 증명한다.
3. **숨겨진 input도 문제없다.** `display:none`인 file input을 `find`가 ref로 정상 반환했다.
   `read_page` 금지 계약을 유지한 채로 동작한다. eBill은 네이티브
   `<input type="file" class="form_file">` + `label[for]` 패턴을 쓰며(PrimeVue FileUpload가 아니다),
   `.file_attatch` 안에서는 `display:none`이다 — 보이는 경우도 있으나 실측상 둘 다 동작한다.
4. **`change` 이벤트가 정상 발화한다.** 업로드 후 페이지가 `documentSample.pdf|89268`을 렌더했고
   `assert_value`로 결정적 검증이 됐다 — 스크린샷 해석에 의존하지 않는다.
5. **격리 약화 징후 없음.** Read를 허용한 3회 실행에서 executor의 Read 실호출은 **0건**,
   tool_count는 10→14로 정상 범위. 단 3회 관측이므로 단정하지 않는다(§9).

## 3. 결정 요약

| # | 결정 | 기준 적용 근거 |
|---|---|---|
| 1 | `upload` 액션 신설 — `{ action, target, file }` | 9번째 화면 액션. `click`+`description` 우회는 `double_click` 선례대로 금지 |
| 2 | 픽스처는 `scenarios/<project>/_fixtures/`, nearest-ancestor 탐색 | `_fragments/`·`_selectors.yaml`과 동일 규약 — 새 개념 0개 |
| 3 | `file:`은 **파일명만** 허용(경로 구분자 금지) | 머신 종속 절대경로가 시나리오에 스며드는 것을 차단 → 이식성 |
| 4 | 경로 해석은 **파스타임**에 절대경로로 치환 | 기존 확장 파이프라인과 동일 — executor 프롬프트는 완전히 펼쳐진 값만 받음 |
| 5 | 파일 부재는 `validate`에서 실패 | 실패 executor 런(수만 토큰)을 파스타임 검증(0 토큰)으로 대체 |
| 6 | `Read` 허용은 **upload 스텝이 있는 시나리오에서만** | 최소 권한 — 나머지 시나리오의 격리는 그대로 |
| 7 | `target`은 버튼이 아니라 `input[type=file]` 자체 | 버튼 클릭 = 네이티브 파일 선택창 = 세션 프리즈 |
| 8 | 다중 파일(`files: [...]`) 미지원 | YAGNI — 법률 kg/ru는 별도 input이라 `upload` 2회면 됨 |
| 9 | 도구 표면 텍스트(에러·가이드·계약)는 영어 | 배포 원칙 10 |

## 4. DSL 표면

```yaml
- { action: upload, target: { css: "input[type=file]" }, file: "documentSample.pdf" }
```

렌더링(프롬프트에 나가는 형태) — 경로는 파스타임에 절대경로로 치환된다:

```
7. Upload: [css input[type=file]] ← file "C:\workspace\testMcp\scenarios\ebill\_fixtures\documentSample.pdf"
```

## 5. 저장 구조

```
scenarios/
  ebill/
    _fragments/               # 공통 스텝 조각
    _selectors.yaml           # 셀렉터 별칭·캐시
    _fixtures/                # [신규] 업로드용 실제 파일
      documentSample.pdf
    seed/  letter/  billMng/  ...
```

`_` 프리픽스는 기존 규약대로 시나리오 수집에서 제외되므로(`expandScenarioPaths`),
`validate scenarios/ebill`이 픽스처를 시나리오로 오인하지 않는다 — 추가 조치 불필요.

초기 픽스처는 `C:\sample\documentSample.pdf`(89KB, `%PDF-1.5`)를
`scenarios/ebill/_fixtures/documentSample.pdf`로 복사해 커밋한다.

## 6. 경로 해석 규칙

파스타임에 다음 순서로 처리한다:

1. `file`에 `/` 또는 `\`가 있으면 에러 —
   `step[i]: upload 'file' must be a bare filename in _fixtures/ (got "...")`
2. 시나리오 파일에서 상위로 올라가며 첫 `_fixtures/` 디렉토리를 찾는다(nearest-ancestor).
   기존 `discoverReuseAssets`의 같은 루프에 합류시킨다 — `_fragments/`·`_selectors.yaml`과 동일한
   탐색 규칙을 공유하므로 별도 순회를 만들지 않는다. 없으면 에러 —
   `no _fixtures/ directory found for scenario ...`
3. `<_fixtures>/<file>`이 존재하지 않으면 에러 — `upload fixture not found: <절대경로>`
4. `Step.file`을 절대경로로 치환한다.

셋 다 **executor 스폰 전**에 실패하며 `tester-mcp validate`로 0토큰 확인이 가능하다.

## 7. 실행 경로 — executor 권한

`buildExecutorArgs`의 `--disallowedTools`를 정적 문자열에서 배열 조립으로 바꾸고,
`allowRead`가 참일 때만 `Read`를 뺀다. 호출부는 `runScenario`가 `hasUpload(scenario)`로 결정한다.

```ts
const denied = ["Skill","Task","Agent","Bash","Write","Edit","NotebookEdit","Glob","Grep","WebFetch","WebSearch"];
if (!o.allowRead) denied.push("Read");
```

`--add-dir`은 도입하지 않는다(§2-2).

## 8. SYSTEM_CONTRACT 추가분

`[Assertions]` 앞에 `[Upload]` 블록을 넣는다. 핵심 4줄:

- `file_upload` 도구를 쓴다 — `find`로 ref를 얻고 `{ref, paths, tabId}`로 호출.
- **file input이나 업로드 버튼을 절대 클릭하지 않는다** — 네이티브 선택창이 열리고 세션이 얼어붙는다.
- input이 `display:none`이고 앞에 `label[for=...]`·버튼이 그려져 있는 것은 **정상이다**. 보이는 input을 찾아 헤매지 말고 숨은 것에 그대로 올린다.
- 거부/에러 시 **도구의 에러 원문을 handoff_notes에 인용**하고 NOT_TESTED — 클릭으로 폴백하지 않는다.

## 9. 변경 범위

| 파일 | 변경 |
|---|---|
| `src/scenario/types.ts` | `Step` 유니온에 `upload` |
| `src/scenario/actions.ts` | `RENDERERS.upload` |
| `src/scenario/reuseAssets.ts` | `ReuseAssets.fixturesDir` + `_fixtures/` nearest-ancestor 탐색(기존 루프에 합류, 셋 다 찾으면 break) |
| `src/scenario/expandScenario.ts` | §6 검증 + `upload.file` → 절대경로 치환 |
| `src/run/buildPrompt.ts` | `[Upload]` 블록 |
| `src/run/buildExecutorArgs.ts` | `allowRead` 옵션 + 배열 조립 |
| `src/run/runScenario.ts` | `hasUpload` + 전달 |
| `skills/tester-mcp/document-guide.md` | 액션 목록 + `_fixtures/` 규약 |
| `scenarios/ebill/seed/README.md` | "업로드 불가" 제약 문단 갱신 |
| `scenarios/ebill/_fixtures/documentSample.pdf` | 픽스처 추가 |

## 10. 테스트 계획

- `actions.test.ts` — "eight screen actions" 단언을 9개로 갱신(**현재 이 테스트가 실패 중**), upload 렌더러 문자열.
- `buildExecutorArgs.test.ts` — `allowRead: false`면 `Read` 포함, `true`면 미포함.
- `runScenario` — `hasUpload`가 upload 유무를 정확히 판별.
- 경로 해석 — 파일명 정상 치환 / 경로 구분자 포함 시 에러 / 파일 부재 시 에러 / `_fixtures` 없을 때 에러.
- `buildPrompt.test.ts` — `[Upload]` 블록 존재.

## 11. 미해결 리스크

1. **실제 eBill 화면 미검증.** 스파이크는 합성 페이지였다. 실물 업로드 위젯과, 업로드 후 서버 전송까지
   이어지는 흐름(의견서 등록 등)은 아직 확인하지 않았다. 대상 셀렉터는 소스에서 확인해 뒀다 —
   `AddDragAndDropFileComponent.vue`가 `type='official'`일 때 `#officialfile`(`accept=".pdf"`, 단일 파일)이며
   앞의 `label[for=officialfile]`을 누르면 네이티브 선택창이 열린다(= 클릭 금지 규칙이 적용되는 지점).
   구현 후 `seed-02`로 실검증해야 한다.
2. **Read 허용의 격리 영향은 3회 관측.** 실호출 0건이었지만 표본이 작다. upload 시나리오에만
   열리므로 영향 범위는 제한되나, 장기 관측이 필요하다.
3. **10MB 상한.** `file_upload`는 단일 호출 합계 10MB 미만을 요구한다. 현재 픽스처(89KB)는 무관하나
   대용량 업로드 테스트는 불가능하다.
4. **서버측 파일 검증 미확인.** eBill 백엔드가 PDF 내용/MIME을 어디까지 검증하는지 확인하지 않았다.
   `documentSample.pdf`는 실제 PDF이므로 통과가 기대되나 근거는 없다.
