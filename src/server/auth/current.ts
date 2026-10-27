import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadActor, type Actor } from "@/server/rbac/actor";
import type { PermissionKey } from "@/server/rbac/catalog";
import { sessionCookieName, validateSessionToken } from "./session";
import { AuthenticationError } from "@/server/errors";

/**
 * Resolves the current actor once per request (React cache). Returns null if unauthenticated,
 * the session is expired/revoked, or the account is not ACTIVE.
 */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  return loadActor(session.userId);
});

export const getCurrentSessionId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  return session?.sessionId ?? null;
});

/** For Server Actions / Route Handlers: throws AuthenticationError when not signed in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AuthenticationError();
  return actor;
}

export type Portal = "customer" | "agent" | "staff" | "admin";

/** For pages/layouts: redirects to login, or to the access-denied page if the portal permission is missing. */
export async function requirePortal(portal: Portal, nextPath?: string): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  if (!actor.permissions.has(`portal.${portal}` as PermissionKey)) redirect("/access-denied");
  return actor;
}

/** Page-level permission gate (in addition to the service-level checks). */
export async function requirePagePermission(portal: Portal, ...perms: PermissionKey[]): Promise<Actor> {
  const actor = await requirePortal(portal);
  if (!perms.some((p) => actor.permissions.has(p))) redirect("/access-denied");
  return actor;
}

/** Landing page for a user based on their permissions (highest workspace first). */
export function homePathFor(actor: Actor): string {
  if (actor.permissions.has("portal.admin")) return "/admin";
  if (actor.permissions.has("portal.staff")) return "/staff";
  if (actor.permissions.has("portal.agent")) return "/agent";
  if (actor.permissions.has("portal.customer")) return "/customer";
  return "/access-denied";
}
