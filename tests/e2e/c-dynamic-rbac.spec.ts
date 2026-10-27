import { expect, test } from "@playwright/test";
import { demo, expectToast, login, logout, query, waitForEmailLink } from "./support";

test("Scenario C: custom role with granular permissions, revocation and no self-elevation", async ({ page }) => {
  const suffix = Date.now();
  const roleKey = `custom_reviewer_${suffix}`;
  const staffEmail = `reviewer.${suffix}@example.test`;

  // 1-2. Super admin creates a custom Loan Officer–style role with selected permissions
  await login(page, demo("superadmin"));
  await page.goto("/admin/roles/new");
  await page.getByLabel("Key").fill(roleKey);
  await page.getByLabel("Name").fill("Custom Reviewer");
  await page.locator('input[type="checkbox"][value="portal.staff"]').check();
  await page.locator('input[type="checkbox"][value="applications.read_assigned"]').check();
  await page.getByRole("button", { name: "Create role" }).click();
  await page.waitForURL(/\/admin\/roles\/[0-9a-f-]+(\?.*)?$/);
  const roleUrl = page.url().split("?")[0];
  const [role] = await query<{ id: string }>("select id from roles where key = $1", [roleKey]);

  // 3. Invite a user with the role
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill("Rita Reviewer");
  await page.getByLabel("Email").fill(staffEmail);
  await page.locator(`input[name="roleIds"][value="${role.id}"]`).check();
  await page.getByRole("button", { name: "Send invitation" }).click();
  await page.waitForURL(/\/admin\/users\/[0-9a-f-]+/);
  await logout(page);

  const invitePath = await waitForEmailLink(staffEmail, "/accept-invitation?token=");
  await page.goto(invitePath);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill("Reviewer-Pass-2026");
  await page.getByRole("textbox", { name: "Confirm new password" }).fill("Reviewer-Pass-2026");
  await page.getByRole("button", { name: "Set password and continue" }).click();

  // 4. Permitted: the employee workspace
  await page.waitForURL(/\/staff/);
  await expect(page.getByRole("heading", { name: "Assigned applications" })).toBeVisible();

  // 5. Forbidden pages and server operations
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/access-denied/);
  const exportRes = await page.request.get("/api/reports/status/export");
  expect(exportRes.status()).toBe(403);

  // 6-7. Remove a permission → no longer effective on the next request
  const ctx = page.context();
  await ctx.clearCookies();
  await login(page, demo("superadmin"));
  await page.goto(roleUrl);
  await page.locator('input[type="checkbox"][value="applications.read_assigned"]').uncheck();
  await page.getByRole("button", { name: "Save permissions" }).click();
  await expectToast(page, /Permissions saved/);
  await logout(page);
  await login(page, staffEmail, "Reviewer-Pass-2026");
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/access-denied/);
  const audit = await query<{ action: string }>("select action from audit_logs where entity_id = $1", [role.id]);
  expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["role.created", "role.permissions_changed"]));
  await page.context().clearCookies();

  // 8. A customer cannot elevate their own privileges
  await login(page, demo("customer"));
  await page.goto("/admin/roles");
  await expect(page).toHaveURL(/\/access-denied/);
  expect((await page.request.get("/api/reports/status/export")).status()).toBe(403);
  const roles = await query<{ key: string }>(
    "select r.key from user_roles ur join roles r on r.id = ur.role_id join users u on u.id = ur.user_id where u.email = $1",
    [demo("customer")],
  );
  expect(roles.map((r) => r.key)).toEqual(["customer"]);
});
