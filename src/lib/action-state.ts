/** Result shape returned by every Server Action to its form. Contains only safe, user-facing data. */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: Record<string, unknown>;
  /** Monotonic counter so identical consecutive results still trigger effects (toasts/resets). */
  at?: number;
}

export const idleState: ActionState = { status: "idle" };
