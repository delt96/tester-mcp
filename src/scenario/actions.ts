import type { Step, ActionName, Target } from "./types.js";

// Priority order matches design §7: css/id > placeholder/label > text > role > description.
export function describeTarget(t: Target): string {
  const parts: string[] = [];
  if (t.css) parts.push(`css ${t.css}`);
  if (t.placeholder) parts.push(`placeholder "${t.placeholder}"`);
  if (t.label) parts.push(`label "${t.label}"`);
  if (t.text) parts.push(`텍스트 "${t.text}"`);
  if (t.role) parts.push(`role ${t.role}`);
  if (t.description) parts.push(`설명 "${t.description}"`);
  return parts.join(" / ") || "(target 미지정)";
}

// [확장1] Single source of truth for actions + prompt rendering.
const RENDERERS: Record<ActionName, (s: any) => string> = {
  navigate: (s) => `이동: ${s.url}`,
  fill: (s) => `입력: [${describeTarget(s.target)}] ← "${s.value}"`,
  click: (s) => `클릭: [${describeTarget(s.target)}]${s.destructive ? " (비가역)" : ""}`,
  wait_for: (s) => `대기: [${describeTarget(s.target)}] 등장${s.timeout_ms ? ` (${s.timeout_ms}ms)` : ""}`,
  assert_visible: (s) => `가시 검증: [${describeTarget(s.target)}]`,
  screenshot: (s) => `스크린샷${s.name ? `: ${s.name}` : ""}`,
};

export const KNOWN_ACTIONS = Object.keys(RENDERERS) as ActionName[];
export function isKnownAction(name: string): name is ActionName {
  return (KNOWN_ACTIONS as string[]).includes(name);
}
export function renderStep(step: Step): string {
  return RENDERERS[step.action](step);
}
