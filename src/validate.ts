import type { Scenario } from "./scenario/types.js";
import { loadScenario } from "./scenario/loadScenario.js";

export interface ValidationReport {
  file: string;
  ok: boolean;
  error?: string;
  steps?: number;
  scenario?: Scenario;
}

export function validateScenarioFiles(files: string[], vars: Record<string, string>): ValidationReport[] {
  return files.map((file) => {
    try {
      const scenario = loadScenario(file, vars);
      return { file, ok: true, steps: scenario.steps.length, scenario };
    } catch (err) {
      return { file, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
