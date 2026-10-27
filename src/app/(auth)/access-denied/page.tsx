import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { LinkButton } from "@/components/shared/display";
import { getCurrentActor, homePathFor } from "@/server/auth/current";
import { logoutAction } from "@/server/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access denied" };

export default async function AccessDeniedPage() {
  const actor = await getCurrentActor();
  const home = actor ? homePathFor(actor) : null;
  return (
    <AuthCard
      title="You don't have access to this page"
      description="Your account does not have permission to open this area. If you think this is a mistake, contact your administrator."
    >
      <ShieldAlertIcon className="mb-6 size-12 text-warning" aria-hidden />
      <div className="flex flex-wrap gap-3">
        {home && home !== "/access-denied" ? <LinkButton href={home}>Go to my workspace</LinkButton> : null}
        {actor ? (
          <form action={logoutAction}>
            <button type="submit" className="inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted">
              Sign in as someone else
            </button>
          </form>
        ) : (
          <LinkButton href="/login" variant="outline">
            Sign in
          </LinkButton>
        )}
        <Link href="/" className="inline-flex h-8 items-center px-2 text-sm text-muted-foreground hover:text-foreground">
          Home
        </Link>
      </div>
    </AuthCard>
  );
}
