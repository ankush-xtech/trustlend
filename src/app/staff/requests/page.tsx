import { MessageSquareIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listRequestsForActor } from "@/server/services/requests";
import { EmptyState, PageHeader } from "@/components/shared/display";
import { RequestsTable } from "@/components/applications/requests-table";

export const metadata = { title: "Information requests" };

export default async function Page() {
  const actor = await requirePagePermission("staff", "applications.read_assigned");
  const rows = await listRequestsForActor(actor, "assigned", "OPEN");
  return (
    <>
      <PageHeader title="Missing-information requests" description="Open and responded requests on applications assigned to you. Resolve responded requests after checking them." />
      {rows.length ? (
        <RequestsTable rows={rows} hrefBase="/staff/applications" showCustomer />
      ) : (
        <EmptyState icon={<MessageSquareIcon />} title="No open requests" description="Requests you send to applicants appear here until resolved." />
      )}
    </>
  );
}
