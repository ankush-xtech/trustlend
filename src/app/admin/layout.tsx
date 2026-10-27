import { PortalShell } from "@/components/layout/portal-shell";
import { requirePortal } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortal("admin");
  return (
    <PortalShell portal="admin" actor={actor}>
      {children}
    </PortalShell>
  );
}
