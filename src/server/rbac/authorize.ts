import type { Actor } from "./actor";
import type { PermissionKey } from "./catalog";
import { SYSTEM_ROLE_KEYS } from "./catalog";
import { AuthenticationError, AuthorizationError } from "@/server/errors";

/**
 * Central authorization helpers used by every service. These are pure functions over the Actor so
 * they are trivially unit-testable and cannot be bypassed by UI state.
 */

export function requireAuthenticated(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new AuthenticationError();
}

/** Requires ALL listed permissions. */
export function requirePermission(actor: Actor | null | undefined, ...perms: PermissionKey[]): asserts actor is Actor {
  requireAuthenticated(actor);
  for (const p of perms) if (!actor.permissions.has(p)) throw new AuthorizationError();
}

/** Requires AT LEAST ONE of the listed permissions. */
export function requireAnyPermission(actor: Actor | null | undefined, ...perms: PermissionKey[]): asserts actor is Actor {
  requireAuthenticated(actor);
  if (!perms.some((p) => actor.permissions.has(p))) throw new AuthorizationError();
}

export function isSuperAdmin(actor: Actor): boolean {
  return actor.roleKeys.includes(SYSTEM_ROLE_KEYS.SUPER_ADMIN);
}

/**
 * Anti-privilege-escalation rule: an actor may only grant permissions they themselves hold.
 * Applies to editing role permissions and to assigning roles to users.
 */
export function assertCanGrant(actor: Actor, permissionKeys: Iterable<string>) {
  const missing = [...permissionKeys].filter((k) => !actor.permissions.has(k));
  if (missing.length > 0) {
    throw new AuthorizationError("You cannot grant permissions that you do not hold yourself.");
  }
}

/** Only super admins may assign/remove the super admin role or alter users who hold it. */
export function assertCanManageRoleKey(actor: Actor, roleKey: string) {
  if (roleKey === SYSTEM_ROLE_KEYS.SUPER_ADMIN && !isSuperAdmin(actor)) {
    throw new AuthorizationError("Only a Super Admin can manage the Super Admin role.");
  }
}
