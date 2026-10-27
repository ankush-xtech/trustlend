import { expect, test, type Page } from "@playwright/test";
import { demo, expectToast, fillAddressStep, login, logout, query, saveAndContinue, uploadRequiredDocuments } from "./support";

const today = new Date().toISOString().slice(0, 10);

async function submitPanel(page: Page, panelTitle: string, fill: (panel: import("@playwright/test").Locator) => Promise<void>, button: RegExp) {
  const panel = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: panelTitle, exact: true }) });
  await fill(panel);
  await panel.getByRole("button", { name: button }).click();
}

test("Scenario B: agent-referred customer through disbursement, commission approval and payment", async ({ page }) => {
  const suffix = Date.now();
  const customerEmail = `ravi.e2e.${suffix}@example.test`;

  // 1-2. Agent refers a customer
  await login(page, demo("agent"));
  await page.goto("/agent/refer");
  await page.getByLabel("Customer full name").fill("Ravi Kumar");
  await page.getByLabel("Customer email").fill(customerEmail);
  await page.getByLabel("Customer mobile").fill(`98${String(suffix).slice(-8)}`);
  await page.getByLabel(/The customer has agreed to be referred/).check();
  await page.getByRole("button", { name: "Submit referral" }).click();
  await expect(page.getByText("Customer referred.")).toBeVisible();

  // 3. Initiate the application for the customer
  await page.getByRole("link", { name: /Open customer & start application/ }).click();
  await page.getByLabel("Loan product").selectOption({ label: "Home Loan" });
  await page.getByRole("button", { name: "Start application" }).click();
  await expect(page).toHaveURL(/\/agent\/applications\/[0-9a-f-]+\/edit$/);
  const appId = page.url().split("/").at(-2)!;

  // 4. Complete and submit
  await page.getByLabel("Date of birth").fill("1985-09-30");
  await page.getByLabel("Identity document").selectOption("Passport");
  await page.getByLabel("Last 4 characters of the ID number").fill("9876");
  await saveAndContinue(page, /Address & references/);
  await fillAddressStep(page);
  await saveAndContinue(page, /Employment \/ business/);
  await page.getByLabel("Salaried").check();
  await page.getByLabel("Employer name").fill("Acme Technologies");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByLabel("Employment type").selectOption("Permanent");
  await page.getByLabel("Total work experience (months)").fill("60");
  await page.getByLabel("Net monthly income (₹)").fill("150000");
  await saveAndContinue(page, /Loan requirement/);
  await page.getByLabel("Requested loan amount (₹)").fill("4500000");
  await page.getByLabel("Preferred repayment tenure").selectOption("240");
  await page.getByLabel("Purpose of the loan").fill("Purchase of a ready-to-move apartment");
  await page.getByLabel("Property type").selectOption("Ready to move");
  await page.getByLabel("Property city").fill("Pune");
  await page.getByLabel("Estimated property value (₹)").fill("6500000");
  await page.getByLabel("Loan type").selectOption("New purchase");
  await saveAndContinue(page, /Document upload/);
  await uploadRequiredDocuments(page, ["IDENTITY_PROOF", "ADDRESS_PROOF", "INCOME_PROOF", "BANK_STATEMENT", "PROPERTY_DOCUMENT"]);
  await page.getByRole("button", { name: /continue to review/i }).click();
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page).toHaveURL(new RegExp(`/agent/applications/${appId}\\?submitted=1`));
  const [{ reference, referring_agent_id: agentId }] = await query<{ reference: string; referring_agent_id: string }>(
    "select reference, referring_agent_id from loan_applications where id = $1",
    [appId],
  );
  // 5. Attribution preserved
  const [{ id: expectedAgentId }] = await query<{ id: string }>(
    "select a.id from agents a join users u on u.id = a.user_id where u.email = $1",
    [demo("agent")],
  );
  expect(agentId).toBe(expectedAgentId);
  await logout(page);

  // 6. Admin assigns to a Loan Officer
  await login(page, demo("admin"));
  await page.goto(`/admin/applications/${appId}`);
  await page.getByLabel("Assign to").selectOption({ label: `Omar Officer Demo (${demo("officer")})` });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expectToast(page, "Application assigned");
  await expect(page.getByText(/Assigned to Omar Officer Demo/)).toBeVisible();
  await logout(page);

  // 7. A different officer cannot open it
  await login(page, demo("officer2"));
  const denied = await page.goto(`/staff/applications/${appId}`);
  expect(denied?.status()).toBe(404);
  await logout(page);

  // 8. Assigned officer completes document review and hands off
  await login(page, demo("officer"));
  await page.goto("/staff");
  await page.getByRole("link", { name: reference }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Verify" }).first().click();
    await expectToast(page, "Document verified");
    await expect(page.getByRole("button", { name: "Verify" })).toHaveCount(4 - i);
  }
  await page.getByRole("button", { name: "Mark documentation complete" }).click();
  await expectToast(page, /handed off/);
  await expect(page).toHaveURL(/\/staff\?handedOff=1/);
  await expect(page.getByRole("link", { name: reference })).toHaveCount(0); // access ends with the assignment
  expect((await query<{ status: string }>("select status from loan_applications where id = $1", [appId]))[0].status).toBe("READY_FOR_ADMIN_REVIEW");
  await logout(page);

  // 9. Internal review, lender submission, lender decision and confirmed disbursement
  await login(page, demo("admin"));
  await page.goto(`/admin/applications/${appId}`);
  await submitPanel(page, "Internal review outcome", async (p) => {
    await p.getByLabel("Outcome").selectOption("RECOMMENDED");
    await p.getByLabel("Review notes (internal)").fill("Meets illustrative criteria");
  }, /Record outcome/);
  await expectToast(page, "Internal review recorded");
  await submitPanel(page, "Submit to lender", async (p) => p.getByLabel("Lender name").fill("Demo Lending Partner"), /Mark submitted to lender/);
  await expectToast(page, "Marked as submitted to lender");
  await submitPanel(page, "Record lender decision", async (p) => {
    await p.getByLabel("Approved amount (₹)").fill("4200000");
    await p.getByLabel("Lender reference").fill("SANCTION-E2E-1");
    await p.getByLabel("Decision date").fill(today);
    await p.getByLabel("Evidence / confirmation").fill("Sanction letter SANCTION-E2E-1 received by email");
  }, /Record decision/);
  await expectToast(page, "Lender decision recorded");
  await submitPanel(page, "Record confirmed disbursement", async (p) => {
    await p.getByLabel("Disbursed principal (₹)").fill("4000000");
    await p.getByLabel("Lender disbursement reference").fill("DISB-E2E-1");
    await p.getByLabel("How was it confirmed?").fill("Disbursement advice email from lender");
  }, /Record disbursement/);
  await expectToast(page, /Commission created for verification/);

  // 10. Commission calculated from the confirmed disbursed amount (slab 2: 0.50% of 40,00,000)
  const [commission] = await query<{ id: string; base_amount: string; calculated_amount: string; status: string; agent_id: string }>(
    "select id, base_amount, calculated_amount, status, agent_id from commission_records where application_id = $1",
    [appId],
  );
  expect(commission).toMatchObject({ base_amount: "4000000.00", calculated_amount: "20000.00", status: "PENDING_VERIFICATION", agent_id: expectedAgentId });

  // 11. Approve and record payment
  await page.getByRole("link", { name: "Open commission" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Approve commission" }).click();
  await expectToast(page, /approved/i);
  await page.getByLabel("Payment reference").fill(`UTR-E2E-${suffix}`);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expectToast(page, /payment/i);
  expect((await query<{ status: string }>("select status from commission_records where id = $1", [commission.id]))[0].status).toBe("PAID");
  await logout(page);

  // 12. The agent sees only their own commission records
  await login(page, demo("agent"));
  await page.goto("/agent/commissions");
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
  await logout(page);
  await login(page, demo("agent2"));
  await page.goto("/agent/commissions");
  await expect(page.getByRole("link", { name: reference })).toHaveCount(0);
  const forbidden = await page.goto(`/agent/commissions/${commission.id}`);
  expect(forbidden?.status()).toBe(404);
  // Attribution survived the full workflow
  expect((await query<{ referring_agent_id: string }>("select referring_agent_id from loan_applications where id = $1", [appId]))[0].referring_agent_id).toBe(expectedAgentId);
});
