import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createRole, setRolePermissions, updateRole } from "@/server/services/roles";
import { assignRoleToUser, createUserWithInvitation, removeRoleFromUser, setUserStatus } from "@/server/services/users";
import { listApplications } from "@/server/services/applications";
import { AuthorizationError, BusinessRuleError } from "@/server/errors";
import { actorFor, auditActions, createUser, resetDatabase } from "./helpers";

let superAdminId: string;
let adminId: string;

beforeAll(async () => {
  await resetDatabase();
  superAdminId = (await createUser("super_admin")).id;
  adminId = (await createUser("admin")).id;
});

describe("dynamic roles", () => {
  it("creates a custom role whose permissions take effect immediately and can be revoked", async () => {
    const superAdmin = await actorFor(superAdminId);
    const roleId = await createRole(superAdmin, {
      key: "senior_reviewer",
      name: "Senior Reviewer",
      description: "Custom loan officer role",
      permissionKeys: ["portal.staff", "applications.read_assigned"],
    });
    const user = await createUser("");
    await assignRoleToUser(superAdmin, user.id, roleId);
    let actor = await actorFor(user.id);
    expect(actor.permissions.has("applications.read_assigned")).toBe(true);
    expect(actor.permissions.has("applications.review_documents")).toBe(false);
    await expect(listApplications(actor, "assigned", {})).resolves.toBeTruthy();
    await expect(listApplications(actor, "all", {})).rejects.toBeInstanceOf(AuthorizationError);

    await setRolePermissions(superAdmin, roleId, ["portal.staff", "applications.read_assigned", "applications.review_documents"]);
    actor = await actorFor(user.id);
    expect(actor.permissions.has("applications.review_documents")).toBe(true);

    await setRolePermissions(superAdmin, roleId, ["portal.staff"]);
    actor = await actorFor(user.id);
    expect(actor.permissions.has("applications.read_assigned")).toBe(false);
    await expect(listApplications(actor, "assigned", {})).rejects.toBeInstanceOf(AuthorizationError);

    await updateRole(superAdmin, roleId, { name: "Senior Reviewer", description: "", isActive: false });
    actor = await actorFor(user.id);
    expect(actor.permissions.size).toBe(0);

    const actions = await auditActions(roleId);
    expect(actions).toEqual(expect.arrayContaining(["role.created", "role.permissions_changed", "role.updated"]));
  });

  it("prevents admins from granting permissions they do not hold", async () => {
    const admin = await actorFor(adminId);
    await expect(createRole(admin, { key: "sneaky", name: "Sneaky", permissionKeys: ["roles.manage"] })).rejects.toBeInstanceOf(AuthorizationError);
    const [superRole] = await db.select().from(s.roles).where(eq(s.roles.key, "super_admin"));
    const target = await createUser("customer");
    await expect(assignRoleToUser(admin, target.id, superRole.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createUserWithInvitation(admin, { name: "New Boss", email: "boss@it.test", roleIds: [superRole.id] })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("prevents customers from elevating their own privileges", async () => {
    const customerUser = await createUser("customer");
    const customer = await actorFor(customerUser.id);
    const [adminRole] = await db.select().from(s.roles).where(eq(s.roles.key, "admin"));
    await expect(assignRoleToUser(customer, customer.userId, adminRole.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createRole(customer, { key: "me_admin", name: "Me", permissionKeys: [] })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setRolePermissions(customer, adminRole.id, [])).rejects.toBeInstanceOf(AuthorizationError);
    expect((await actorFor(customer.userId)).roleKeys).toEqual(["customer"]);
  });

  it("protects the super admin role and the last super admin", async () => {
    const superAdmin = await actorFor(superAdminId);
    const [superRole] = await db.select().from(s.roles).where(eq(s.roles.key, "super_admin"));
    await expect(setRolePermissions(superAdmin, superRole.id, [])).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(removeRoleFromUser(superAdmin, superAdminId, superRole.id)).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(setUserStatus(superAdmin, superAdminId, "DISABLED", "testing")).rejects.toBeInstanceOf(BusinessRuleError); // self
    const admin = await actorFor(adminId);
    await expect(setUserStatus(admin, superAdminId, "DISABLED", "testing")).rejects.toBeInstanceOf(AuthorizationError);
  });
});
