import { notFound, redirect } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getWizardState } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import { env } from "@/server/config/env";
import { ApplicationWizard } from "@/components/wizard/application-wizard";
import { LinkButton, PageHeader } from "@/components/shared/display";

export const metadata = { title: "Application" };

export default async function Page({ params }: PageProps<"/agent/applications/[id]/edit">) {
  const actor = await requirePagePermission("agent", "applications.create");
  const { id } = await params;
  const state = await getWizardState(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (!state.editable) redirect(`/agent/applications/${id}`);
  return (
    <>
      <PageHeader
        title={`${state.product.name} application for ${state.prefill.fullName}`}
        description="Complete the application together with the customer. Progress is saved after each step."
        breadcrumb={{ href: "/agent/applications", label: "Referred applications" }}
        actions={
          <LinkButton href="/agent" variant="outline" size="sm">
            Save & exit
          </LinkButton>
        }
      />
      <ApplicationWizard state={state} detailHref={`/agent/applications/${id}`} maxMb={env().MAX_UPLOAD_MB} />
    </>
  );
}
