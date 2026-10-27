import Link from "next/link";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { VerifyEmailForm } from "@/components/auth/simple-forms";
import { isAuthTokenValid } from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify your email", referrer: "no-referrer" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  // Checking does not consume the token; it is only consumed by the explicit POST below.
  const valid = value ? await isAuthTokenValid(value, "EMAIL_VERIFICATION") : false;
  return (
    <AuthCard title="Verify your email address" description="Confirm that this email address belongs to you to activate your account.">
      {valid ? (
        <VerifyEmailForm token={value} />
      ) : (
        <>
          <Notice tone="error">This verification link is invalid, expired or has already been used.</Notice>
          <p className="text-sm text-muted-foreground">
            If your email is already verified, you can{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              sign in
            </Link>
            . Otherwise sign in to request a new verification link.
          </p>
        </>
      )}
    </AuthCard>
  );
}
