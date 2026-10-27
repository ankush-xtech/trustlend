import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_ENV } from "../../playwright.config";

export const DEMO_PASSWORD = "TrustLend-Demo-2026";
export const demo = (local: string) => `${local}@demo.trustlend.test`;

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function logout(page: Page) {
  const button = page.getByRole("button", { name: "Sign out" });
  if (await button.count()) {
    await button.click();
    await page.waitForURL(/\/login/);
  } else {
    // e.g. on a 404 page rendered without the portal chrome
    await page.context().clearCookies();
  }
}

/** Polls the development mailbox (emails are dispatched after the response) for a link sent to `to`. */
export async function waitForEmailLink(to: string, pathPrefix: string, timeoutMs = 30_000): Promise<string> {
  const dir = path.resolve(E2E_ENV.DEV_MAILBOX_DIR);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).sort().reverse();
      for (const f of files) {
        const mail = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { to: string; text: string };
        if (mail.to.toLowerCase() !== to.toLowerCase()) continue;
        const match = mail.text.match(new RegExp(`https?://[^\\s]+${pathPrefix.replace(/[/?]/g, "\\$&")}[^\\s]+`));
        if (match) return new URL(match[0]).pathname + new URL(match[0]).search;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email with ${pathPrefix} link for ${to}`);
}

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** A tiny valid PDF (illustrative content only). */
export function pdf(label: string): Buffer {
  const text = `ILLUSTRATIVE E2E DOCUMENT ${label}`;
  const body = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n% ${text}\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export async function expectToast(page: Page, text: RegExp | string) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

export async function saveAndContinue(page: Page, nextHeading: RegExp) {
  await page.getByRole("button", { name: /save & continue/i }).click();
  await expect(page.locator("#wizard-step-heading")).toHaveText(nextHeading);
}

/** Fills wizard steps 2 (address + references) – shared by scenarios. */
export async function fillAddressStep(page: Page) {
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").first().fill("Pune");
  await page.getByLabel("State / UT").selectOption("Maharashtra");
  await page.getByLabel("PIN code").fill("411001");
  const refs = [
    ["Ravi Mehta", "Sibling", "9000011111"],
    ["Meena Iyer", "Friend", "9000022222"],
  ];
  for (let i = 0; i < refs.length; i++) {
    await page.locator(`input[name="references.${i}.fullName"]`).fill(refs[i][0]);
    await page.locator(`select[name="references.${i}.relationship"]`).selectOption(refs[i][1]);
    await page.locator(`input[name="references.${i}.mobile"]`).fill(refs[i][2]);
  }
  await page.getByLabel(/my references have agreed/i).check();
}

export async function uploadRequiredDocuments(page: Page, categories: string[]) {
  for (const c of categories) {
    await page.getByTestId(`file-${c}`).setInputFiles({ name: `${c.toLowerCase()}.pdf`, mimeType: "application/pdf", buffer: pdf(c) });
    await expectToast(page, `${c.toLowerCase()}.pdf uploaded`);
  }
}
