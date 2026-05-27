import type { Step, ActionName, Target } from "./types.js";

// Priority order matches design §7: css/id > placeholder/label > text > role > description.
export function describeTarget(t: Target): string {
  const parts: string[] = [];
  if (t.css) parts.push(`css ${t.css}`);
  if (t.placeholder) parts.push(`placeholder "${t.placeholder}"`);
  if (t.label) parts.push(`label "${t.label}"`);
  if (t.text) parts.push(`text "${t.text}"`);
  if (t.role) parts.push(`role ${t.role}`);
  if (t.description) parts.push(`description "${t.description}"`);
  return parts.join(" / ") || "(no target)";
}

// [확장1] Single source of truth for actions + prompt rendering.
const RENDERERS: Record<ActionName, (s: any) => string> = {
  navigate: (s) => `Navigate: ${s.url}`,
  fill: (s) => `Fill: [${describeTarget(s.target)}] ← "${s.value}"`,
  click: (s) => `Click: [${describeTarget(s.target)}]${s.destructive ? " (destructive)" : ""}`,
  wait_for: (s) => `Wait for: [${describeTarget(s.target)}] to appear${s.timeout_ms ? ` (${s.timeout_ms}ms)` : ""}`,
  assert_visible: (s) => `Assert visible: [${describeTarget(s.target)}]`,
  screenshot: (s) => `Screenshot${s.name ? `: ${s.name}` : ""}`,
};

export const KNOWN_ACTIONS = Object.keys(RENDERERS) as ActionName[];
export function isKnownAction(name: string): name is ActionName {
  return (KNOWN_ACTIONS as string[]).includes(name);
}
export function renderStep(step: Step): string {
  return RENDERERS[step.action](step);
}
