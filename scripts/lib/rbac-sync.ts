import { and, eq, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { permissions, rolePermissions, roles } from "../../src/server/db/schema";
import { PERMISSIONS, SYSTEM_ROLES, SYSTEM_ROLE_KEYS } from "../../src/server/rbac/catalog";

/**
 * Synchronizes the permission catalog and system roles into the database. Safe to run repeatedly:
 *  - permissions are upserted; permissions removed from the catalog are deleted
 *  - system roles are created with default permissions on first run only (admins manage them afterwards)
 *  - the Super Admin role always holds every permission it is defined with
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncRbac(db: NodePgDatabase<any>) {
  for (const p of PERMISSIONS) {
    const sensitive = "sensitive" in p ? !!p.sensitive : false;
    await db
      .insert(permissions)
      .values({ key: p.key, description: p.description, category: p.category, isSensitive: sensitive })
      .onConflictDoUpdate({ target: permissions.key, set: { description: p.description, category: p.category, isSensitive: sensitive } });
  }
  const keys = PERMISSIONS.map((p) => p.key) as string[];
  await db.delete(permissions).where(notInArray(permissions.key, keys));
  const allPerms = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const idByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  for (const def of SYSTEM_ROLES) {
    const [existing] = await db.select().from(roles).where(eq(roles.key, def.key)).limit(1);
    let roleId = existing?.id;
    if (!existing) {
      const [created] = await db
        .insert(roles)
        .values({ key: def.key, name: def.name, description: def.description, isSystem: true, isActive: true })
        .returning({ id: roles.id });
      roleId = created.id;
      await db
        .insert(rolePermissions)
        .values(def.permissions.map((k) => ({ roleId: roleId!, permissionId: idByKey.get(k)! })))
        .onConflictDoNothing();
    } else if (def.key === SYSTEM_ROLE_KEYS.SUPER_ADMIN) {
      const wanted = def.permissions.map((k) => idByKey.get(k)!);
      await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, roleId!), notInArray(rolePermissions.permissionId, wanted)));
      await db.insert(rolePermissions).values(wanted.map((permissionId) => ({ roleId: roleId!, permissionId }))).onConflictDoNothing();
    }
  }
  return { permissions: keys.length, roles: SYSTEM_ROLES.length };
}

