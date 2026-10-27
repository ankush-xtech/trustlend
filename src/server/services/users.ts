import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { permissions, rolePermissions, roles, userRoles, users, type UserStatus } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { assertCanGrant, assertCanManageRoleKey, isSuperAdmin, requirePermission } from "@/server/rbac/authorize";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { emailSchema, mobileSchema, personNameSchema, reasonSchema } from "@/lib/validation/common";
import { invalidateUserSessions } from "@/server/auth/session";
import { templates } from "@/server/email/templates";
import { recordAudit } from "./audit";
import { issueAuthToken } from "./auth";
import { appUrl, enqueueEmail, scheduleDispatch } from "./notifications";
import { likePattern, pageArgs, paged, type PageParams } from "./pagination";

export async function getRolePermissionKeys(conn: DbOrTx, roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const rows = await conn
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(rolePermissions.roleId, roleIds));
  return [...new Set(rows.map((r) => r.key))];
}

async function getUserRoleKeys(conn: DbOrTx, userId: string) {
  const rows = await conn
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.key);
}

/** Users holding the super admin role are protected from changes by non-super-admins. */
async function assertCanManageUser(conn: DbOrTx, actor: Actor, targetUserId: string) {
  const keys = await getUserRoleKeys(conn, targetUserId);
  if (keys.includes(SYSTEM_ROLE_KEYS.SUPER_ADMIN) && !isSuperAdmin(actor)) {
    throw new AuthorizationError("Only a Super Admin can modify a Super Admin account.");
  }
}

async function countActiveSuperAdmins(conn: DbOrTx) {
  const [row] = await conn
    .select({ n: sql<number>`count(distinct ${users.id})::int` })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.key, SYSTEM_ROLE_KEYS.SUPER_ADMIN), eq(users.status, "ACTIVE")));
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ queries

export async function listUsers(actor: Actor, opts: PageParams & { q?: string; status?: string; roleId?: string }) {
  requirePermission(actor, "users.read");
  const { page, pageSize, offset, limit } = pageArgs(opts);
  const conds = [];
  if (opts.q) conds.push(or(ilike(users.name, likePattern(opts.q)), ilike(users.email, likePattern(opts.q))));
  if (opts.status && ["ACTIVE", "DISABLED", "INVITED"].includes(opts.status)) conds.push(eq(users.status, opts.status as UserStatus));
  if (opts.roleId && z.uuid().safeParse(opts.roleId).success) {
    conds.push(sql`exists (select 1 from user_roles ur where ur.user_id = ${qcol(users.id)} and ur.role_id = ${opts.roleId})`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      roleNames: sql<string[]>`coalesce((select array_agg(r.name order by r.name) from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${qcol(users.id)}), '{}')`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where);
  return paged(rows, total, page, pageSize);
}

export async function getUserDetail(actor: Actor, userId: string) {
  requirePermission(actor, "users.read");
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError();
  const assigned = await db
    .select({ id: roles.id, key: roles.key, name: roles.name, isActive: roles.isActive, assignedAt: userRoles.assignedAt })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(roles.name));
  return { ...user, roles: assigned };
}

// ------------------------------------------------------------------ mutations

export const createUserSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  phone: z.union([mobileSchema, z.literal("").transform(() => undefined)]).optional(),
  roleIds: z.array(z.uuid()).min(1, "Select at least one role").max(10),
});

/**
 * Admin-created users receive an invitation (no admin-chosen passwords). Role assignment is subject to
 * the anti-escalation rule: the actor must hold every permission the selected roles grant.
 */
export async function createUserWithInvitation(actor: Actor, input: unknown, conn?: DbOrTx) {
  requirePermission(actor, "users.create", "roles.assign");
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;

  const run = async (tx: DbOrTx) => {
    const selected = await tx.select().from(roles).where(inArray(roles.id, data.roleIds));
    if (selected.length !== data.roleIds.length || selected.some((r) => !r.isActive)) {
      throw new ValidationError(undefined, { roleIds: ["One or more selected roles are invalid or inactive"] });
    }
    for (const r of selected) assertCanManageRoleKey(actor, r.key);
    assertCanGrant(actor, await getRolePermissionKeys(tx, data.roleIds));

    let userId: string;
    try {
      const [u] = await tx
        .insert(users)
        .values({ name: data.name, email: data.email, phone: data.phone ?? null, status: "INVITED", createdById: actor.userId })
        .returning({ id: users.id });
      userId = u.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationError(undefined, { email: ["A user with this email already exists"] });
      throw e;
    }
    await tx.insert(userRoles).values(selected.map((r) => ({ userId, roleId: r.id, assignedById: actor.userId })));
    const token = await issueAuthToken(tx, userId, "INVITATION");
    await enqueueEmail(tx, {
      to: data.email,
      userId,
      template: "invitation",
      email: templates.invitation({
        name: data.name,
        url: appUrl(`/accept-invitation?token=${token}`),
        roleName: selected.map((r) => r.name).join(", "),
        invitedBy: actor.name,
      }),
      containsSecret: true,
    });
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "user.invited",
      entityType: "user",
      entityId: userId,
      after: { email: data.email, roles: selected.map((r) => r.key) },
    });
    return userId;
  };
  const userId = conn ? await run(conn) : await db.transaction(run);
  scheduleDispatch();
  return userId;
}

export async function resendInvitation(actor: Actor, userId: string) {
  requirePermission(actor, "users.create");
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundError();
    if (user.status !== "INVITED") throw new BusinessRuleError("This user has already accepted their invitation.");
    await assertCanManageUser(tx, actor, userId);
    const keys = await getUserRoleKeys(tx, userId);
    const token = await issueAuthToken(tx, userId, "INVITATION");
    await enqueueEmail(tx, {
      to: user.email,
      userId,
      template: "invitation",
      email: templates.invitation({ name: user.name, url: appUrl(`/accept-invitation?token=${token}`), roleName: keys.join(", "), invitedBy: actor.name }),
      containsSecret: true,
    });
    await recordAudit(tx, { actor: auditActor(actor), action: "user.invitation_resent", entityType: "user", entityId: userId });
  });
  scheduleDispatch();
}

export const updateUserSchema = z.object({
  name: personNameSchema,
  phone: z.union([mobileSchema, z.literal("").transform(() => null)]).nullable().optional(),
});

export async function updateUser(actor: Actor, userId: string, input: unknown) {
  requirePermission(actor, "users.update");
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (!before) throw new NotFoundError();
    await assertCanManageUser(tx, actor, userId);
    await tx.update(users).set({ name: parsed.data.name, phone: parsed.data.phone ?? null, updatedAt: new Date() }).where(eq(users.id, userId));
    await recordAudit(tx, { actor: auditActor(actor), action: "user.updated", entityType: "user", entityId: userId, before, after: parsed.data });
  });
}

/** Self-service profile update (name/phone only). */
export async function updateOwnProfile(actor: Actor, input: unknown) {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, actor.userId)).limit(1);
    await tx.update(users).set({ name: parsed.data.name, phone: parsed.data.phone ?? null, updatedAt: new Date() }).where(eq(users.id, actor.userId));
    await recordAudit(tx, { actor: auditActor(actor), action: "user.profile_updated", entityType: "user", entityId: actor.userId, before, after: parsed.data });
  });
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "DISABLED", reasonInput: unknown) {
  requirePermission(actor, "users.deactivate");
  const reason = reasonSchema.safeParse(reasonInput);
  if (!reason.success) throw new ValidationError(undefined, { reason: [reason.error.issues[0].message] });
  if (userId === actor.userId) throw new BusinessRuleError("You cannot change the status of your own account.");
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
    if (!user) throw new NotFoundError();
    await assertCanManageUser(tx, actor, userId);
    if (user.status === status) return;
    if (status === "ACTIVE" && user.status === "INVITED") {
      throw new BusinessRuleError("Invited users become active when they accept their invitation.");
    }
    if (status === "DISABLED") {
      const keys = await getUserRoleKeys(tx, userId);
      if (keys.includes(SYSTEM_ROLE_KEYS.SUPER_ADMIN) && (await countActiveSuperAdmins(tx)) <= 1) {
        throw new BusinessRuleError("The last active Super Admin cannot be deactivated.");
      }
    }
    await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
    if (status === "DISABLED") await invalidateUserSessions(userId, tx);
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: status === "DISABLED" ? "user.deactivated" : "user.activated",
      entityType: "user",
      entityId: userId,
      before: { status: user.status },
      after: { status },
      reason: reason.data,
    });
  });
}

export async function assignRoleToUser(actor: Actor, userId: string, roleId: string) {
  requirePermission(actor, "roles.assign");
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!role || !user) throw new NotFoundError();
    if (!role.isActive) throw new BusinessRuleError("Inactive roles cannot be assigned.");
    assertCanManageRoleKey(actor, role.key);
    await assertCanManageUser(tx, actor, userId);
    assertCanGrant(actor, await getRolePermissionKeys(tx, [roleId]));
    const inserted = await tx
      .insert(userRoles)
      .values({ userId, roleId, assignedById: actor.userId })
      .onConflictDoNothing()
      .returning({ userId: userRoles.userId });
    if (inserted.length) {
      await recordAudit(tx, { actor: auditActor(actor), action: "user.role_assigned", entityType: "user", entityId: userId, after: { role: role.key } });
    }
  });
}

export async function removeRoleFromUser(actor: Actor, userId: string, roleId: string) {
  requirePermission(actor, "roles.assign");
  await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new NotFoundError();
    assertCanManageRoleKey(actor, role.key);
    await assertCanManageUser(tx, actor, userId);
    assertCanGrant(actor, await getRolePermissionKeys(tx, [roleId]));
    if (role.key === SYSTEM_ROLE_KEYS.SUPER_ADMIN && (await countActiveSuperAdmins(tx)) <= 1) {
      throw new BusinessRuleError("The last active Super Admin cannot lose the Super Admin role.");
    }
    const deleted = await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .returning({ userId: userRoles.userId });
    if (deleted.length) {
      await recordAudit(tx, { actor: auditActor(actor), action: "user.role_removed", entityType: "user", entityId: userId, before: { role: role.key } });
    }
  });
}

/** Staff users who can work assigned applications (for assignment dropdowns). */
export async function listAssignableStaff(actor: Actor) {
  requirePermission(actor, "applications.assign");
  return db
    .selectDistinct({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.isActive, true)))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(users.status, "ACTIVE"), eq(permissions.key, "applications.update_assigned")))
    .orderBy(asc(users.name));
}
