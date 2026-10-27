import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getApplicationDetail } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import { ApplicantView } from "@/components/applications/detail-view";
import { PageHeader, Section } from "@/components/shared/display";
import { TaskForm } from "@/components/shared/task-form";

export const metadata = { title: "Application" };

export default async function Page({ params, searchParams }: PageProps<"/agent/applications/[id]">) {
  const actor = await requirePagePermission("agent", "applications.read_referred");
  const { id } = await params;
  const { submitted } = await searchParams;
  const detail = await getApplicationDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (detail.level !== "agent") notFound();
  return (
    <>
      <PageHeader title="Referred application" breadcrumb={{ href: "/agent/applications", label: "Referred applications" }} />
      {submitted ? (
        <div className="mb-6 rounded-xl border border-success/30 bg-success/10 p-4 text-sm" role="status">
          Application <span className="font-mono">{detail.application.reference}</span> submitted. It stays attributed to you throughout processing.
        </div>
      ) : null}
      <ApplicantView d={detail} editHref={`/agent/applications/${id}/edit`} portal="agent" />
      {actor.permissions.has("tasks.manage_own") ? (
        <div className="mt-6">
          <Section title="Add a follow-up for this application">
            <TaskForm applicationId={id} />
          </Section>
        </div>
      ) : null}
    </>
  );
}
