export type Status = "PASS" | "PARTIAL" | "FAIL" | "NOT_TESTED";
export const STATUSES: Status[] = ["PASS", "PARTIAL", "FAIL", "NOT_TESTED"];

export interface StepResult { index: number; action: string; status: Status; error?: string; screenshot?: string; }
export interface Environment { frontend_commit?: string; backend_commit?: string; browser?: string; runner_model?: string; node_version: string; os: string; }
export interface ScenarioResult {
  run_id: string; scenario_id: string; status: Status;
  not_tested_reason?: string; pattern_inference?: "assumed_ok" | "unknown";
  evidence?: string[]; started_at: string; duration_ms: number;
  steps: StepResult[]; environment: Environment;
  handoff_notes?: string; raw_executor_text?: string;
  last_tool?: string; tool_count?: number; executor_log?: string;
}
export interface RunSummary {
  run_id: string; started_at: string; total: number;
  by_status: Record<Status, number>; scenarios: { scenario_id: string; status: Status }[];
}
