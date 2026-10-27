import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentActor, homePathFor } from "@/server/auth/current";
import { safeNextPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const next = safeNextPath(get("next")) ?? undefined;
  const actor = await getCurrentActor();
  if (actor) redirect(next ?? homePathFor(actor));

  return (
    <AuthCard
      title="Sign in to TrustLend"
      description="Customers, agents and staff all sign in here. You'll be taken to your workspace."
      footer={
        <p>
          New customer?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
          . Agent and staff accounts are created by invitation.
        </p>
      }
    >
      {get("signedOut") ? <Notice tone="success">You have been signed out.</Notice> : null}
      {get("reset") ? <Notice tone="success">Your password was reset. Please sign in with your new password.</Notice> : null}
      {get("verified") ? <Notice tone="success">Your email address is verified. You can now sign in.</Notice> : null}
      {next && !get("signedOut") ? <Notice tone="info">Please sign in to continue.</Notice> : null}
      <LoginForm next={next} />
    </AuthCard>
  );
}
