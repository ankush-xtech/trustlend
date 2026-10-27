import Link from "next/link";
import { FileCheck2Icon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listPendingDocumentQueue } from "@/server/services/requests";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Document review" };

export default async function Page() {
  const actor = await requirePagePermission("admin", "applications.review_documents");
  if (!actor.permissions.has("applications.read_all")) {
    return (
      <>
        <PageHeader title="Document review" />
        <EmptyState title="Use the employee workspace" description="You can review documents on applications assigned to you in the employee workspace." />
      </>
    );
  }
  const rows = await listPendingDocumentQueue(actor);
  return (
    <>
      <PageHeader
        title="Document review queue"
        description="Applications with documents awaiting review, oldest first. Verification is an explicit staff decision; uploads are never auto-verified."
      />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pending documents</TableHead>
                <TableHead>Oldest upload</TableHead>
                <TableHead>Assignee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.applicationId}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/admin/applications/${r.applicationId}`} className="text-primary hover:underline">
                      {r.reference}
                    </Link>
                  </TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>{r.pending}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.oldest)}</TableCell>
                  <TableCell className="text-xs">{r.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState icon={<FileCheck2Icon />} title="No documents waiting" description="New uploads on submitted applications appear here." />
      )}
    </>
  );
}
