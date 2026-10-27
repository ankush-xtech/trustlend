import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getApplicationDetail } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import { ApplicantView } from "@/components/applications/detail-view";
import { PageHeader } from "@/components/shared/display";

export const metadata = { title: "Application" };

export default async function Page({ params, searchParams }: PageProps<"/customer/applications/[id]">) {
  const actor = await requirePagePermission("customer", "applications.read_own");
  const { id } = await params;
  const { submitted } = await searchParams;
  const detail = await getApplicationDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (detail.level !== "customer") notFound();
  return (
    <>
      <PageHeader title="Application details" breadcrumb={{ href: "/customer/applications", label: "My applications" }} />
      {submitted ? (
        <div className="mb-6 rounded-xl border border-success/30 bg-success/10 p-4 text-sm" role="status">
          <p className="font-semibold">Your application has been submitted.</p>
          <p className="mt-1 text-muted-foreground">
            Reference <span className="font-mono">{detail.application.reference}</span>. We&apos;ll email you when there&apos;s an update. Submission does not guarantee approval.
          </p>
        </div>
      ) : null}
      <ApplicantView d={detail} editHref={`/customer/applications/${id}/edit`} portal="customer" />
    </>
  );
}
