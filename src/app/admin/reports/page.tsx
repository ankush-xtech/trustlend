import Link from "next/link";
import { ChartColumnIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { REPORTS } from "@/server/services/reports";
import { PageHeader } from "@/components/shared/display";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requirePagePermission("admin", "reports.read");
  return (
    <>
      <PageHeader title="Reports" description="All figures are aggregated from live database records. CSV exports require the reports.export permission and are audited." />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(REPORTS).map(([key, r]) => (
          <li key={key}>
            <Link href={`/admin/reports/${key}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs hover:border-primary/40">
              <ChartColumnIcon className="size-5 text-primary" aria-hidden />
              <span className="font-medium">{r.title}</span>
              <span className="text-sm text-muted-foreground">{r.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
