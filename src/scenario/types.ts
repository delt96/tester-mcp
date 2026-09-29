// [ext6] target multi-strategy. testid omitted (this project has none — verified).
export interface Target {
  css?: string;
  placeholder?: string;
  label?: string;
  text?: string;
  role?: string;
  description?: string;   // natural language → MCP find
}

export type Locale = "kg" | "ru" | "kr";

// [ext1] Screen-only actions for this slice. Widen later (assert_toast/assert_api).
type StepBody =
  | { action: "navigate"; url: string }
  | { action: "fill"; target: Target; value: string }
  | { action: "click"; target: Target; destructive?: boolean }
  | { action: "double_click"; target: Target }
  | { action: "upload"; target: Target; file: string }
  | { action: "wait_for"; target: Target; timeout_ms?: number }
  | { action: "assert_visible"; target: Target }
  | { action: "assert_not_visible"; target: Target }
  | { action: "assert_value"; target: Target; value: string }
  | { action: "screenshot"; name?: string };
// optional: a failed step is reported SKIPPED and the run continues (even under on_failure: stop).
export type Step = StepBody & { optional?: boolean };

export type ActionName = Step["action"];

export interface Scenario {
  id: string;
  title: string;
  steps: Step[];
  locale?: Locale;                       // default "ru"
  login_as?: string;
  on_failure?: "stop" | "continue";      // default "stop"
  optional?: boolean;
  defaults?: { timeout_ms?: number };
  precondition?: string;
  ephemeral?: boolean;   // verified UI is short-lived (toast/snackbar) → immediate single check, no screenshot
  tags?: string[];
}
