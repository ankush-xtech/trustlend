import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { formatDateTime } from "@/lib/format";
import { DescriptionList, PageHeader, Section } from "./display";
import { ChangePasswordForm, ProfileForm } from "./profile-forms";

/** Shared profile & security page body for all portals (operates on the signed-in user only). */
export async function ProfilePage({ actor, extra }: { actor: Actor; extra?: React.ReactNode }) {
  const [user] = await db
    .select({ name: users.name, phone: users.phone, email: users.email, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  return (
    <>
      <PageHeader title="Profile & security" description="Manage your personal details and password." />
      <div className="grid gap-6">
        <Section title="Account">
          <DescriptionList
            items={[
              { label: "Roles", value: actor.roleKeys.map((r) => r.replace(/_/g, " ")).join(", ") || "—" },
              { label: "Email verified", value: user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : "Not verified" },
              { label: "Last sign-in", value: formatDateTime(user.lastLoginAt) },
              { label: "Member since", value: formatDateTime(user.createdAt) },
            ]}
          />
        </Section>
        {extra}
        <Section title="Personal details">
          <ProfileForm name={user.name} phone={user.phone} email={user.email} />
        </Section>
        <Section title="Password" description="Changing your password signs you out of all other devices.">
          <ChangePasswordForm />
        </Section>
      </div>
    </>
  );
}
