import { STATUSES, type Status } from "./types.js";

export interface PartialResult {
  status: Status; evidence?: string[]; steps?: any[];
  handoff_notes?: string; not_tested_reason?: string;
  pattern_inference?: "assumed_ok" | "unknown"; raw_executor_text?: string;
  parse_repaired?: boolean;
}

function extractJson(text: string): any | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

function salvageString(text: string, key: string): string | undefined {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`));
  if (!m) return undefined;
  try { return JSON.parse(m[1]); } catch { return undefined; }
}

function salvageArray(text: string, key: string): string[] | undefined {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*(\\[[^\\]]*\\])`));
  if (!m) return undefined;
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr : undefined;
  } catch { return undefined; }
}

// Measured executor bug (seed-02, seed-05): a step index emitted as a range ("index": 35-36) is not
// valid JSON, so the whole envelope failed to parse and two real PASS runs were filed as NOT_TESTED
// — losing handoff_notes, the only fuel for fixing the scenario. Salvage the envelope's own fields
// from the raw text instead of discarding everything.
// Read status ONLY from the part before "steps": a status inside the steps array belongs to a single
// step, and promoting that to the run's verdict would turn a failed run into a PASS.
function salvage(text: string): PartialResult | null {
  const stepsAt = text.search(/"steps"\s*:/);
  const head = stepsAt === -1 ? text : text.slice(0, stepsAt);
  const status = head.match(/"status"\s*:\s*"(PASS|PARTIAL|FAIL|NOT_TESTED)"/)?.[1] as Status | undefined;
  if (!status) return null;
  return {
    status,
    evidence: salvageArray(text, "evidence"),
    handoff_notes: salvageString(text, "handoff_notes"),
    not_tested_reason: salvageString(text, "not_tested_reason"),
    parse_repaired: true,
    raw_executor_text: text,
  };
}

export function parseExecutorResult(resultText: string): PartialResult {
  const obj = extractJson(resultText);
  if (!obj || typeof obj !== "object")
    return salvage(resultText)
      ?? { status: "NOT_TESTED", not_tested_reason: "could not parse JSON out of the executor's output", raw_executor_text: resultText };
  if (!STATUSES.includes(obj.status))
    return { status: "NOT_TESTED", not_tested_reason: `status is not one of the four labels: ${String(obj.status)}`, raw_executor_text: resultText };
  return {
    status: obj.status,
    evidence: Array.isArray(obj.evidence) ? obj.evidence : undefined,
    steps: Array.isArray(obj.steps) ? obj.steps : undefined,
    handoff_notes: typeof obj.handoff_notes === "string" ? obj.handoff_notes : undefined,
    not_tested_reason: typeof obj.not_tested_reason === "string" ? obj.not_tested_reason : undefined,
    pattern_inference: obj.pattern_inference,
  };
}
