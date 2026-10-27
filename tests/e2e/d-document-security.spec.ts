import { expect, test } from "@playwright/test";
import { demo, login, logout, pdf, query } from "./support";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

test("Scenario D: document uploads are validated, private and audited", async ({ page, browser }) => {
  // The seeded demo customer has a home-loan draft.
  const [draft] = await query<{ id: string }>(
    `select la.id from loan_applications la join customers c on c.id = la.customer_id join users u on u.id = c.user_id
     where u.email = $1 and la.status = 'DRAFT' order by la.created_at limit 1`,
    [demo("customer")],
  );
  await login(page, demo("customer"));
  const origin = new URL(page.url()).origin;
  const upload = (name: string, buffer: Buffer, mimeType = "application/pdf") =>
    page.request.post(`/api/applications/${draft.id}/documents`, {
      headers: { Origin: origin },
      multipart: { category: "IDENTITY_PROOF", file: { name, mimeType, buffer } },
    });

  // 1. A valid allowed document is accepted
  const ok = await upload("passport.pdf", pdf("passport"));
  expect(ok.status()).toBe(201);
  const { document } = (await ok.json()) as { document: { id: string } };

  // 2. Invalid, disguised, oversized and infected uploads are rejected
  expect((await upload("not-really.pdf", Buffer.from("<script>alert(1)</script>"))).status()).toBe(422);
  expect((await upload("huge.pdf", Buffer.concat([pdf("big"), Buffer.alloc(11 * 1024 * 1024)]))).status()).toBe(422);
  expect((await upload("eicar.pdf", Buffer.concat([pdf("x"), Buffer.from(EICAR, "latin1")]))).status()).toBe(422);
  // Cross-site requests are refused (CSRF)
  const csrf = await page.request.post(`/api/applications/${draft.id}/documents`, {
    headers: { Origin: "https://evil.example" },
    multipart: { category: "IDENTITY_PROOF", file: { name: "a.pdf", mimeType: "application/pdf", buffer: pdf("a") } },
  });
  expect(csrf.status()).toBe(403);

  // The owner can download through the authorized endpoint (private, not cacheable)
  const own = await page.request.get(`/api/documents/${document.id}/download`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("application/pdf");
  expect(own.headers()["content-disposition"]).toContain("attachment");
  expect(own.headers()["cache-control"]).toContain("no-store");
  await logout(page);

  // 3. Unauthorized users cannot download it
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`${origin}/api/documents/${document.id}/download`)).status()).toBe(401);
  await anonymous.close();
  for (const who of ["agent", "officer", "agent2"]) {
    await login(page, demo(who));
    expect((await page.request.get(`/api/documents/${document.id}/download`)).status(), who).toBe(404);
    await logout(page);
  }

  // 5. Public URLs never expose private documents
  const [stored] = await query<{ storage_key: string }>("select storage_key from application_documents where id = $1", [document.id]);
  for (const path of [`/${stored.storage_key}`, `/.private-storage/${stored.storage_key}`, `/private-storage/${stored.storage_key}`]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(404);
  }
  await login(page, demo("customer"));
  await page.goto(`/customer/applications/${draft.id}/edit`);
  expect(await page.content()).not.toContain(stored.storage_key);
  await logout(page);

  // 4. Review actions are audited (uploads/downloads/verifications of the run so far)
  const audit = await query<{ action: string }>("select action from audit_logs where entity_id = $1 or entity_id = $2", [document.id, draft.id]);
  const actions = audit.map((a) => a.action);
  expect(actions).toEqual(expect.arrayContaining(["document.uploaded", "document.downloaded", "document.malware_blocked"]));
  const verified = await query("select id from audit_logs where action = 'document.verified'");
  expect(verified.length).toBeGreaterThan(0); // recorded by seed + scenario B verifications
});
