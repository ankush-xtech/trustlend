import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { permissions, rolePermissions, roles, userRoles, users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { assertCanGrant, requireAnyPermission, requirePermission } from "@/server/rbac/authorize";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";
import { BusinessRuleError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { recordAudit } from "./audit";

export async function listPermissionsCatalog(actor: Actor) {
  requireAnyPermission(actor, "roles.manage", "permissions.manage", "roles.assign");
  return db.select().from(permissions).orderBy(asc(permissions.category), asc(permissions.key));
}

export async function listRoles(actor: Actor) {
  requireAnyPermission(actor, "roles.manage", "permissions.manage", "roles.assign", "users.read");
  return db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
      isActive: roles.isActive,
      userCount: sql<number>`(select count(*)::int from user_roles ur where ur.role_id = ${qcol(roles.id)})`,
      permissionCount: sql<number>`(select count(*)::int from role_permissions rp where rp.role_id = ${qcol(roles.id)})`,
    })
    .from(roles)
    .orderBy(asc(roles.isSystem), asc(roles.name));
}

export async function getRoleDetail(actor: Actor, roleId: string) {
  requireAnyPermission(actor, "roles.manage", "permissions.manage", "roles.assign");
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new NotFoundError();
  const granted = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, status: users.status })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(userRoles.roleId, roleId))
    .orderBy(asc(users.name))
    .limit(200);
  return { ...role, permissionKeys: granted.map((g) => g.key), members };
}

export const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,40}$/, "Use 3-40 lowercase letters, numbers or underscores"),
  name: z.string().trim().min(2, "Enter a role name").max(60),
  description: z.string().trim().max(300).default(""),
  permissionKeys: z.array(z.string()).max(200).default([]),
});

export async function createRole(actor: Actor, input: unknown) {
  requirePermission(actor, "roles.manage");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  if (data.permissionKeys.length) requirePermission(actor, "permissions.manage");
  assertCanGrant(actor, data.permissionKeys);
  return db.transaction(async (tx) => {
    const perms = data.permissionKeys.length
      ? await tx.select({ id: permissions.id, key: permissions.key }).from(permissions).where(inArray(permissions.key, data.permissionKeys))
      : [];
    if (perms.length !== new Set(data.permissionKeys).size) throw new ValidationError(undefined, { permissionKeys: ["Unknown permission"] });
    let roleId: string;
    try {
      const [r] = await tx
        .insert(roles)
        .values({ key: data.key, name: data.name, description: data.description, isSystem: false })
        .returning({ id: roles.id });
      roleId = r.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationError(undefined, { key: ["A role with this key already exists"] });
      throw e;
    }
    if (perms.length) {
      await tx.insert(rolePermissions).values(perms.map((p) => ({ roleId, permissionId: p.id, grantedById: actor.userId })));
    }
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "role.created",
      entityType: "role",
      entityId: roleId,
      after: { key: data.key, name: data.name, permissions: data.permissionKeys.sort() },
    });
    return roleId;
  });
}

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(""),
  isActive: z.boolean(),
});

export async function updateRole(actor: Actor, roleId: string, input: unknown) {
  requirePermission(actor, "roles.manage");
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).for("update").limit(1);
    if (!role) throw new NotFoundError();
    if (role.isSystem && !parsed.data.isActive) throw new BusinessRuleError("System roles cannot be deactivated.");
    if (role.isSystem && parsed.data.name !== role.name) throw new BusinessRuleError("System roles cannot be renamed.");
    // Deactivating a role removes its permissions from members, which the actor must be entitled to change.
    if (role.isActive !== parsed.data.isActive) {
      const keys = (
        await tx
          .select({ key: permissions.key })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
          .where(eq(rolePermissions.roleId, roleId))
      ).map((r) => r.key);
      assertCanGrant(actor, keys);
    }
    await tx
      .update(roles)
      .set({ name: parsed.data.name, description: parsed.data.description, isActive: parsed.data.isActive, updatedAt: new Date() })
      .where(eq(roles.id, roleId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "role.updated",
      entityType: "role",
      entityId: roleId,
      before: { name: role.name, description: role.description, isActive: role.isActive },
      after: parsed.data,
    });
  });
}

/**
 * Replaces a role's permission set. The actor must hold every permission being added or removed,
 * and the Super Admin role's permissions are immutable from the UI.
 */
export async function setRolePermissions(actor: Actor, roleId: string, permissionKeysInput: unknown) {
  requirePermission(actor, "permissions.manage");
  const parsed = z.array(z.string()).max(200).safeParse(permissionKeysInput);
  if (!parsed.success) throw new ValidationError("Invalid permission list");
  const desired = new Set(parsed.data);
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).for("update").limit(1);
    if (!role) throw new NotFoundError();
    if (role.key === SYSTEM_ROLE_KEYS.SUPER_ADMIN) throw new BusinessRuleError("The Super Admin role's permissions cannot be changed.");
    const all = await tx.select({ id: permissions.id, key: permissions.key }).from(permissions);
    const byKey = new Map(all.map((p) => [p.key, p.id]));
    for (const k of desired) if (!byKey.has(k)) throw new ValidationError(`Unknown permission: ${k}`);

    const currentKeys = new Set(
      (
        await tx
          .select({ key: permissions.key })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
          .where(eq(rolePermissions.roleId, roleId))
      ).map((r) => r.key),
    );
    const added = [...desired].filter((k) => !currentKeys.has(k));
    const removed = [...currentKeys].filter((k) => !desired.has(k));
    if (!added.length && !removed.length) return;
    assertCanGrant(actor, [...added, ...removed]);

    if (removed.length) {
      await tx.delete(rolePermissions).where(
        and(
          eq(rolePermissions.roleId, roleId),
          inArray(
            rolePermissions.permissionId,
            removed.map((k) => byKey.get(k)!),
          ),
        ),
      );
    }
    if (added.length) {
      await tx.insert(rolePermissions).values(added.map((k) => ({ roleId, permissionId: byKey.get(k)!, grantedById: actor.userId })));
    }
    await tx.update(roles).set({ updatedAt: new Date() }).where(eq(roles.id, roleId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "role.permissions_changed",
      entityType: "role",
      entityId: roleId,
      before: { permissions: [...currentKeys].sort() },
      after: { permissions: [...desired].sort(), added, removed },
    });
  });
}

/** Permission catalog with the roles currently holding each permission. */
export async function listPermissionsWithRoles(actor: Actor) {
  requireAnyPermission(actor, "roles.manage", "permissions.manage", "roles.assign");
  return db
    .select({
      id: permissions.id,
      key: permissions.key,
      description: permissions.description,
      category: permissions.category,
      isSensitive: permissions.isSensitive,
      roleNames: sql<string[]>`coalesce((select array_agg(r.name order by r.name) from role_permissions rp join roles r on r.id = rp.role_id where rp.permission_id = ${qcol(permissions.id)}), '{}')`,
    })
    .from(permissions)
    .orderBy(asc(permissions.category), asc(permissions.key));
}
