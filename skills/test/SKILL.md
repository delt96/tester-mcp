---
name: test
description: 웹 화면 E2E 테스트를 실행한다. "이 화면/플로우 테스트해줘", "로그인 검증해줘" 같은 요청에 사용. 시나리오 YAML을 만들고 tester-mcp CLI로 claude-in-chrome executor를 띄워 검증한다.
disable-model-invocation: false
allowed-tools: Bash(tester-mcp *) Bash(node *) Read Write Edit Glob
---

# /test — 화면 E2E 테스트

현재 CLI 사용법(항상 최신):

!`tester-mcp --help 2>/dev/null || node "$CLAUDE_PROJECT_DIR/bin/tester-mcp.js" --help`

## 워크플로 (설계 §9.5 Planner 표준)

1. **정적 검증 먼저**: 변경 심볼 grep + 빌드 통과 확인.
2. **트리거 분석**: 대상 UI가 어느 화면·버튼·상태에서 렌더되는지 코드로 확인(hard 항목).
3. **시나리오 작성**: `scenarios/<area>/<id>.yaml` 생성. 요소는 `target` 다중전략(css/placeholder/text/role/description), 로케일 `locale:` 고정, 비밀값은 `${secrets...}`(env `BESTIAN_SECRET_*`). (스키마는 설계 §7.)
4. **실행**: `tester-mcp run <scenario.yaml> -c <config>` (CLI가 executor를 spawn하고 대기).
5. **결과 분기**:
   - PASS/PARTIAL → 실증 요약 + 스크린샷 보고.
   - FAIL → 어긋난 근거·스크린샷·handoff_notes 제시, 수정 진입.
   - NOT_TESTED → 이유 + pattern_inference(assumed_ok/unknown). 데이터 부족이면 precondition 안내, 반복 실패면 사람 위임.

## 검증 규율 (CLAUDE.local.md)

- 제거/변경 심볼의 참조처 grep, 런타임 의존성(localStorage·store·API 파라미터) 점검.
- 단정 표현 금지 — "X 실증, Y는 동일 패턴 추정" 형식. 실증/추정 분리.
