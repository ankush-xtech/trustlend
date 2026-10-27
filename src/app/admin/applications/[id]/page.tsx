import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getApplicationDetail } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import { StaffView } from "@/components/applications/detail-view";
import { LinkButton, PageHeader } from "@/components/shared/display";

export const metadata = { title: "Application" };

export default async function Page({ params }: PageProps<"/admin/applications/[id]">) {
  const actor = await requirePagePermission("admin", "applications.read_all");
  const { id } = await params;
  const detail = await getApplicationDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title="Application"
        breadcrumb={{ href: "/admin/applications", label: "Applications" }}
        actions={
          actor.permissions.has("audit_logs.read") ? (
            <LinkButton href={`/admin/audit?entityType=loan_application&entityId=${id}`} variant="outline" size="sm">
              Audit trail
            </LinkButton>
          ) : null
        }
      />
      <StaffView d={detail} actor={actor} portal="admin" />
    </>
  );
}
