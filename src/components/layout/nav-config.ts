import type { Portal } from "@/server/auth/current";

export type NavIcon =
  | "dashboard"
  | "file"
  | "plus"
  | "bell"
  | "user"
  | "users"
  | "handshake"
  | "tasks"
  | "wallet"
  | "inbox"
  | "history"
  | "shield"
  | "key"
  | "package"
  | "chart"
  | "scroll"
  | "settings"
  | "mail"
  | "workflow"
  | "assign"
  | "documents"
  | "receipt"
  | "rules";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Visible if the actor holds ANY of these permissions (no list = always visible in the portal). */
  anyOf?: string[];
  exact?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const PORTAL_LABELS: Record<Portal, string> = {
  customer: "Customer portal",
  agent: "Agent portal",
  staff: "Employee workspace",
  admin: "Admin",
};

export const NAV: Record<Portal, NavGroup[]> = {
  customer: [
    {
      items: [
        { href: "/customer", label: "Dashboard", icon: "dashboard", exact: true },
        { href: "/customer/apply", label: "New application", icon: "plus" },
        { href: "/customer/applications", label: "My applications", icon: "file" },
        { href: "/customer/requests", label: "Requested information", icon: "mail" },
        { href: "/customer/notifications", label: "Notifications", icon: "bell" },
        { href: "/customer/profile", label: "Profile & security", icon: "user" },
      ],
    },
  ],
  agent: [
    {
      items: [
        { href: "/agent", label: "Dashboard", icon: "dashboard", exact: true },
        { href: "/agent/refer", label: "Refer a customer", icon: "plus", anyOf: ["referrals.create"] },
        { href: "/agent/customers", label: "Customers", icon: "users" },
        { href: "/agent/applications", label: "Referred applications", icon: "file", anyOf: ["applications.read_referred"] },
        { href: "/agent/tasks", label: "Follow-ups", icon: "tasks", anyOf: ["tasks.manage_own"] },
        { href: "/agent/commissions", label: "Commissions", icon: "wallet", anyOf: ["commissions.read_own"] },
        { href: "/agent/notifications", label: "Notifications", icon: "bell" },
        { href: "/agent/profile", label: "Profile & settings", icon: "user" },
      ],
    },
  ],
  staff: [
    {
      items: [
        { href: "/staff", label: "Assigned applications", icon: "inbox", exact: true, anyOf: ["applications.read_assigned"] },
        { href: "/staff/requests", label: "Information requests", icon: "mail", anyOf: ["applications.read_assigned"] },
        { href: "/staff/tasks", label: "Tasks & follow-ups", icon: "tasks", anyOf: ["tasks.manage_own"] },
        { href: "/staff/history", label: "Assignment history", icon: "history", anyOf: ["applications.read_assigned"] },
        { href: "/staff/notifications", label: "Notifications", icon: "bell" },
        { href: "/staff/profile", label: "Profile & security", icon: "user" },
      ],
    },
  ],
  admin: [
    {
      items: [
        { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true, anyOf: ["reports.read"] },
        { href: "/admin/applications", label: "Applications", icon: "file", anyOf: ["applications.read_all"] },
        { href: "/admin/assignments", label: "Assignments", icon: "assign", anyOf: ["applications.assign"] },
        { href: "/admin/documents", label: "Document review", icon: "documents", anyOf: ["applications.review_documents"] },
        { href: "/admin/workflow", label: "Workflow", icon: "workflow", anyOf: ["applications.read_all"] },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/admin/customers", label: "Customers", icon: "users", anyOf: ["customers.read_all"] },
        { href: "/admin/agents", label: "Agents", icon: "handshake", anyOf: ["agents.read_all"] },
        { href: "/admin/referrals", label: "Referral reviews", icon: "shield", anyOf: ["referrals.review"] },
        { href: "/admin/users", label: "Users", icon: "user", anyOf: ["users.read"] },
        { href: "/admin/roles", label: "Roles", icon: "key", anyOf: ["roles.manage", "permissions.manage", "roles.assign"] },
        { href: "/admin/permissions", label: "Permissions", icon: "shield", anyOf: ["roles.manage", "permissions.manage", "roles.assign"] },
      ],
    },
    {
      label: "Business",
      items: [
        { href: "/admin/products", label: "Loan products", icon: "package", anyOf: ["loan_products.manage", "loan_products.read"] },
        { href: "/admin/commissions", label: "Commissions", icon: "wallet", anyOf: ["commissions.read_all"], exact: true },
        { href: "/admin/commissions/rules", label: "Commission rules", icon: "rules", anyOf: ["commission_rules.manage", "commissions.read_all"] },
        { href: "/admin/commissions/payments", label: "Payment records", icon: "receipt", anyOf: ["commissions.read_all"] },
      ],
    },
    {
      label: "Platform",
      items: [
        { href: "/admin/reports", label: "Reports", icon: "chart", anyOf: ["reports.read"] },
        { href: "/admin/audit", label: "Audit logs", icon: "scroll", anyOf: ["audit_logs.read"] },
        { href: "/admin/notifications", label: "Notification logs", icon: "mail", anyOf: ["notifications.read_all"] },
        { href: "/admin/settings", label: "Settings", icon: "settings", anyOf: ["settings.manage"] },
        { href: "/admin/profile", label: "My profile", icon: "user" },
      ],
    },
  ],
};

export function visibleNav(portal: Portal, permissions: ReadonlySet<string>): NavGroup[] {
  return NAV[portal]
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.has(p))) }))
    .filter((g) => g.items.length > 0);
}

export function availablePortals(permissions: ReadonlySet<string>): { portal: Portal; href: string; label: string }[] {
  const out: { portal: Portal; href: string; label: string }[] = [];
  if (permissions.has("portal.admin")) out.push({ portal: "admin", href: "/admin", label: PORTAL_LABELS.admin });
  if (permissions.has("portal.staff")) out.push({ portal: "staff", href: "/staff", label: PORTAL_LABELS.staff });
  if (permissions.has("portal.agent")) out.push({ portal: "agent", href: "/agent", label: PORTAL_LABELS.agent });
  if (permissions.has("portal.customer")) out.push({ portal: "customer", href: "/customer", label: PORTAL_LABELS.customer });
  return out;
}
