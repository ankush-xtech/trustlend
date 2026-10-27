import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { isAppError, RateLimitError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Executes a Server Action body and converts the outcome into a safe ActionState.
 * Known AppErrors become user messages; anything else is logged and replaced with a generic message
 * so internal details never reach the browser. Next.js redirect/notFound signals are re-thrown.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  success?: string | ((result: T) => string),
  data?: (result: T) => Record<string, unknown>,
): Promise<ActionState> {
  try {
    const result = await fn();
    return {
      status: "success",
      message: typeof success === "function" ? success(result) : success,
      data: data ? data(result) : undefined,
      at: Date.now(),
    };
  } catch (err) {
    unstable_rethrow(err);
    if (isAppError(err)) {
      const message = err instanceof RateLimitError ? `${err.message} (try again in about ${Math.ceil(err.retryAfterSeconds / 60)} min)` : err.message;
      return { status: "error", message, fieldErrors: err.fieldErrors, at: Date.now() };
    }
    logger.error("server action failed", { error: err });
    return { status: "error", message: "Something went wrong. Please try again.", at: Date.now() };
  }
}

/**
 * Converts FormData into a nested object. Supports dotted names (`a.b`, `items.0.name`),
 * repeated names (`key[]`) and checkbox values ("on" → true).
 */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of formData.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    if (typeof rawValue !== "string") continue;
    const value: unknown = rawValue === "on" ? true : rawValue;
    if (rawKey.endsWith("[]")) {
      const key = rawKey.slice(0, -2);
      const arr = (out[key] as unknown[]) ?? [];
      arr.push(value);
      out[key] = arr;
      continue;
    }
    const parts = rawKey.split(".");
    let cursor: Record<string, unknown> | unknown[] = out;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
      const key = /^\d+$/.test(part) ? Number(part) : part;
      const container = cursor as Record<string | number, unknown>;
      if (last) container[key] = value;
      else {
        container[key] ??= nextIsIndex ? [] : {};
        cursor = container[key] as Record<string, unknown>;
      }
    });
  }
  return out;
}

export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}
