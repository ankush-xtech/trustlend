import Link from "next/link";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/simple-forms";
import { isAuthTokenValid } from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const valid = value ? await isAuthTokenValid(value, "PASSWORD_RESET") : false;
  return (
    <AuthCard
      title="Choose a new password"
      description="After resetting, you will be signed out of all devices."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {valid ? (
        <ResetPasswordForm token={value} />
      ) : (
        <>
          <Notice tone="error">This reset link is invalid or has expired. Reset links can be used once and expire after 30 minutes.</Notice>
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new reset link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
