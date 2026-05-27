import { parse as parseYaml } from "yaml";
import type { Scenario, Step, Locale } from "./types.js";
import { isKnownAction } from "./actions.js";

const LOCALES: Locale[] = ["kg", "ru", "kr"];

export function parseScenario(yamlText: string): Scenario {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("시나리오 YAML 파싱 실패: 빈 문서");
  if (typeof raw.id !== "string") throw new Error("시나리오 필수 필드 누락: id");
  if (!/^[A-Za-z0-9._-]+$/.test(raw.id)) {
    throw new Error(`잘못된 시나리오 id '${raw.id}' — 영문/숫자/.-_ 만 허용 (경로 주입 방지)`);
  }
  if (typeof raw.title !== "string") throw new Error("시나리오 필수 필드 누락: title");
  if (!Array.isArray(raw.steps) || raw.steps.length === 0)
    throw new Error("시나리오 필수 필드 누락: steps");

  const steps = raw.steps.map((st: any, i: number): Step => {
    if (!st || typeof st.action !== "string") throw new Error(`step[${i}]: action 누락`);
    if (!isKnownAction(st.action))
      throw new Error(`step[${i}]: 알 수 없는 액션 "${st.action}" (이 슬라이스는 화면 액션만)`);
    return st as Step;
  });

  const locale = LOCALES.includes(raw.locale as Locale) ? (raw.locale as Locale) : undefined;

  return {
    id: raw.id,
    title: raw.title,
    steps,
    locale,
    login_as: typeof raw.login_as === "string" ? raw.login_as : undefined,
    on_failure: raw.on_failure === "continue" ? "continue" : "stop",
    optional: raw.optional === true,
    defaults: (raw.defaults as any) ?? undefined,
    precondition: typeof raw.precondition === "string" ? raw.precondition : undefined,
    ephemeral: typeof raw.ephemeral === "boolean" ? raw.ephemeral : false,
  };
}
