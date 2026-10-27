import { AuthCard, Notice } from "@/components/auth/auth-card";
import { AcceptInvitationForm } from "@/components/auth/simple-forms";
import { isAuthTokenValid } from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept invitation", referrer: "no-referrer" };

export default async function AcceptInvitationPage({ searchParams }: PageProps<"/accept-invitation">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const valid = value ? await isAuthTokenValid(value, "INVITATION") : false;
  return (
    <AuthCard title="Set up your TrustLend account" description="You've been invited to TrustLend. Choose a password to activate your account.">
      {valid ? (
        <AcceptInvitationForm token={value} />
      ) : (
        <Notice tone="error">
          This invitation link is invalid, has expired or was already used. Invitations are valid for 72 hours. Please ask the person who invited you to
          resend it.
        </Notice>
      )}
    </AuthCard>
  );
}
