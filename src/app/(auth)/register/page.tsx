import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentActor, homePathFor } from "@/server/auth/current";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const actor = await getCurrentActor();
  if (actor) redirect(homePathFor(actor));
  return (
    <AuthCard
      title="Create your customer account"
      description="Apply for a loan, save drafts and track your applications. We'll send a link to verify your email."
      footer={
        <div className="space-y-2">
          <p>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
          <p className="text-xs">
            Agent accounts are by invitation only. If you would like to become an agent,{" "}
            <Link href="/contact" className="text-primary hover:underline">
              contact us
            </Link>
            .
          </p>
        </div>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
