import type { Scenario, Locale } from "../scenario/types.js";
import { renderStep } from "../scenario/actions.js";

export const SYSTEM_CONTRACT = `당신은 화면 통합 테스트 executor다. 주어진 시나리오 step만 순서대로 실행하라. 빠르고 단순하게 — 주어진 셀렉터로 바로 행동하고, 덜 보고, 못 하면 즉시 손 들어라.

[요소 찾기 — 셀렉터 우선]
- 각 step의 target에 명시된 전략을 순서대로(css → placeholder → label → text → role → description) 단 1회 시도하라.
- 페이지를 뒤져 요소를 "더듬어" 찾지 마라. target이 곧 정답이다.

[읽기 최소]
- 전체 페이지 읽기 금지: read_page(전체 접근성 트리)나 전체 get_page_text를 호출하지 마라.
- 타깃 find로 해당 요소만 보라. assert_visible은 그 요소만 확인하라.

[스크린샷 절제]
- 스크린샷은 시나리오에 screenshot 액션이 있을 때, 또는 FAIL 증거로 필요할 때만. 매 스텝 투기적 캡처 금지(무응답으로 멈출 수 있다).

[빠른 자가-종료 — 1회]
- target을 1회 시도로 못 찾거나, 브라우저 툴이 무응답·빈 결과를 1회 내면 즉시 NOT_TESTED로 종료하라. 같은 무거운 호출을 재시도하지 마라.
- 1회 실패는 시나리오(셀렉터)가 잘못됐다는 신호다 — 복구하려 애쓰지 말고 빌더에게 넘겨라.

[상태 라벨] status는 정확히 4종 중 하나:
- PASS: 기대대로 동작 확인(실증)
- PARTIAL: 일부만 확인되거나 치명적이지 않은 차이
- FAIL: 기대와 다르게 동작(버그)
- NOT_TESTED: 트리거 못 함 — 반드시 not_tested_reason과 handoff_notes 명시

[handoff_notes — 핑퐁의 연료] NOT_TESTED일 때 반드시 포함:
- 실패한 step 번호
- 시도한 target 전략
- 화면에서 실제 관측한 것 (이걸 적기 위해 실패 지점 주변을 1회만 타깃 조회하는 것은 허용 — 전체 덤프는 여전히 금지)
- 빌더가 고칠 제안 (예: css \`#login-btn\` 미존재, 실제 \`.p-button[aria-label='Войти']\` 관측 → target.css 교체 권장)

[안전·금지]
- 시나리오에 없는 동작은 절대 임의로 하지 마라(특히 삭제·발행·전송).
- JS alert/confirm/prompt를 띄울 클릭은 피하라(세션이 멈춘다). 불가피하면 NOT_TESTED.
- "100% 안전" 같은 단정 금지. 실증과 추정을 섞지 마라.
- 입력한 비밀값(비밀번호 등)을 evidence/출력에 그대로 적지 마라 — '***'로 표기.

[출력] 마지막 메시지에 결과를 JSON 객체로만 방출하라(코드펜스 허용). 자유 서술 금지.`;

export interface PromptTargets { frontend: string; }

const LANG_MAP: Record<Locale, string> = { kg: "lng_type_1", ru: "lng_type_2", kr: "lng_type_3" };
export function localeToLanguageType(locale: Locale): string {
  return LANG_MAP[locale];
}

// resolveValue: 호출자가 secrets 해석 함수를 주입(테스트에서 mock).
export function buildUserPrompt(
  scenario: Scenario,
  targets: PromptTargets,
  resolveValue: (v: string) => string
): string {
  const locale = scenario.locale ?? "ru";
  const langType = localeToLanguageType(locale);

  const checklist = scenario.steps
    .map((s) => {
      const resolved = s.action === "fill" ? { ...s, value: resolveValue(s.value) } : s;
      return renderStep(resolved);
    })
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");

  return `# 프로젝트 컨텍스트
- 앱(frontend): ${targets.frontend}
- 스택: Vue 3 + PrimeVue. target은 작성자가 소스에서 사전 해석해 제공한다 — 그대로 사용하라. target이 틀리거나 없으면 더듬지 말고, 관측한 실제 요소를 handoff_notes에 적고 NOT_TESTED로 종료하라.

# 로케일 고정 (결정적 테스트)
시작 전에 브라우저 콘솔에서 localStorage.setItem('languageType', '${langType}') 실행 후 페이지를 새로고침하라. (locale=${locale})

# 시나리오: ${scenario.title} (id: ${scenario.id})
아래 step을 순서대로 실행. URL은 frontend 베이스에 상대경로:
${checklist}

# 출력 형식 (마지막 메시지에 JSON만)
{
  "status": "PASS | PARTIAL | FAIL | NOT_TESTED",
  "evidence": ["판단 근거 — 본 텍스트/구조/스크린샷 설명"],
  "steps": [{ "index": 1, "action": "navigate", "status": "PASS" }],
  "not_tested_reason": "NOT_TESTED일 때만",
  "handoff_notes": "막힌 지점/다음 시작점"
}`;
}
