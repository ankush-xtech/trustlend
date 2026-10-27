/**
 * Secure first Super Admin provisioning.
 *
 *   npm run admin:provision -- --email owner@yourcompany.com --name "Jane Owner"
 *
 * Creates (or upgrades) the account as INVITED with the Super Admin role and prints a single-use
 * invitation link (valid 72h) to this terminal only. No password is ever chosen by, or shown to, the
 * operator, and no default admin account exists. Refuses to create additional super admins unless
 * --additional is passed. Run from a trusted workstation against the target DATABASE_URL.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { generateToken, sha256Hex } from "../src/server/auth/crypto";
import { SYSTEM_ROLE_KEYS } from "../src/server/rbac/catalog";
import { syncRbac } from "./lib/rbac-sync";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, additional: { type: "boolean", default: false } },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Usage: npm run admin:provision -- --email you@company.com --name "Your Name" [--additional]');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle({ client: pool, schema });
  try {
    await syncRbac(db);
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, SYSTEM_ROLE_KEYS.SUPER_ADMIN)).limit(1);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.roleId, role.id));
    if (n > 0 && !values.additional) {
      console.error("A Super Admin already exists. Use --additional to provision another (this is audited).");
      process.exit(2);
    }
    const token = generateToken();
    await db.transaction(async (tx) => {
      let [user] = await tx.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
      if (!user) {
        [user] = await tx.insert(schema.users).values({ email, name, status: "INVITED" }).returning();
      } else if (user.status === "DISABLED") {
        throw new Error("This account is disabled; re-enable it through the admin UI or use another email.");
      }
      await tx.insert(schema.userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing();
      if (user.status === "INVITED") {
        await tx
          .update(schema.authTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(schema.authTokens.userId, user.id), eq(schema.authTokens.type, "INVITATION")));
        await tx.insert(schema.authTokens).values({
          userId: user.id,
          type: "INVITATION",
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        });
      }
      await tx.insert(schema.auditLogs).values({
        action: "user.super_admin_provisioned",
        entityType: "user",
        entityId: user.id,
        after: { email, via: "cli" },
        reason: "Provisioned with scripts/provision-admin.ts",
      });
      if (user.status === "INVITED") {
        const base = process.env.APP_URL || "http://localhost:3000";
        console.log("\nSuper Admin provisioned. Open this single-use link within 72 hours to set the password:\n");
        console.log(`  ${new URL(`/accept-invitation?token=${token}`, base).toString()}\n`);
        console.log("Do not share this link. It is not stored anywhere in plain text.\n");
      } else {
        console.log(`\nExisting active user ${email} was granted the Super Admin role.\n`);
      }
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[provision-admin] failed:", err.message);
  process.exit(1);
});
