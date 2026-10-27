"use server";

/**
 * Public (unauthenticated) Server Actions. Every export is a public endpoint: validate everything,
 * rate limit, and never reflect raw user input back into responses.
 */
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { emailSchema, personNameSchema } from "@/lib/validation/common";
import { ValidationError } from "@/server/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request-context";
import { db } from "@/server/db/client";
import { enqueueEmail, scheduleDispatch } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";
import { verifyEmail } from "@/server/services/auth";
import { formToObject, runAction, str } from "./run";

const contactSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  topic: z.enum(["General question", "My application", "Becoming an agent", "Privacy request", "Other"], { error: "Select a topic" }),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(3000, "Message is too long"),
  // Honeypot field: must stay empty (bots tend to fill every input).
  website: z.string().max(500).optional(),
});

export async function contactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const parsed = contactSchema.safeParse(formToObject(formData));
    if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
    const meta = await getRequestMeta();
    await consumeRateLimit(RATE_LIMITS.contact, meta.ipAddress ?? parsed.data.email);
    if (parsed.data.website) return; // silently drop bot submissions
    const to = await getSetting("support.contactEmail");
    const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    await enqueueEmail(db, {
      to,
      template: "contact_form",
      email: {
        subject: `Contact form: ${parsed.data.topic}`,
        text: `New message from the TrustLend contact form.\n\nName: ${clean(parsed.data.name)}\nEmail: ${parsed.data.email}\nTopic: ${parsed.data.topic}\nRequest ID: ${meta.requestId}\n\n${clean(parsed.data.message)}`,
      },
    });
    scheduleDispatch();
  }, "Thank you — your message has been received. We will reply by email.");
}

export async function verifyEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = str(formData, "token");
  return runAction(async () => {
    const ok = await verifyEmail(token);
    if (!ok) throw new ValidationError("This verification link is invalid, expired or has already been used. Sign in to request a new one.");
  }, "Your email address is verified. You can now sign in.");
}
