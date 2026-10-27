"use client";

import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/shared/form-controls";
import { contactAction } from "@/server/actions/public";

export function ContactForm() {
  return (
    <ActionForm action={contactAction} className="grid gap-4" resetOnSuccess refreshOnSuccess={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Your name" name="name" autoComplete="name" required />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
      </div>
      <SelectField
        label="Topic"
        name="topic"
        required
        placeholder="Select a topic"
        options={["General question", "My application", "Becoming an agent", "Privacy request", "Other"]}
      />
      <TextAreaField
        label="Message"
        name="message"
        rows={6}
        required
        hint="Please do not include identity numbers, bank details or passwords. If your question is about an application, include its reference."
      />
      <div aria-hidden className="hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <SubmitButton pendingText="Sending…">Send message</SubmitButton>
      </div>
    </ActionForm>
  );
}
