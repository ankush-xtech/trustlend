import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/errors";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Converts a service NotFoundError (missing record or no access) into the Next.js 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
