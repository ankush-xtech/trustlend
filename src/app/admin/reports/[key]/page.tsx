import { notFound } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { REPORTS, runReport, type ReportKey } from "@/server/services/reports";
import { EmptyState, FilterBar, FilterInput, LinkButton, PageHeader, sp } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Report" };

const MONEY_COLUMNS = /amount|requested|disbursed$|commission|total/i;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "reports.read");
  const { key } = await params;
  if (!(key in REPORTS)) notFound();
  const sparams = await searchParams;
  const range = { from: sp(sparams, "from"), to: sp(sparams, "to") };
  const report = REPORTS[key as ReportKey];
  const data = await runReport(actor, key as ReportKey, range);
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => !!v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={report.title}
        description={report.description}
        breadcrumb={{ href: "/admin/reports", label: "Reports" }}
        actions={
          actor.permissions.has("reports.export") ? (
            <LinkButton href={`/api/reports/${key}/export${qs ? `?${qs}` : ""}`} variant="outline" prefetch={false}>
              <DownloadIcon /> Export CSV
            </LinkButton>
          ) : null
        }
      />
      <FilterBar basePath={`/admin/reports/${key}`}>
        <FilterInput label="From" name="from" type="date" defaultValue={range.from} />
        <FilterInput label="To" name="to" type="date" defaultValue={range.to} />
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState title="No data for this period" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                {data.columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((cell, j) => (
                    <TableCell key={j} className={typeof cell === "number" || MONEY_COLUMNS.test(data.columns[j]) ? "tabular-nums" : undefined}>
                      {cell === null ? "—" : String(cell).replace(/_/g, " ")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Amounts are in INR. Times are stored in UTC.</p>
    </>
  );
}
