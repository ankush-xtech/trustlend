import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getApplicationDetail } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import { StaffView } from "@/components/applications/detail-view";
import { PageHeader, Section } from "@/components/shared/display";
import { TaskForm } from "@/components/shared/task-form";

export const metadata = { title: "Application review" };

export default async function Page({ params }: PageProps<"/staff/applications/[id]">) {
  const actor = await requirePagePermission("staff", "applications.read_assigned", "applications.read_all");
  const { id } = await params;
  const detail = await getApplicationDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (detail.level !== "staff" && detail.level !== "admin") notFound();
  return (
    <>
      <PageHeader title="Application review" breadcrumb={{ href: "/staff", label: "Assigned applications" }} />
      <StaffView d={detail} actor={actor} portal="staff" />
      {actor.permissions.has("tasks.manage_own") ? (
        <div className="mt-6 max-w-xl">
          <Section title="Create a follow-up task">
            <TaskForm applicationId={id} />
          </Section>
        </div>
      ) : null}
    </>
  );
}
