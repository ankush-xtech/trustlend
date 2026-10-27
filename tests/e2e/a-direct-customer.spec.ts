import { expect, test } from "@playwright/test";
import { demo, fillAddressStep, login, logout, query, saveAndContinue, uploadRequiredDocuments, waitForEmailLink } from "./support";

test("Scenario A: direct customer registers, applies for a business loan and never generates commission", async ({ page }) => {
  const email = `asha.e2e.${Date.now()}@example.test`;
  const password = "E2e-Password-2026";

  // 1. Register
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Asha Verma");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Unverified accounts cannot sign in yet.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText(/verify your email/i).first()).toBeVisible();

  // Verify email via the (development) mailbox link, which requires an explicit POST.
  const verifyPath = await waitForEmailLink(email, "/verify-email?token=");
  await page.goto(verifyPath);
  await page.getByRole("button", { name: "Confirm my email address" }).click();
  await expect(page.getByRole("link", { name: "Continue to sign in" })).toBeVisible();

  // 2. Log in
  await login(page, email, password);
  await expect(page).toHaveURL(/\/customer$/);

  // 3. Select a business loan
  await page.goto("/customer/apply");
  await page.getByRole("button", { name: "Apply for Business Loan" }).click();
  await expect(page).toHaveURL(/\/customer\/applications\/[0-9a-f-]+\/edit$/);
  const appId = page.url().split("/").at(-2)!;

  // 4. Five steps
  await expect(page.getByLabel("Full legal name")).toHaveValue("Asha Verma"); // reused from profile
  await page.getByLabel("Date of birth").fill("1988-04-12");
  await page.getByLabel("Identity document").selectOption("PAN card");
  await page.getByLabel("Last 4 characters of the ID number").fill("4321");
  await saveAndContinue(page, /Address & references/);

  await fillAddressStep(page);
  await saveAndContinue(page, /Employment \/ business/);

  await page.getByLabel("Business owner").check();
  await page.getByLabel("Business name").fill("Verma Traders");
  await page.getByLabel("Business type").selectOption("Sole proprietorship");
  await page.getByLabel("Years in operation").fill("6");
  await page.getByLabel("Business address").fill("45 Market Road, Pune");
  await page.getByLabel("Annual turnover (₹)").fill("8000000");
  await saveAndContinue(page, /Loan requirement/);

  // Client + server validation: amount above the product maximum is rejected.
  await page.getByLabel("Requested loan amount (₹)").fill("999999999");
  await page.getByLabel("Preferred repayment tenure").selectOption("36");
  await page.getByLabel("Purpose of the loan").fill("Working capital for inventory expansion");
  await page.getByLabel("GST registered").selectOption("Yes");
  await page.getByLabel("Collateral offered").selectOption("None");
  await page.getByRole("button", { name: /save & continue/i }).click();
  await expect(page.getByText(/Enter an amount between/)).toBeVisible();
  await page.getByLabel("Requested loan amount (₹)").fill("1500000");
  await saveAndContinue(page, /Document upload/);

  // 5. Upload required documents
  await uploadRequiredDocuments(page, ["IDENTITY_PROOF", "ADDRESS_PROOF", "BANK_STATEMENT", "BUSINESS_REGISTRATION", "FINANCIAL_STATEMENT"]);
  await page.getByRole("button", { name: /continue to review/i }).click();
  await expect(page.locator("#wizard-step-heading")).toHaveText(/Review & submit/);

  // 6. Submit
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/applications/${appId}\\?submitted=1`));
  await expect(page.getByText("Your application has been submitted.")).toBeVisible();
  const reference = (await query<{ reference: string }>("select reference from loan_applications where id = $1", [appId]))[0].reference;

  // 7. Visible in the customer portal
  await page.goto("/customer/applications");
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
  await logout(page);

  // 8. Visible to an authorized admin; 9. no referring agent
  await login(page, demo("admin"));
  await page.goto(`/admin/applications?q=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await expect(page.getByText("Direct customer")).toBeVisible();
  await expect(page.getByText("Referring agent", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText("None");

  const [row] = await query<{ acquisition_source: string; referring_agent_id: string | null; status: string }>(
    "select acquisition_source, referring_agent_id, status from loan_applications where id = $1",
    [appId],
  );
  expect(row).toMatchObject({ acquisition_source: "DIRECT", referring_agent_id: null, status: "SUBMITTED" });

  // 10. No agent commission can exist for this application.
  const commissions = await query("select id from commission_records where application_id = $1", [appId]);
  expect(commissions).toHaveLength(0);
});
