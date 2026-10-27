import { notFound, redirect } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getWizardState } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import { env } from "@/server/config/env";
import { ApplicationWizard } from "@/components/wizard/application-wizard";
import { LinkButton, PageHeader } from "@/components/shared/display";

export const metadata = { title: "Application" };

export default async function Page({ params }: PageProps<"/customer/applications/[id]/edit">) {
  const actor = await requirePagePermission("customer", "applications.create");
  const { id } = await params;
  const state = await getWizardState(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (!state.editable) redirect(`/customer/applications/${id}`);
  return (
    <>
      <PageHeader
        title={`${state.product.name} application`}
        description="Your progress is saved each time you continue to the next step. You can leave and resume this draft at any time."
        breadcrumb={{ href: "/customer/applications", label: "My applications" }}
        actions={
          <LinkButton href="/customer" variant="outline" size="sm">
            Save & exit
          </LinkButton>
        }
      />
      <ApplicationWizard state={state} detailHref={`/customer/applications/${id}`} maxMb={env().MAX_UPLOAD_MB} />
    </>
  );
}
