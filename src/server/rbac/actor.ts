import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db/client";
import { agents, customers, permissions, rolePermissions, roles, userRoles, users } from "@/server/db/schema";
import type { PermissionKey } from "./catalog";

/**
 * The authenticated principal for a request. Permissions are loaded fresh from the database for
 * every request, so role/permission changes and deactivations take effect immediately.
 */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  permissions: ReadonlySet<string>;
  roleKeys: readonly string[];
  agentId: string | null;
  agentActive: boolean;
  customerId: string | null;
}

export async function loadActor(userId: string, conn: DbOrTx = db): Promise<Actor | null> {
  const [user] = await conn
    .select({ id: users.id, email: users.email, name: users.name, status: users.status, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== "ACTIVE") return null;

  const rows = await conn
    .select({ roleKey: roles.key, permissionKey: permissions.key })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.isActive, true)))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  const perms = new Set<string>();
  const roleKeys = new Set<string>();
  for (const r of rows) {
    roleKeys.add(r.roleKey);
    if (r.permissionKey) perms.add(r.permissionKey);
  }

  const [agent] = await conn
    .select({ id: agents.id, status: agents.status })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);
  const [customer] = await conn.select({ id: customers.id }).from(customers).where(eq(customers.userId, userId)).limit(1);

  // A suspended agent keeps their login (to view history) but loses agent capabilities.
  if (agent && agent.status !== "ACTIVE") {
    for (const p of ["referrals.create", "applications.create"]) perms.delete(p);
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: !!user.emailVerifiedAt,
    permissions: perms,
    roleKeys: [...roleKeys],
    agentId: agent?.id ?? null,
    agentActive: agent?.status === "ACTIVE",
    customerId: customer?.id ?? null,
  };
}

export function can(actor: Actor | null | undefined, permission: PermissionKey): boolean {
  return !!actor && actor.permissions.has(permission);
}

export function canAny(actor: Actor | null | undefined, ...perms: PermissionKey[]): boolean {
  return !!actor && perms.some((p) => actor.permissions.has(p));
}

export function auditActor(actor: Actor) {
  return { userId: actor.userId, email: actor.email };
}
