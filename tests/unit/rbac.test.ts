import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/rbac/actor";
import { assertCanGrant, assertCanManageRoleKey, requireAnyPermission, requirePermission } from "@/server/rbac/authorize";
import { applicationViewLevel, canActAsApplicant, hasStaffAuthority, isApplicantSide } from "@/server/rbac/application-access";
import { SYSTEM_ROLES } from "@/server/rbac/catalog";
import { AuthenticationError, AuthorizationError } from "@/server/errors";

function actor(p: Partial<Actor> & { perms?: string[] }): Actor {
  return {
    userId: p.userId ?? "u-1",
    email: "x@test",
    name: "X",
    emailVerified: true,
    permissions: new Set(p.perms ?? []),
    roleKeys: p.roleKeys ?? [],
    agentId: p.agentId ?? null,
    agentActive: true,
    customerId: null,
  };
}

const facts = { customerUserId: "cust-user", referringAgentId: "agent-1", createdById: "agent-user", activeAssigneeId: "officer-1" };

describe("authorization helpers", () => {
  it("requires authentication and all listed permissions", () => {
    expect(() => requirePermission(null, "users.read")).toThrow(AuthenticationError);
    expect(() => requirePermission(actor({ perms: ["users.read"] }), "users.read", "users.create")).toThrow(AuthorizationError);
    expect(() => requirePermission(actor({ perms: ["users.read", "users.create"] }), "users.read", "users.create")).not.toThrow();
    expect(() => requireAnyPermission(actor({ perms: ["users.create"] }), "users.read", "users.create")).not.toThrow();
  });

  it("prevents granting permissions the actor does not hold (privilege escalation)", () => {
    const admin = actor({ perms: ["roles.assign", "users.read"] });
    expect(() => assertCanGrant(admin, ["users.read"])).not.toThrow();
    expect(() => assertCanGrant(admin, ["users.read", "roles.manage"])).toThrow(AuthorizationError);
  });

  it("only super admins can manage the super admin role", () => {
    expect(() => assertCanManageRoleKey(actor({ roleKeys: ["admin"] }), "super_admin")).toThrow(AuthorizationError);
    expect(() => assertCanManageRoleKey(actor({ roleKeys: ["super_admin"] }), "super_admin")).not.toThrow();
    expect(() => assertCanManageRoleKey(actor({ roleKeys: ["admin"] }), "loan_officer")).not.toThrow();
  });
});

describe("record-level application access", () => {
  it("customer sees only their own application", () => {
    expect(applicationViewLevel(actor({ userId: "cust-user", perms: ["applications.read_own"] }), facts)).toBe("customer");
    expect(applicationViewLevel(actor({ userId: "other-customer", perms: ["applications.read_own"] }), facts)).toBeNull();
  });

  it("agent sees only applications attributed to their agent profile", () => {
    expect(applicationViewLevel(actor({ userId: "agent-user", agentId: "agent-1", perms: ["applications.read_referred"] }), facts)).toBe("agent");
    expect(applicationViewLevel(actor({ userId: "agent2-user", agentId: "agent-2", perms: ["applications.read_referred"] }), facts)).toBeNull();
  });

  it("loan officer sees only actively assigned applications", () => {
    expect(applicationViewLevel(actor({ userId: "officer-1", perms: ["applications.read_assigned"] }), facts)).toBe("staff");
    expect(applicationViewLevel(actor({ userId: "officer-2", perms: ["applications.read_assigned"] }), facts)).toBeNull();
    expect(applicationViewLevel(actor({ userId: "officer-1", perms: ["applications.read_assigned"] }), { ...facts, activeAssigneeId: null })).toBeNull();
  });

  it("a custom role gets only what it is granted", () => {
    expect(applicationViewLevel(actor({ userId: "officer-1", perms: [] }), facts)).toBeNull();
    expect(applicationViewLevel(actor({ perms: ["applications.read_all"] }), facts)).toBe("admin");
  });

  it("applicant-side actions: customer owner or the creating referring agent only", () => {
    expect(isApplicantSide(actor({ userId: "cust-user" }), facts)).toBe(true);
    expect(isApplicantSide(actor({ userId: "agent-user", agentId: "agent-1" }), facts)).toBe(true);
    expect(isApplicantSide(actor({ userId: "agent-user-2", agentId: "agent-1" }), facts)).toBe(false); // same agency id but not creator
    expect(canActAsApplicant(actor({ userId: "cust-user", perms: [] }), facts)).toBe(false); // needs applications.create
  });

  it("staff authority needs an active assignment unless read_all", () => {
    expect(hasStaffAuthority(actor({ userId: "officer-1", perms: ["applications.update_assigned"] }), facts)).toBe(true);
    expect(hasStaffAuthority(actor({ userId: "officer-2", perms: ["applications.update_assigned"] }), facts)).toBe(false);
    expect(hasStaffAuthority(actor({ perms: ["applications.read_all"] }), facts)).toBe(true);
  });
});

describe("initial role catalog", () => {
  const byKey = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.key, new Set(r.permissions)]));
  it("separates highly sensitive permissions from ordinary admins", () => {
    expect(byKey.admin.has("roles.manage")).toBe(false);
    expect(byKey.admin.has("permissions.manage")).toBe(false);
    expect(byKey.admin.has("applications.change_attribution")).toBe(false);
    expect(byKey.super_admin.has("roles.manage")).toBe(true);
  });
  it("loan officers cannot read all applications or approve anything", () => {
    expect(byKey.loan_officer.has("applications.read_all")).toBe(false);
    expect(byKey.loan_officer.has("applications.record_decision")).toBe(false);
    expect(byKey.loan_officer.has("commissions.approve")).toBe(false);
  });
  it("agents cannot approve commissions or change rules", () => {
    expect(byKey.agent.has("commissions.approve")).toBe(false);
    expect(byKey.agent.has("commission_rules.manage")).toBe(false);
    expect(byKey.agent.has("commissions.read_all")).toBe(false);
  });
});
