import { STATUSES, type Status } from "./types.js";

export interface PartialResult {
  status: Status; evidence?: string[]; steps?: any[];
  handoff_notes?: string; not_tested_reason?: string;
  pattern_inference?: "assumed_ok" | "unknown"; raw_executor_text?: string;
}

function extractJson(text: string): any | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export function parseExecutorResult(resultText: string): PartialResult {
  const obj = extractJson(resultText);
  if (!obj || typeof obj !== "object")
    return { status: "NOT_TESTED", not_tested_reason: "executor 출력 JSON 파싱 실패", raw_executor_text: resultText };
  if (!STATUSES.includes(obj.status))
    return { status: "NOT_TESTED", not_tested_reason: `status 라벨이 4종 아님: ${String(obj.status)}`, raw_executor_text: resultText };
  return {
    status: obj.status,
    evidence: Array.isArray(obj.evidence) ? obj.evidence : undefined,
    steps: Array.isArray(obj.steps) ? obj.steps : undefined,
    handoff_notes: typeof obj.handoff_notes === "string" ? obj.handoff_notes : undefined,
    not_tested_reason: typeof obj.not_tested_reason === "string" ? obj.not_tested_reason : undefined,
    pattern_inference: obj.pattern_inference,
  };
}
