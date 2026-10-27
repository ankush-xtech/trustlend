"use client";

import { ActionForm, SubmitButton } from "./action-form";
import { TextField } from "./form-controls";
import { changePasswordAction, updateProfileAction } from "@/server/actions/auth";

export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  return (
    <ActionForm action={updateProfileAction} className="grid max-w-lg gap-4">
      <TextField label="Email" name="email_display" value={email} disabled hint="Contact support to change your sign-in email." />
      <TextField label="Full name" name="name" defaultValue={name} required autoComplete="name" />
      <TextField label="Mobile number" name="phone" defaultValue={phone ?? ""} inputMode="tel" autoComplete="tel" />
      <div>
        <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="grid max-w-lg gap-4" resetOnSuccess>
      <TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="10–64 characters with at least one letter and one number." />
      <TextField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
      <div>
        <SubmitButton pendingText="Updating…">Change password</SubmitButton>
      </div>
    </ActionForm>
  );
}
