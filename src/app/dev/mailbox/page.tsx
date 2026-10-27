import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { env } from "@/server/config/env";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dev mailbox", robots: { index: false, follow: false } };

interface DevMail {
  id: string;
  to: string;
  subject: string;
  text: string;
  createdAt: string;
}

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="break-all text-primary underline">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Development-only viewer for emails captured by the dev email provider. Returns 404 unless
 * EMAIL_PROVIDER=dev and APP_ENV is not production. Nothing shown here was delivered.
 */
export default async function DevMailboxPage() {
  const config = env();
  if (config.EMAIL_PROVIDER !== "dev" || config.APP_ENV === "production") notFound();

  const dir = path.resolve(config.DEV_MAILBOX_DIR);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  files.sort().reverse();
  const mails: DevMail[] = [];
  for (const f of files.slice(0, 100)) {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as Partial<DevMail>;
      mails.push({
        id: String(parsed.id ?? f),
        to: String(parsed.to ?? ""),
        subject: String(parsed.subject ?? ""),
        text: String(parsed.text ?? ""),
        createdAt: String(parsed.createdAt ?? ""),
      });
    } catch {
      // skip malformed files
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-4xl px-4 py-10">
      <div role="alert" className="mb-6 rounded-lg border border-warning/40 bg-warning/15 px-4 py-3 text-sm font-medium text-[oklch(0.4_0.09_65)]">
        Development only – these emails were NOT delivered. They are written to {config.DEV_MAILBOX_DIR} by the dev email provider.
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Dev mailbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">{mails.length} message(s), newest first. Run the notification dispatcher (or trigger an action) to populate.</p>
      {mails.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-muted-foreground">No messages yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {mails.map((m) => (
            <li key={m.id} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{m.subject}</p>
                <p className="text-xs text-muted-foreground">{m.createdAt ? formatDateTime(m.createdAt) : ""}</p>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">To: {m.to}</p>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-sans text-sm leading-6">{linkify(m.text)}</pre>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
