import { PortalShell } from "@/components/layout/portal-shell";
import { requirePortal } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortal("staff");
  return (
    <PortalShell portal="staff" actor={actor}>
      {children}
    </PortalShell>
  );
}
