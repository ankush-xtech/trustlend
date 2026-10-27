import { requirePagePermission } from "@/server/auth/current";
import { getAllSettings, SETTINGS, type SettingKey } from "@/server/services/settings";
import { updateSettingsAction } from "@/server/actions/admin";
import { PageHeader, Section } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { CheckboxField, TextField } from "@/components/shared/form-controls";

export const metadata = { title: "Platform settings" };

export default async function SettingsPage() {
  const actor = await requirePagePermission("admin", "settings.manage");
  const values = await getAllSettings();
  return (
    <>
      <PageHeader title="Platform settings" description="Runtime business settings. Every change is validated and recorded in the audit log. Infrastructure secrets are configured through environment variables, not here." />
      <Section>
        <ActionForm action={updateSettingsAction} className="grid max-w-2xl gap-5">
          {(Object.keys(SETTINGS) as SettingKey[]).map((key) => {
            const def = SETTINGS[key];
            const value = values[key];
            if (typeof value === "boolean") {
              return (
                <div key={key}>
                  <input type="hidden" name={key} value="false" />
                  <CheckboxField label={def.label} name={key} defaultChecked={value} description={def.description} />
                </div>
              );
            }
            return (
              <TextField
                key={key}
                label={def.label}
                name={key}
                defaultValue={String(value)}
                type={typeof value === "number" ? "number" : "text"}
                hint={def.description}
              />
            );
          })}
          <div>
            <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
          </div>
        </ActionForm>
      </Section>
      <p className="mt-3 text-xs text-muted-foreground">Signed in as {actor.email}.</p>
    </>
  );
}
