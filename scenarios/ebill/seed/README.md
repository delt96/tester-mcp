# seed — E2E 전 구간 데이터 시딩

**목적**: 뒷 단계(법적행위·정부이송·공포)를 테스트하려면 그 앞 구간을 실제로 통과시켜 데이터를
만들어야 한다. 이 스위트는 **읽기 전용이 아니라 실제로 의안을 만들고 단계를 전진시킨다**.

진단용 `availability/`와 짝이다 — 먼저 `availability`로 무엇이 없는지 보고, `seed`로 만든다.

2026-08-11~12에 의안 두 건(**6-6972/26**, **6-6973/26**)을 손으로 끝까지 밀어 올리며 확인한 내용을
반영했다. 6-6973/26은 **공포(step 3300)까지 완주**했다.

## 단계 코드 (BillStepCode.java)

| step | 의미 | 전이 트리거 |
|---|---|---|
| 1000 | 등록대기 | |
| 1200 | 등록됨 | 의안접수 [등록] |
| 1300 | 법률검토완료 | **법무실 의견서 결재** |
| 1400 | 위원회심사 | 위원회 회부 요청 |
| ↳ | (언어·전문심사 의견서는 **1400→1400 self-loop**, 단계 안 올라감) | |
| **1500** | **위원회심사완료** | **위원회 의견서 결재** ← 심사보고서로는 안 됨 |
| 1700 | 본회의심사 | **[안건부의하기]** (PROPOSE_TO_PLENARY) |
| 1900 | 법적행위 | [본회의검증요청] |
| 3200 | 정부이송 | 정부이송 공문 결재(자동 이송) |
| 3300 | 공포 | 결과보고 → [완료] |

## 2026-08-12 자동화 실행 결과 — 의안 1건을 3300까지

`6-6977/26`(E2E-SEED)을 사람이 등록만 하고 그 뒤 전 구간을 tester-mcp로 전진시켰다.
아래는 그 과정에서 **코드·DB로 확정한 것들**이다. 추측이 아니라 실측이므로 다음 작업의 전제로 써도 된다.

### 단계를 올리는 게 무엇인지 헷갈리는 지점

`ebs_bp_step_transition`(bp_df_id=1) 실측. **self-loop가 셋 있다** — PASS인데 단계가 안 올라가면
회귀를 의심하기 전에 여기부터 볼 것.

| from | action_code | to |
|---|---|---|
| 1400 | SUBMIT_LANGUAGE_OPINION | **1400** (self-loop) |
| 1400 | SUBMIT_EXPERT_REVIEW_OPINION | **1400** (self-loop) |
| 1400 | RELEVANT_COMMITTEE_REVIEW | **1400** (self-loop) |
| 1400 | **JURISDICTIONAL_COMMITTEE_REVIEW** | **1500** ← 여기만 전진 |
| 1900 | PLENARY_VERIFICATION | **1900** (self-loop, 톡돔) |
| 1900 | TRANSFER_TO_GOVERNMENT | 3200 |
| 3200 | PROMULGATE | 3300 |
| 3200 | VETO | **1400** ← 잘못 고르면 역행 |

전이는 대부분 **문서 등록이 아니라 결재 시점**에 일어난다.
정부이송에는 **[이송] 버튼이 없다** — 공문을 결재하면 서버가 보낸다
(`BillMngServiceImpl:498 TRANSFER_TO_GOVERNMENT -> autoSendIfReady`). 실측상 결재 1초 뒤 `send_dt`가 찍혔다.

### 목록 진입점 — 계정과 상태필터를 같이 봐야 한다

| 화면 | URL | 기본 상태필터 | 계정 |
|---|---|---|---|
| 본회의검증 | `legalActMng/billMng` | `ST130`(=1900) | `lgactstaff`는 보이고 **`lgactuser`는 Total 0** |
| 정부이송 예정 | `gvrnTrsfWork/billMng` | `''`(전체) | 계정 안 탐 — work 생긴 뒤 정식 진입점 |
| 정부이송 | `gvrnTrsfMng/billMng` | `ST410`(=3200) | `GD` |
| 공포 | `prmgMng/billMng` | — | **메뉴 매핑 없음**(`com_dept_menu`에 menu_id 92 행이 없어 좌측 메뉴에 안 뜸). URL로만 |

목록이 비면 권한부터 의심하지 말고 **상태필터 기본값 vs 의안의 현재 stat_cd**를 먼저 맞춰볼 것.

**외부수신함도 같은 함정이 있다.** `ExternalReceive.vue:21` 의 `DEFAULT_STATUS='in'` 인데
실제 문서는 전부 `closed` 다(2026-08-12 실측 64/64). 기본 화면에 아무것도 안 뜨고,
제목만 검색하면 Total 0 이 된다. 상태를 먼저 풀어야 한다.

| 화면 | 기본 필터 | 데이터의 실제 값 |
|---|---|---|
| 외부수신함 | `status='in'` | 전부 `closed` ← **안 맞음** |
| 본회의검증 | `ST130` | 1900 = ST130 ✓ |
| 정부이송 | `ST410` | 3200 = ST410 ✓ |
| 공포 | `ST520` | 3300 = ST520 ✓ (그래도 0건 — 아래) |

→ **작성 규칙: 목록 화면을 쓰는 스텝을 짤 때는 그 화면의 기본 필터값을 반드시 소스에서 확인한다.**
세 번 겪고 나서야 규칙으로 올렸다.

### 모달 버튼 색이 통일돼 있지 않다

| 모달 | 저장 | 취소 |
|---|---|---|
| LawRegModal / signerAssignModal / signModal | `btn_outline_primary` | `btn_primary` |
| **PrmgModal** | **`btn_primary`** | `btn_outline_primary` |

`.btn_primary`를 저장으로 일반화하면 **취소를 누른다.** 모달마다 확인할 것.

### `AutoCompleteUserInput`은 부모 영역으로 스코프

수신자·승인자·수행자·서명자가 전부 같은 컴포넌트다. `.p-dialog .p-autocomplete-input`으로는 못 가른다.

| 용도 | 부모 영역 |
|---|---|
| 수행자 | `.responder_row` |
| 서명자 | `.signer_area` |
| 수신자 | `.recipient_area` |
| 승인자 | `.approve` |
| 언어 | `.language_area .check_item` |

`.p-dialog`의 **첫 체크박스는 `#docModeOfficial`**(공문파일 첨부 모드)이지 언어가 아니다.
그걸 누르면 공문파일 칸이 사라져 뒤의 `upload`가 통째로 실패한다.

### "셀렉터가 안 잡힌다"가 앱 결함인 경우 (2026-08-12~13, `00b`)

`00b`의 공문파일 업로드가 **4회 연속** 실패했다. 증상은 `find`/`read_page`가
`Page script returned empty result`를 반환해 `file_upload`에 넘길 ref가 안 나오는 것.
같은 `#officialfile`이 `02`·`04b`·`04c`·`06`·`08`에서는 통했으므로 도구 문제도, 셀렉터 문제도 아니었다.

원인은 `ApplyDetail.vue`의 공동발의 탭이었다.

```html
<Tab v-for="dept in groupedPoly" :value="dept.title">   <!-- 정당명에 큰따옴표가 들어 있다 -->
```

PrimeVue가 `value`로 DOM id를 만드는데 정당명이 `Фракция "Ата-Журт Кыргызстан"`이라
`label[for="pv_id_19_tab_Фракция "Ата-Журт Кыргызстан""]`가 되고, 이건 **유효하지 않은 CSS 셀렉터**다.
확장의 접근성 트리 생성이 여기서 죽어 **문서 전체**가 빈 결과가 됐다.
`javascript_tool`의 `querySelectorAll('#officialfile').length === 1`은 계속 1을 반환했는데,
이건 a11y 트리를 안 거치기 때문이다 — **그래서 "요소는 있는데 못 잡는다"는 모순처럼 보였다.**

2026-08-13 `:value="dept.id"`로 수정한 뒤 재실행: `find`가 `ref_260`을 반환하고
`eas_file`에 `documentSample.pdf` 1건이 실제로 저장됐다. 같은 실행 로그에서
`empty result` 0회 · a11y 트리 에러 0회.

**교훈**: `find`가 한 화면에서만 전면적으로 빈 결과를 낼 때는 셀렉터를 더 손대지 말고
`read_console_messages`부터 볼 것. 셀렉터 변형을 5개 시도한 것보다 콘솔 1줄이 빨랐다.
`value`/`id`로 쓰이는 값에 따옴표·괄호가 섞이는 곳(정당명·부서명·의안명)이 후보다.

### 목록 검색칸은 화면마다 순서가 다르다 (`00c`)

`.board_search`는 전 화면 공통 클래스지만 **내부 구조는 공통이 아니다.**
의안제출 목록(`/main/bill/apply`)에서 쓰던 `.form_row .input_item:nth-child(3)`을
의안접수 목록에 그대로 가져다 쓰면 **아무것도 매칭하지 않는다** — 여기는 `.board_search.type2`라
`.form_row`가 2개이고 각 행에 `.input_item`이 2개뿐이다.

| 화면 | 의안명 칸 |
|---|---|
| 의안제출 `/main/bill/apply` | `.form_row .input_item:nth-child(3)` |
| 의안접수 `/main/billMng/gdMng/billMngRc` | `.board_search.type2 .form_row:first-child .input_item:nth-child(2)` |
| 법률행위·정부이송·공포 계열 | `.form_row .input_item:nth-child(2)` |

`.board_search`를 alias로 올리지 않는 이유가 이것이다. **화면을 옮길 때는 검색칸 순서를 다시 볼 것.**

### 접수는 입력값이 없다 — 산출물 쪽이 낡았다 (`00c`)

`billMngRcDtl.vue`의 `resolver()`는 항상 빈 errors를 반환한다(`rcpDt` 검증이 주석 처리).
접수일자 입력 행도 `<!-- -->`로 막혀 있다. 그런데 접수 후 DB를 보면

| 컬럼 | 접수 전 | 접수 후 |
|---|---|---|
| `ebs_master.bill_no` | `null` | `6-6989/26` |
| `ebs_master.rcp_dt` | `null` | `20260813` |

**의안번호와 접수일자는 서버가 채번·기록한다.** 산출물에 "접수일자를 입력한다"는 절차가 있으면 그건 옛 화면이다.


### 문서 유형(DMT)이 수신함 버튼을 가른다 (`16`·`17`·`18`)

수신함 상세 버튼은 **문서 유형마다 다르다**(`Inbox.vue:552-575`). 세 시나리오가 나눠 검증했다.

| 유형 | 버튼 |
|---|---|
| `DMT01` 답변용 | `[주 이행자 추가]`(10678) · `[반려]`(10269) |
| `DMT02` 확인용 | `[종료하기]`(10497) — **반려 없음** |
| `DMT03` 서명용 | `[결재]`(10268) · `[반려]`(10269) |
| `DMT04` | `[답변]`(10496) · `[종료하기]` |
| 접수 후 | `[종료하기]` |

전부 `button.v_btn.btn_outline_neutral.btn_md` 이고 `[반려]`만 `btn_outline_error` 라 **텍스트로만 갈린다.**

### 문서번호는 결재 완료 시점에 채번된다 (`12`·`13`)

등록 직후 `eas_document.doc_no` 는 **비어 있다.** 결재가 끝나야 `03-237/26` 형태로 부여된다.
**반려된 문서는 끝내 번호를 못 받는다**(null 유지). 두 시나리오의 대조로 확정했다.

### 로그인이 간헐 실패하면 — 원인이 세 갈래다

2026-08-13 한 세션에서 6회 발생. 증상이 **전부 "로그인 화면에 그대로 머무름"으로 같아** 오진하기 쉽다.

| 원인 | 감별 |
|---|---|
| **CORS** | `targets.frontend` 를 `127.0.0.1` 로 바꿨을 때. `.env` 의 `CORS_ALLOWED_ORIGINS` 에 `localhost:5173` 만 있다 |
| **단언/조작 타깃 불일치** | `fill` 은 placeholder 로, `assert_value` 는 css 로 잡으면 서로 다른 것을 본다 |
| **v-model 바인딩 전 입력** | 값이 실제로 안 박힌다. `wait_for` → `click` → `fill` → `assert_value` 로 방어 |

→ `_fragments/login.yaml` 에 세 방어가 모두 들어가 있다. **`fill` 직후 `assert_value` 를 습관화할 것** —
   이게 없으면 실패 지점이 '로그인 클릭 이후'로 밀려 보여 원인을 가를 수 없다.

### 포트를 뺏겼는지 아닌지 (2026-08-13)

프리플라이트에서 `<title>` 이 다른 앱으로 나오면 포트 충돌이다. Windows 는 `localhost` 를 `::1` 로 먼저
해석하므로, 다른 프로젝트의 vite 가 `::1:5173` 에 붙으면 요청을 뺏긴다(eBill vite 는 `::` 에 바인딩).
**127.0.0.1 로 우회하면 CORS 에 막히므로**, 충돌 프로세스를 끄는 것이 정답이다.
※ 프리플라이트가 상태코드만 봤다면 200 이라 통과시키고 **엉뚱한 앱에 로그인**했을 것이다.

### 시딩이 다른 시나리오를 깨뜨린다 (2026-08-14)

`seed-11` 계열을 반복 실행해 기안함이 **548건**까지 늘었고, 기존 시나리오의
"목록 상위 N건에서 대상 찾기" 전제가 깨졌다(`workRequest/p4`).
→ 대상을 잡기 전에 **검색으로 좁히는 단계**를 넣어야 한다. 시딩 데이터 정리 주기도 필요하다.

### 목록 돋보기 버튼은 쓰지 말 것 — 필터 패널로 검색한다 (2026-08-14)

`LetterListComponent` 의 통합검색 돋보기 버튼은 **아이콘만 있고 텍스트도 `aria-label` 도 없다.**
접근성 이름이 없으니 executor 가 좌표로 찍는데, 목록이 재정렬되면서 좌표 아래 요소가 바뀌어

- 바로 옆 **필터 버튼**이 눌려 필터 팝업이 열리거나
- **문서 행**이 눌려 엉뚱한 문서가 선택된다

`p4b`·`seed-22` 가 이것으로 연속 NOT_TESTED 로 죽었다. 더 나쁜 건 **증상이 원인을 가린다**는 점이다 —
`integratedSearch()` 는 `searchContent` 가 비면 조용히 `return` 하므로, 검색이 아예 실행되지 않았는데도
"셀렉터가 잘못됐다"로 보고된다.

→ **`_fragments/list-filter-search.yaml` 을 쓸 것.** 필터 패널의 검색 버튼은 표시 텍스트가 있어
접근성 트리에 이름이 잡힌다. 검색이 실제로 걸렸는지는 **검색 조건 칩**(`.search_results .search_result`)으로 본다.
⚠ 이 fragment 는 `searchType` 을 넘기지 않는 화면(기안함 등) 전용이다. `searchType='inbox'` 인 화면은
앞에 filter_item 이 3개 더 붙어 첫 번째가 부제목이 아니다.

### 이행요청 카드는 `reg_dt desc` — 최신이 1번 (2026-08-14)

한 문서에 이행요청이 여러 건이면 카드도 여러 개다. 정렬은 매퍼가 정한다
(`WorkRequestMapper.xml` `getWorkRequestListByUserId` … `order by reg_dt desc`) — **추정하지 말고 이걸 근거로 쓸 것.**

⚠ **카드 수는 시간이 지나며 늘어난다.** `p4b` 는 "카드 2개"로 적어뒀다가 3개가 되어 인덱스가 밀려 FAIL 했다.
→ 인덱스로 잡되 **반드시 `.command_detail`(이행 내용) 텍스트로 대상을 단언**할 것. 순서가 바뀌면 거기서 실패해야 한다.

**댓글·수정 대상이 어긋나도 화면 단언은 전부 통과한다.** `p3` 가 의도한 work_req 1444 대신 형제 카드
1445 에 댓글을 달았는데 UI 검증은 모두 PASS 였고, DB(`eas_work_comment.work_req_id`)를 보고서야 발각됐다.

### 데이터 의존 단언은 `assert_visible` 이 아니라 `wait_for` (2026-08-14)

컴포넌트 루트(`.people_list_area` 등)는 **즉시 렌더**되고 내용만 API 응답 뒤에 채워진다.
`assert_visible` 은 그 순간을 보므로 컨테이너만 잡고 내부는 빈 채로 통과/실패한다.
→ **API 로 채워지는 것은 전부 `wait_for`(폴링)로 잡는다.** `seed-22` 가 이것으로 PARTIAL 로 끝났다.

### "목록이 비었다" 는 화면 결함이 아닐 수 있다 (2026-08-14)

`seed-22` 열람자 탭이 폴링해도 비었다. DB 로는 그 문서의 열람자 쿼리가 6행을 반환하는데 화면은 빈 채였다.
**수신자가 확실히 있는 다른 문서로 바꾸자 정상 표출됐다** → 문서별 데이터 문제로 갈렸다.

`getDocumentUser` 는 각 user_id 를 **HRMIS 로 조회해 조립**한다(`OfficialDocumentServiceImpl:174-187`).
HRMIS 에 없는 id 가 섞이면 비는 것으로 의심되나 확정하지 못했다(`com_error_log` 에 기록 없음).

→ **감별법: 대상을 바꿔 한 번 더 돌려본다.** 다른 데이터에서 되면 화면이 아니라 데이터다.
공포 목록 때(`use_yn='N'` 확인) 와 같은 계열의 교훈이다 — 비었다고 바로 결함으로 올리지 말 것.

### 한국어 화면은 관리자 일부 화면에서 라벨이 빈다 — 결함 아님 (2026-08-14)

`seed-25`(권한별메뉴관리)가 한국어 화면에서 FAIL 했다. **DB 에는 정상 저장**됐는데
(`com_code_detail` grp_code=1043 이 16→17행) 목록에 이름이 안 나타났다.

등록 모달은 권한명을 **KG·RU 두 개만** 받고 한국어(`code_nm3`)는 `null` 로 둔다.
**운영에는 한국어가 없어 한국어 입력칸을 의도적으로 주석 처리해 둔 것**이고(사용자 확인),
테스트 서버에만 한국어가 살아 있어 드러나는 현상이다.

→ **관리자 화면 검증은 `locale: ru` 로 한다.** 한국어에서 라벨이 비는 것을 결함으로 보고하지 말 것.

⚠ 다만 **저장 실패가 조용하다**는 점은 별개로 알아둘 것 — `fnSave` 의 `.catch(...console.log)` 가
오류를 삼키고 토스트도 안 띄운다. 모달은 실패해도 닫힌다.
→ **"모달은 닫혔는데 목록에 없다" 를 만나면 화면을 더 뜯지 말고 DB 부터 볼 것.**

### 파괴적 시나리오는 원복 스크립트를 먼저 만든다 (2026-08-14)

`_rollback/`(gitignore) 에 스냅샷 기반 복구 SQL 을 둔다. 2026-08-14 기준 3개:

| 파일 | 대상 | 쓰는 시나리오 |
|---|---|---|
| `20260814_com_code_1043_restore.sql` | 권한코드 16건 | `seed-25` |
| `20260814_com_dept_menu_restore.sql` | 부서→메뉴 매핑 1,232행 | `seed-25` |
| `20260814_employee_password_restore.sql` | `employee_profile` 비밀번호·프로필 | `seed-26` |

규칙 세 가지:

1. **끝에 검증 블록을 넣는다.** 행수/해시가 안 맞으면 `RAISE EXCEPTION` 으로 통째 롤백된다.
2. **바깥 트랜잭션으로 감싸도 격리되지 않는다.** 스크립트 안에 `BEGIN`/`COMMIT` 이 있어
   `BEGIN; \i file; ROLLBACK;` 로 드라이런하면 **실제로 커밋된다**(2026-08-14 실측).
3. **복구 후 반드시 건수를 재확인한다.** `seed-25` 원복 뒤 `LGRV_1` 행 29개가 남아 놀랐는데,
   스냅샷에 원래 있던 이전 테스트 잔재였다 — **"남아 있다"와 "내가 만들었다"는 다르다.**

### 시나리오 id 는 ASCII 만 (2026-08-14)

`id:` 에 한글을 쓰면 `only letters, digits and .-_ are allowed (blocks path injection)` 으로 거부된다.
파일명에 유형을 넣을 때는 코드값(`dmt02`)을 쓸 것.

### 의견서 수신자는 종류마다 다르다 (과거 실데이터 기준)

| 의견서 | 수신자 | 승인자 |
|---|---|---|
| 언어·전문심사 | 소관위원회 부서장 `cmtuser1` | 각 부서장 |
| 소관위원회 | **총무국 `gduser1`** | `cmtuser1` |
| 톡돔 / 정부이송 공문 | **총무국 `gduser1`** | `legalactuser` 부서장 |

### 행을 위치로 집지 말 것 (실사고)

`seed-05` 1차가 목록 전체에 `assert`하고 조작은 `tr:first-child`에 해서 **엉뚱한 의안을 부의**했다.
단언한 행과 조작한 행이 다르면 시나리오는 실패하는 게 아니라 **틀린 것을 맞다고 보고**한다.
`:first-child`를 쓰려면 **앞에 검색 필터**를 넣고, 필터 직후 첫 행이 맞는지 `assert`한 뒤에 조작할 것.

### 외부수신문서를 접수해 큐를 채우는 법 (`01a`)

`seed-01` 은 대기함에 **진짜 '등록대기' 행**이 있어야 시작된다. 판정 기준이 까다롭다 —
화면 라벨과 더블클릭 경로가 **둘 다 `draft_yn` 을 먼저 본다**(`billRegWaitList.vue:151, 93`):

    draft_yn='Y'  → '임시저장'(10998) + draftId 경로
    status='WAIT' → '등록대기'(10267) + extDocId+waitId 경로   ← seed-01 이 쓰는 것

즉 **`status='WAIT' AND draft_yn<>'Y' AND doc_id IS NOT NULL`** 이라야 한다.
2026-08-12 에 WAIT 1건이 있었지만 `draft_yn='Y'` 라 쓸 수 없었다.

접수 가능 조건은 **`documents.status='in'`** 하나다(`InsertExternal.vue:31-32`):

    isProcessed  = ['closed','refunded'].includes(status)
    showEditForm = !externalId || (!!docData && !isProcessed)
    // [의안 등록 접수](11048) 는 v-if="showEditForm" 블록 안

`closed`/`refunded` 면 버튼이 있는 블록이 통째로 안 그려지고 읽기전용 요약 화면이 뜬다.
**버튼이 사라진 게 아니라 화면이 다른 것.** `ebs_bill_reg_wait` 에 없다(=미접수)는 것과
접수 *가능*한 것은 다르다 — 후자는 status 로만 정해진다.

2026-08-12 실측으로 64건이 전부 `closed` 라 접수 가능한 문서가 0건이었다. 준비/롤백:

    UPDATE kgst.documents SET status='in'     WHERE id=<문서>;   -- 준비
    UPDATE kgst.documents SET status='closed' WHERE id=<문서>;   -- 롤백

`kgst.documents` 는 게이트웨이 전용 미러가 아니라 앱이 직접 INSERT/UPDATE 하는 테이블이라
(`ExternalDocumentsMapper.xml:5, 24`) 이 변경은 되돌릴 수 있다.

### [가져오기]가 항상 비는 앱 버그 (미수정)

    // ExternalDocumentsServiceImpl:88
    dto.setFileList(easFileService.getFilesByDocId(dto.getId().toString()));   // "344"

`eas_file.doc_id` 는 eas_document 의 **UUID** 인데 `documents.id`(숫자 PK)를 넘긴다.
`eas_file` 2,918건이 **전부 UUID**(숫자형 0건)라 어떤 문서에서도 매칭되지 않는다.
`git log -L` 상 2025-07-16 최초 작성 이후 안 바뀌었으니 회귀가 아니라 처음부터 그랬다.

같은 `fileList` 를 두 화면이 공유하므로 **나란히 비어 보인다**:

| 화면 | 바인딩 |
|---|---|
| 외부수신함 상세 왼쪽 패널 | `docData.fileList` (`ExternalLetterDetailComponent.vue:32`) |
| 의안등록 폼 [가져오기] 모달 | `extDoc.fileList` (`billMngSave.vue:603`) |

수정: `dto.getEasDocId()` 로 바꾸면 두 화면이 동시에 살아난다.
그때까지 `seed-01` 은 원문을 **직접 업로드**한다(시나리오에 TODO + 해제 조건 있음).

### `description`도 사실과 맞아야 한다

`ref`로 셀렉터가 확정돼 있어도 executor는 `description`을 **기대값으로 읽고** 화면과 어긋나면 중단한다.
`seed-08` 1차가 "법적행위 목록"이라 적었다가 실제 제목 "본회의검증"과 달라 멈췄다.

### 결과 라벨을 곧이곧대로 믿지 말 것

executor가 최종 JSON에 `"index": 29-32` 같은 **범위 표기**를 넣으면 파싱이 깨져 실제 PASS가
`NOT_TESTED`로 기록된다(`seed-02`·`seed-05` 실측). 또 자기가 결재해 놓고 결재대기함에서 사라진 걸
"등록 안 됨"으로 오독해 `PARTIAL`을 내기도 했다(`seed-08`).
**판정은 DB로 대조할 것** — `ebs_bp_tasks` / `ebs_bp_instance.current_step_id`.

## 파일 업로드 (2026-08-12부터 가능)

DSL 액션은 10개다: `navigate` `fill` `click` `double_click` `upload` `wait_for` `assert_visible`
`assert_not_visible` `assert_value` `screenshot`. `upload`가 추가되어 **공문파일이 필수인 지점도
자동화된다.**

```yaml
- { action: upload, target: { css: "#officialfile" }, file: "documentSample.pdf" }
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

**주의:** file input은 클릭하면 안 된다. 네이티브 파일 선택창이 열려 executor가 멈춘다.
`target`은 반드시 `input[type=file]` 자체를 가리켜야 하며, 앞에 놓인 `label`·버튼이 아니다.

의안접수·위원회회부·본회의 부의·결과입력·검증요청은 원래 파일이 필요 없어 `seed-05`는
처음부터 끝까지 tester-mcp만으로 돌아간다.

## 실행 순서

```bash
cd C:\workspace\testMcp
node bin/tester-mcp.js validate scenarios/ebill/seed -c tester-mcp.config.yaml
node bin/tester-mcp.js run scenarios/ebill/seed/05-plenary-submit-and-result.yaml -c tester-mcp.config.yaml
```

**순차 실행**할 것(병렬은 executor 스톨). 실행 중 **Chrome 창을 전면에 유지**할 것.

## 파일

| 파일 | 하는 일 | 계정 | 파일업로드 |
|---|---|---|---|
| `00a-mp-register.yaml` | **의원 발의 ① 안건등록(step 0 생성)** | mp1 | **필요** (원문 kg/ru) |
| `00b-mp-request-registration.yaml` | **의원 발의 ② 서명 → 게재 → 재진입 → 등록요청발송 (step 0 → 1000)** | mp1 → gduser | **필요** (공문파일) |
| `00c-gd-reception.yaml` | **의원 발의 ③ 총무국 의안접수 (1000 → 1200)** | gduser → lgrvhead | 불필요 |
| `10a-cmt-meeting-create.yaml` | **위원회 회의 등록** — 회의일시(날짜·시·분 3개 필수) + 안건 추가 | cmtstaff | 불필요 |
| `10b-cmt-meeting-approve.yaml` | 회의 결재선 지정 → 승인 요청 → 부서장 승인 (임시저장→예정) | cmtstaff → cmthead | 불필요 |
| `10c-cmt-meeting-result.yaml` | 회의 결과보고 (예정→완료). 회의일시 5개 + 안건마다 결과 필수 | cmtstaff | **필요** |
| `11-approval-doc-register.yaml` | **결재 문서 등록(DMT01 답변용)** — 전자문서 계열의 시작점 | gduser | **필요** (공문+첨부) |
| `11b` / `11c` | 위 파일의 유형 변형 — DMT02 확인용 / DMT03 서명용 | gduser | **필요** |
| `12-approval-doc-approve.yaml` | 결재대기함에서 승인 → 수신함으로 발송 | cmthead | 불필요 |
| `12b` / `12c` | 위 파일의 대상 변형 — 확인용 / 서명용 | cmthead | 불필요 |
| `13-approval-doc-reject.yaml` | 결재대기함에서 **반려** → 기안자 반려함 | cmthead → gduser | 불필요 |
| `14-letter-search.yaml` | 편지함 통합검색 + 필터 (선행 불필요, 조회 전용) | gduser | 불필요 |
| `15-doc-redraft.yaml` | 반려 문서 **재기안** — 공문파일·수신자 재지정 필요 | gduser | **필요** |
| `16-inbox-receive-dmt01.yaml` | 수신함 접수(답변용) → 주 이행자 추가 → 종료 | cmthead | 불필요 |
| `17-inbox-receive-dmt02.yaml` | 수신함 접수(확인용) → 숨기기/해제 → 종료 | cmthead | 불필요 |
| `18-inbox-receive-dmt03.yaml` | 수신함 접수(서명용) → 결재 | cmthead | 불필요 |
| `19-inbox-reject.yaml` | **수신 문서 반려** (결재 반려와 다른 화면) | cmthead | 불필요 |
| `20-approver-detail.yaml` | 결재자 상세 — 접기/펼치기 + 상태 팝오버 (조회 전용) | cmthead | 불필요 |
| `21-citizen-complaint-register.yaml` | 시민민원 등록 — 필수값 11개, 음성 케이스 포함 | gduser | 선택 |
| `22-doc-detail-tabs.yaml` | 문서 상세 5개 탭(공문·정보·열람자·히스토리·연결) — 조회 전용 | gduser | 불필요 |
| ↳ 대상 | doc `01-41/26` (`test05/18`) — **수신자가 있는 문서라야 열람자 탭이 채워진다** | | |
| `23-external-offline-receive.yaml` | **외부문서 오프라인 수신 등록 — '기타(DMT05)'는 이 경로에서만 만들 수 있다** | gduser | **필요**(공문 PDF 필수) |
| `24-dept-manage.yaml` | 부서관리 — 부서 선택 → 상세 → [부서원] 모달 (조회 전용) | tester(admin) | 불필요 |
| `25-auth-menu-manage.yaml` | 권한별메뉴관리 — 등록/수정 모달. **파괴적, 원복 SQL 2종 필수** | tester(admin) | 불필요 |
| `26-my-info-password.yaml` | 나의 정보 — 비밀번호 규칙 5종. **파괴적, 원복 SQL 필수** | lgactstaff | 불필요 |
| `27-external-send-list.yaml` | 외부발신함 — 목록·검색·페이지네이션·상세·[상태확인] (조회 전용) | gduser | 불필요 |
| `28-external-receive-list.yaml` | 외부수신함 — 목록·상태필터·상세 진입 (조회 전용) | gduser | 불필요 |
| `29-bill-register-etc-kind.yaml` | 의안접수 등록 — 안건종류 **'기타주제'(billKind=2)**. 필수값이 3개로 줄어든다 | gduser | 불필요 |
| ⚠ `30`~`34` | **아래 6개는 아직 한 번도 통과한 적이 없다** — 상세는 이 표 아래 참조 | | |
| `30-access-history.yaml` | 시스템접속이력 · 의안접속이력 — 검색·초기화·**정렬 미제공 음성단언** | tester(admin) | 불필요 |
| `30b-admin-access-blocked.yaml` | **음성** — 일반 계정으로 관리자 이력 화면 직접 접근 시 데이터 미노출 | gduser | 불필요 |
| `31-notice-boards.yaml` | 게시판 3종(공지사항·자료실·FAQ) 목록→검색→**더블클릭** 상세→[목록] | gduser | 불필요 |
| `32-bill-integrated-search.yaml` | 의안통합검색 — **2글자 미만 차단 음성** + 검색 → 상세. 의안모니터링 진입 포함 | gduser | 불필요 |
| `33-bill-detail-search.yaml` | 의안검색 — `#btnDtlCond` 상세조건 펼침 → 조회 → 상세(정부이송 패널) | gduser | 불필요 |
| `34-document-manage.yaml` | 문서관리 — 부서문서·내문서함·공유문서 + 목록/썸네일 전환 (조회 전용) | gduser | 불필요 |

### ⚠ `30`~`34` 는 미실행이다 (2026-08-15 기준)

**`validate` 6/6 만 통과했고 `run` 은 한 번도 성공하지 못했다.** 표의 다른 시나리오처럼
"돌려서 통과한 것"으로 읽으면 안 된다. 셀렉터는 소스에서 뽑았을 뿐 **실행으로 검증되지 않았다**
— `_selectors.yaml` 에 새로 넣은 `board_search_btn` · `board_search_reset` · `detail_list_link`
세 개도 마찬가지다(캐시에 있다고 검증된 것이 아니다).

막힌 원인은 앱이 아니라 **Chrome 확장 연결**이다. 두 단계로 나타났다:

| 시점 | 증상 | 판정 |
|---|---|---|
| 1차 | `navigate` 직후 `Frame with ID 0 is showing error page` | executor 탭만 실패. 같은 시각 내 세션 탭은 로그인 화면 정상 표출, `curl localhost:5173` 200 |
| 2차 | `tabs_create_mcp` 에서 `Browser extension is not connected` | `list_connected_browsers` 가 **0대**를 반환 |

계기는 세션 중 실행된 **`/login`** 이다 — 그때 `Remote Control disconnected` 가 찍혔다.

> **교훈: `/login` 이후에는 E2E 를 바로 돌리지 말 것.**
> 확장을 재연결하고 `_verify-login.yaml` 스모크를 먼저 태운 뒤 본 실행에 들어간다.
> 스모크가 `NOT_TESTED` 면 그 다음은 전부 같은 이유로 죽는다 — 배치를 돌릴 이유가 없다.

돌릴 수 있게 되면 순서는 `_verify-login` → `30` → `30b` → `31` → `32` → `33` → `34`.
전부 **비파괴(조회 전용)** 라 아무 때나 돌려도 다른 시나리오를 깨뜨리지 않는다.

실행 대신 코드·DB 로 확인해 둔 것(실측 아님):
- 대상 메뉴 8개가 전부 `com_menu.use_yn='Y'` — 죽은 화면은 없다
- 데이터도 있다: 공지 6 · 자료실 19 · FAQ 1 · `com_acs_hist` 당일 6,601 · `ebs_acs_hist` 당일 11
- **엑셀 다운로드 6곳은 DSL 에 `download` 액션이 없어 구조적으로 검증 불가** — 수동 확인 대상
- `32` 만 외부 검색엔진(`VITE_SEARCH_ENG_URL`)에 직접 의존한다. 엔진이 죽으면 0건이 되고
  그건 앱 결함이 아니다. 운영/스테이징은 `/vite_search/...` 상대경로라 주소 체계가 다르다
| `01a-receive-external-doc.yaml` | **외부수신문서 접수 — 대기함에 '등록대기' 행을 만든다(01의 선행)** | gduser | 불필요 |
| `01-register-and-review-request.yaml` | 대기 건 → 의안등록 → 이첩 → 법률검토 이행요청 + [C] | gduser → lgrvhead | **필요** (원문 kg/ru — 아래 버그로 [가져오기] 대신 업로드) |
| `01b-assign-lgreview.yaml` | 01의 이행요청 블록만 분리(대기 큐 없이 시작할 때) | lgrvhead | 불필요 |
| `02-lgreview-complete.yaml` | 검토결과 저장 → 의견서 → 결재 | lgrvstaff → lgrvhead → gduser | **필요** |
| `03-committee-referral.yaml` | 소관위원회 지정 → 회부 요청(수행자 3명 자동) | gduser | 불필요 |
| `04-dept-main-executors.yaml` | 3개 부서장이 각자 부서원에게 이행요청 + **[C] 주 이행자** | cmthead/langhead/exntnhead | 불필요 |
| `04b-lang-exntn-opinions.yaml` | 언어·전문심사 의견서 작성 → 각 부서장 결재 | langstaff/langhead/exntnstaff/exntnhead | **필요** |
| `04c-committee-opinion.yaml` | **소관위원회 의견서 → 결재 (1400→1500 유일 트리거)** | cmtstaff → cmthead | **필요** |
| `05-plenary-submit-and-result.yaml` | 본회의 등록 → 안건부의하기 → 가결 → 검증요청 | mainmtng | 불필요 |
| `06-legalact-toktom.yaml` | 톡돔 작성 → 부서장 결재 (1900 self-loop) | lgactstaff → lgactuser | **필요** |
| `07-lawreg.yaml` | 정부이송작업 생성 — 법률명/법률파일 kg·ru | lgactstaff | **필요** (2개) |
| `08-govtransfer-sign-and-letter.yaml` | 서명자 지정 → 서명 → 공문 → 결재 **(1900→3200)** | lgactuser ↔ lgactstaff | **필요** |
| `09-promulgate.yaml` | 결과보고 → [완료] **(3200→3300, 종착)** | gduser | 불필요 |

의안명에 **`E2E-SEED`** 마커를 넣어 이후 단계가 대상을 식별한다.
의원 발의 경로(`00a`~`00c`)는 **`E2E-SEED MP`** — 앞부분이 같아 `01` 이후 필터에도 걸린다.

`00a` → `00b`는 **반드시 이 순서로 연속 실행**한다. `00b`는 목록 첫 행(=미서명·미게재)을 잡는데,
이미 서명된 건이 첫 행이면 [서명] 버튼이 없어 멈춘다. DSL에 조건 분기가 없어 시작 상태를 못박는 수밖에 없다.

## 계정 검색어 — 로그인 ID ≠ autocomplete 검색어

이행자·서명자·승인자·수신자 autocomplete 는 **`/hrmis/autocomplete`** 를 검색한다
(`AutoCompleteUserInput.vue:69`). 검색 대상은 **HRMIS 표시명(fullName)** 이지 로그인 ID가 아니다.
`kgst.d_com_user` 를 보고 판단하면 안 된다 — 거기엔 17건뿐이고 계정 절반이 없다.

2026-08-12 API 직접 호출로 전수 확인한 결과:

| 로그인 ID(secrets) | 검색 건수 | HRMIS 표시명 | 시나리오에 쓸 검색어 |
|---|---|---|---|
| `admin` | **0** | (HRMIS 에 없음) | autocomplete 대상으로 지정 불가 |
| `LGRVuser1` | **0** | `LGRVuser L (법률검토 부서장)` | **`LGRVuser`** + `text:"부서장"` |
| `LGRVuser2` | 1 | `LGRVuser2 L (법률검토 직원)` | `LGRVuser2` |
| `gduser1` | 1 | `gduser1 L` | `gduser1` (부서장 표기 없음 → text 불가) |
| `rahima` | 1 | `rahima L` | `rahima` |
| `cmtuser1` | 2 | `cmtuser1 L (위원회1 부서장)` | `cmtuser1` + `text:"부서장"` |
| `cmtuser10` | 1 | `cmtuser10 L (위원회1 직원)` | `cmtuser10` |
| `LGGSPLZ` | 2 | `LGGSPLZ L (언어심사 부서장)` | `LGGSPLZ` + `text:"부서장"` |
| `LGGSPLZ2` | 1 | `LGGSPLZ2 L (언어심사 직원)` | `LGGSPLZ2` |
| `lgexntnuser` | 2 | `lgexntnuser L (전문심사 부서장)` | `lgexntnuser` + `text:"부서장"` |
| `lgexntnuser2` | 1 | `lgexntnuser2 L (전문심사 직원)` | `lgexntnuser2` |
| `legalactuser` | 2 | `legalactuser L (법적행위 부서장)` | `legalactuser` + `text:"부서장"` |
| `legalactuser2` | 1 | `legalactuser2 L (법적행위 직원)` | `legalactuser2` |

두 가지 규칙:

1. **`LGRVuser1` 만 로그인 ID로 검색되지 않는다.** 표시명이 `LGRVuser` 라서 ID를 그대로 치면 0건이다.
   2026-08-12 이 사실을 모르고 "전체 ID로 좁히면 안전하다"며 `LGRVuser1` 로 바꿨다가 검색 자체가
   깨졌다. **되돌렸으니 다시 바꾸지 말 것.**
2. **모든 부서장이 부서원과 접두어를 공유한다.** 부서장을 고르려면 `text:"부서장"` 이 필수다.
   `fullName` 의 한글 주석이 매칭되며, `posTitle` 은 러시아어(`Заведующий отделом`)라 안 걸린다.

예외: `gduser1`·`rahima` 는 후보가 1건이고 이름에 직급 표기가 없어 `text` 매칭을 쓸 수 없다.
후보가 1건이므로 그냥 첫 후보를 고르면 된다.

## 새 의안을 만드는 가장 빠른 방법

외부수신 오프라인 등록(파일 업로드 필요)보다 **`의안심사 > 의안접수`** 목록이 빠르다.
`등록요청` 상태 의안이 60건 넘게 쌓여 있고, 행을 열어 **[등록]** 만 누르면 의안번호가 채번되며
step 1200으로 들어간다(2026-08-12 기준 66건 남음).

## 실측으로 확인한 함정

1. **위원회 회부 요청은 수신함이 아니라 이행대기함으로 온다.** 수신함만 보면 못 찾는다.
2. **[C] 주 이행자를 지정하지 않으면** 부서원 화면에 `[의견서 작성]` 버튼이 아예 없다.
3. **심사보고서 등록은 프로세스를 전진시키지 않는다.** 단계를 넘기는 건 **의견서 결재**다.
   `[의견서 작성]`이 문서에 `billType`을 실어 보내고, 그 문서가 승인될 때 액션이 실행된다.
4. **검토자·작성자 칸에는 결재한 부서장 이름이 찍힌다.** 실제 작성자(부서원)가 아니다.
5. **의견서 등록 후에도 부서장 결재 전까지는 상세 목록에 안 보인다.**
   판별 기준은 `[의견서 작성]` 버튼이 사라졌는지다.
6. **서명자/승인자 autocomplete는 좌표 클릭 금지.** 부서장/부서원이 접두어를 공유해 후보가 2건
   뜨고, 좌표로 찍으면 두 번째(직원)가 잡히는 사고가 실제로 났다. `text` 매칭이나 ref로 특정할 것.
   → 아래 '계정 검색어' 절 참조.
7. **본회의는 저장만으로 부의되지 않는다.** 상세에서 **[안건부의하기]** 를 눌러야 1700이 된다.
8. **공포번호는 10자를 넘기면 안 된다.** `ebs_master.prmg_no`가 `varchar(10)`인데 프론트에 길이
   제한이 없어, 초과 입력 시 검증 메시지 없이 **500 페이지로 튕기며 입력값이 전부 날아간다.**
9. 회의(위원회)는 등록 직후 `임시저장`이고, **서명자를 지정해야 [승인 요청]이 활성화**된다.
   승인 후에야 [결과보고] 버튼이 생긴다. 본회의는 이 승인 절차가 없다.
10. **`signer_id` 가 NULL 인 레거시 이행요청은 수정 저장이 안 된다** (2026-08-14 `p5b` 재현). *(결함 아님 — 마이그레이션 미실시)*
    서명자 필드는 2026-08-01 에 추가됐고 **기존 데이터 마이그레이션은 하지 않았다**(사용자 확인).
    그래서 그 이전 요청은 `signer_id` 가 비어 있고, `signerLocked`(WS00 아니면 입력 disabled)와
    `fn_update` 의 `if (!signerId) return` 가드가 맞물려 **채울 수도 저장할 수도 없다.**
    백엔드는 서명자 없이도 받는다(`WorkRequestMapper.xml` `<if test="signerId != null">`) — 막는 건 프론트다.
    → **수정 저장을 검증하는 시나리오는 반드시 `signer_id` 가 있는 요청을 골라야 한다.**
11. **이행요청 수정 대상 고르는 조건이 4개다** — 하나라도 어기면 버튼이 없거나 저장이 막힌다.
    ① `signer_id` 있음(없으면 프론트 t11110) ② 의안링크가 `TRANSITIONED` 아님(아니면 백엔드 11157)
    ③ `WS03` 아님(맞으면 백엔드 11070)
    ④ **문서 유형이 `DMT01/02/03/05`** — `DraftsInbox.vue:379-394` 에 `CommandComponent` 가 두 벌 있고
       `canCreateWorkRequest` 가 거짓이면 `edit-yn` 없는 쪽이 렌더돼 **[변경]·[삭제]·[추가]가 아예 없다.**
       ⚠ 이때도 **[이행완료]는 보인다** — 권한 문제로 오인하기 쉽다. `DMT04`(시민민원)가 대표적이다.
    ②는 **의도된 잠금**이지 결함이 아니다.
12. **모달이 닫혔다고 저장된 게 아니다.** `fn_update` 는 API 응답을 안 기다리고 `close()` 한다 —
    서버가 거부해도 닫히고 오류 토스트만 남는다. **목록/카드 반영으로만 판정할 것.**
13. **주이행자가 응답을 마치면 C 배지가 렌더되지 않는다** (`mainWorkerSwapBlocked`).
    "눌러도 막힘"이 아니라 **"누를 것이 없음"** 이다. 음성 케이스를 쓸 때 이 차이를 혼동하지 말 것.

## 코드 상수

| 구분 | 값 |
|---|---|
| 위원회 회의결과 | `CM01`=가결 `CM02`=부결 `CM03`=안건에서 제외됨 |
| 본회의 결과 | `PL01`=가결 `PL02`=부결 `PL03`=불성립 |
| 문서종류(번호타입) | `VD05`=법률부서 의견서 `VD08`=위원회 의견서 `VD10`=언어부서 `VD11`=심사부서 `VD18`=톡돔 |
