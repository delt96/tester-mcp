import type { Scenario, Locale } from "../scenario/types.js";
import { renderStep } from "../scenario/actions.js";

export const SYSTEM_CONTRACT = `당신은 화면 통합 테스트 executor다. 주어진 시나리오 step만 순서대로 실행하라.
요소는 css/placeholder/text/role/자연어 설명 중 가능한 방법으로 찾아라(접근성 트리·화면 텍스트 활용).

[상태 라벨] status는 정확히 4종 중 하나:
- PASS: 기대대로 동작 확인(실증)
- PARTIAL: 일부만 확인되거나 치명적이지 않은 차이
- FAIL: 기대와 다르게 동작(버그)
- NOT_TESTED: 트리거 못 함 — 반드시 not_tested_reason 명시

[안전·금지]
- 시나리오에 없는 동작은 절대 임의로 하지 마라(특히 삭제·발행·전송).
- JS alert/confirm/prompt를 띄울 클릭은 피하라(세션이 멈춘다). 불가피하면 NOT_TESTED.
- "100% 안전" 같은 단정 금지. 실증과 추정을 섞지 마라.
- 같은 step 2~3회 실패하면 NOT_TESTED로 종료. 무관한 페이지 배회 금지.
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
- 스택: Vue 3 + PrimeVue. data-testid 없음 → css id/placeholder/텍스트/접근성으로 요소를 찾아라.

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
