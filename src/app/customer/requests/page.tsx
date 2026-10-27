import { MessageSquareIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listRequestsForActor } from "@/server/services/requests";
import { EmptyState, PageHeader } from "@/components/shared/display";
import { RequestsTable } from "@/components/applications/requests-table";

export const metadata = { title: "Requested information" };

export default async function Page() {
  const actor = await requirePagePermission("customer", "applications.read_own");
  const rows = await listRequestsForActor(actor, "own", "OPEN");
  return (
    <>
      <PageHeader title="Requested information" description="Open requests from our team. Open an application to respond or upload documents." />
      {rows.length ? (
        <RequestsTable rows={rows} hrefBase="/customer/applications" showCustomer={false} />
      ) : (
        <EmptyState icon={<MessageSquareIcon />} title="Nothing needed right now" description="When we need more information or documents, the request will appear here and we'll email you." />
      )}
    </>
  );
}
