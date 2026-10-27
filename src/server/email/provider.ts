import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/config/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Used as the provider idempotency key so a retried send is not delivered twice. */
  idempotencyKey: string;
}

export interface EmailProvider {
  readonly name: string;
  /** True only for real delivery providers. The UI never claims delivery for non-delivering providers. */
  readonly delivers: boolean;
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

/**
 * Development-only provider: writes messages to a local folder (viewable at /dev/mailbox).
 * Nothing is delivered. Refuses to run when APP_ENV=production.
 */
class DevMailboxProvider implements EmailProvider {
  readonly name = "dev-mailbox";
  readonly delivers = false;
  async send(message: EmailMessage) {
    if (env().APP_ENV === "production") throw new Error("Dev mailbox provider is disabled in production");
    const dir = path.resolve(env().DEV_MAILBOX_DIR);
    await fs.mkdir(dir, { recursive: true });
    const id = `${Date.now()}-${message.idempotencyKey}`;
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ id, ...message, createdAt: new Date().toISOString(), note: "DEVELOPMENT ONLY - NOT DELIVERED" }, null, 2),
    );
    return { messageId: `dev-${id}` };
  }
}

/** Resend (https://resend.com) delivery via its HTTPS API. */
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  readonly delivers = true;
  async send(message: EmailMessage) {
    const { RESEND_API_KEY, EMAIL_FROM } = env();
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Resend responded ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as { id?: string };
    return { messageId: json.id ?? "unknown" };
  }
}

let provider: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (!provider) provider = env().EMAIL_PROVIDER === "resend" ? new ResendProvider() : new DevMailboxProvider();
  return provider;
}
