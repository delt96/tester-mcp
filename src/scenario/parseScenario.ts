import { parse as parseYaml } from "yaml";
import type { Scenario, Step, Locale } from "./types.js";
import { isKnownAction } from "./actions.js";

const LOCALES: Locale[] = ["kg", "ru", "kr"];

export function parseScenario(yamlText: string): Scenario {
  return parseScenarioObject(parseYaml(yamlText));
}

export function parseScenarioObject(rawIn: unknown): Scenario {
  const raw = rawIn as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("scenario YAML parse failed: empty document");
  if (typeof raw.id !== "string") throw new Error("scenario is missing a required field: id");
  if (!/^[A-Za-z0-9._-]+$/.test(raw.id)) {
    throw new Error(`invalid scenario id '${raw.id}' — only letters, digits and .-_ are allowed (blocks path injection)`);
  }
  if (typeof raw.title !== "string") throw new Error("scenario is missing a required field: title");
  if (!Array.isArray(raw.steps) || raw.steps.length === 0)
    throw new Error("scenario is missing a required field: steps");

  const steps = raw.steps.map((st: any, i: number): Step => {
    if (!st || typeof st.action !== "string") throw new Error(`step[${i}]: missing action`);
    if (!isKnownAction(st.action))
      throw new Error(`step[${i}]: unknown action "${st.action}" (screen actions only)`);
    if (st.optional !== undefined && typeof st.optional !== "boolean")
      throw new Error(`step[${i}]: 'optional' must be true or false`);
    return st as Step;
  });

  const locale = LOCALES.includes(raw.locale as Locale) ? (raw.locale as Locale) : undefined;

  let tags: string[] | undefined;
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== "string"))
      throw new Error("scenario field 'tags' must be a list of strings");
    tags = raw.tags as string[];
  }

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
    tags,
  };
}
