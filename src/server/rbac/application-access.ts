import type { Actor } from "./actor";

/**
 * Record-level access to loan applications. Every service that reads or mutates an application
 * resolves these facts from the database (never from the browser) and calls these functions.
 *
 * View levels decide which data shape is returned:
 *  - admin    : `applications.read_all`
 *  - staff    : `applications.read_assigned` AND an ACTIVE assignment to the actor
 *  - customer : `applications.read_own` AND the application's customer is linked to the actor
 *  - agent    : `applications.read_referred` AND the application is attributed to the actor's agent profile
 */
export type AppViewLevel = "admin" | "staff" | "customer" | "agent";

export interface ApplicationAccessFacts {
  customerUserId: string | null;
  referringAgentId: string | null;
  createdById: string;
  activeAssigneeId: string | null;
}

export function applicationViewLevel(actor: Actor, f: ApplicationAccessFacts): AppViewLevel | null {
  const p = actor.permissions;
  if (p.has("applications.read_all")) return "admin";
  if (p.has("applications.read_assigned") && f.activeAssigneeId === actor.userId) return "staff";
  if (p.has("applications.read_own") && f.customerUserId === actor.userId) return "customer";
  if (p.has("applications.read_referred") && actor.agentId && f.referringAgentId === actor.agentId) return "agent";
  return null;
}

/** Owner for applicant-side actions: the customer, or the referring agent who created the application. */
export function isApplicantSide(actor: Actor, f: ApplicationAccessFacts): boolean {
  if (f.customerUserId && f.customerUserId === actor.userId) return true;
  return !!actor.agentId && f.referringAgentId === actor.agentId && f.createdById === actor.userId;
}

/** May edit wizard data / upload documents on behalf of the applicant. */
export function canActAsApplicant(actor: Actor, f: ApplicationAccessFacts): boolean {
  return actor.permissions.has("applications.create") && isApplicantSide(actor, f);
}

export function isActiveAssignee(actor: Actor, f: ApplicationAccessFacts): boolean {
  return f.activeAssigneeId === actor.userId;
}

/** Staff-side authority on an application (assigned worker or all-access reviewer). */
export function hasStaffAuthority(actor: Actor, f: ApplicationAccessFacts): boolean {
  return (
    actor.permissions.has("applications.read_all") ||
    (actor.permissions.has("applications.update_assigned") && f.activeAssigneeId === actor.userId)
  );
}
