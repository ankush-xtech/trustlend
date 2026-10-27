/**
 * Permission catalog and initial (system) roles.
 *
 * The catalog is the set of capabilities the code knows how to enforce; it is synced into the
 * `permissions` table by the seed/provision scripts. Which roles hold which permissions lives in
 * the database and is managed at runtime from the admin UI — no deployment needed.
 */
export interface PermissionDef {
  key: string;
  description: string;
  category: string;
  sensitive?: boolean;
}

export const PERMISSIONS = [
  // Portals (which workspaces a user can open)
  { key: "portal.customer", category: "Portals", description: "Access the customer portal" },
  { key: "portal.agent", category: "Portals", description: "Access the agent portal" },
  { key: "portal.staff", category: "Portals", description: "Access the employee workspace" },
  { key: "portal.admin", category: "Portals", description: "Access the admin dashboard" },

  // Users & access control
  { key: "users.read", category: "Users & access", description: "View users" },
  { key: "users.create", category: "Users & access", description: "Create and invite users" },
  { key: "users.update", category: "Users & access", description: "Edit user details" },
  { key: "users.deactivate", category: "Users & access", description: "Activate / deactivate user accounts", sensitive: true },
  { key: "roles.manage", category: "Users & access", description: "Create, edit and deactivate roles", sensitive: true },
  { key: "permissions.manage", category: "Users & access", description: "Grant / revoke permissions on roles", sensitive: true },
  { key: "roles.assign", category: "Users & access", description: "Assign / remove roles on users", sensitive: true },

  // Customers & agents
  { key: "customers.read_all", category: "Customers & agents", description: "View all customers" },
  { key: "customers.manage", category: "Customers & agents", description: "Edit customer records" },
  { key: "agents.read_all", category: "Customers & agents", description: "View all agents" },
  { key: "agents.manage", category: "Customers & agents", description: "Onboard, suspend and edit agents" },
  { key: "referrals.create", category: "Customers & agents", description: "Refer customers (agents)" },
  { key: "referrals.review", category: "Customers & agents", description: "Review disputed / duplicate referrals", sensitive: true },

  // Products
  { key: "loan_products.read", category: "Loan products", description: "View loan products" },
  { key: "loan_products.manage", category: "Loan products", description: "Create and edit loan products and requirements" },

  // Applications
  { key: "applications.create", category: "Applications", description: "Create and edit own / referred draft applications" },
  { key: "applications.read_own", category: "Applications", description: "View own applications (customers)" },
  { key: "applications.withdraw_own", category: "Applications", description: "Withdraw own applications" },
  { key: "applications.read_referred", category: "Applications", description: "View applications referred by me (agents)" },
  { key: "applications.read_assigned", category: "Applications", description: "View applications assigned to me" },
  { key: "applications.read_all", category: "Applications", description: "View all applications", sensitive: true },
  { key: "applications.update_assigned", category: "Applications", description: "Work on applications assigned to me" },
  { key: "applications.assign", category: "Applications", description: "Assign / reassign applications to staff" },
  { key: "applications.review_documents", category: "Applications", description: "Verify / reject documents" },
  { key: "applications.request_information", category: "Applications", description: "Request missing information" },
  { key: "applications.advance_workflow", category: "Applications", description: "Move applications through internal workflow stages" },
  { key: "applications.record_decision", category: "Applications", description: "Record internal review outcomes and lender decisions", sensitive: true },
  { key: "applications.record_disbursement", category: "Applications", description: "Record confirmed disbursements", sensitive: true },
  { key: "applications.change_attribution", category: "Applications", description: "Change referral attribution on applications", sensitive: true },
  { key: "tasks.manage_own", category: "Applications", description: "Create and complete own follow-up tasks" },

  // Commissions
  { key: "commissions.read_own", category: "Commissions", description: "View own commissions (agents)" },
  { key: "commissions.read_all", category: "Commissions", description: "View all commissions", sensitive: true },
  { key: "commission_rules.manage", category: "Commissions", description: "Create and edit commission rules", sensitive: true },
  { key: "commissions.approve", category: "Commissions", description: "Approve or cancel commissions", sensitive: true },
  { key: "commissions.adjust", category: "Commissions", description: "Record commission adjustments", sensitive: true },
  { key: "commissions.mark_paid", category: "Commissions", description: "Record commission payments", sensitive: true },

  // Platform
  { key: "reports.read", category: "Platform", description: "View reports and dashboards" },
  { key: "reports.export", category: "Platform", description: "Export report data (CSV)", sensitive: true },
  { key: "audit_logs.read", category: "Platform", description: "View audit logs", sensitive: true },
  { key: "notifications.read_all", category: "Platform", description: "View notification delivery logs" },
  { key: "settings.manage", category: "Platform", description: "Change platform settings", sensitive: true },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export const SYSTEM_ROLE_KEYS = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  LOAN_OFFICER: "loan_officer",
  AGENT: "agent",
  CUSTOMER: "customer",
} as const;

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

const ADMIN_EXCLUDED: PermissionKey[] = [
  "roles.manage",
  "permissions.manage",
  "settings.manage",
  "applications.change_attribution",
  "portal.customer",
  "portal.agent",
  "applications.read_own",
  "applications.withdraw_own",
  "applications.read_referred",
  "referrals.create",
  "commissions.read_own",
];

export const SYSTEM_ROLES: RoleDef[] = [
  {
    key: SYSTEM_ROLE_KEYS.SUPER_ADMIN,
    name: "Super Admin",
    description: "Full platform authority including role, permission and settings management.",
    permissions: ALL_PERMISSION_KEYS.filter(
      (k) =>
        ![
          "portal.customer",
          "portal.agent",
          "applications.read_own",
          "applications.withdraw_own",
          "applications.read_referred",
          "referrals.create",
          "commissions.read_own",
        ].includes(k),
    ),
  },
  {
    key: SYSTEM_ROLE_KEYS.ADMIN,
    name: "Admin",
    description: "Manages business operations: users, products, applications, assignments and commissions.",
    permissions: ALL_PERMISSION_KEYS.filter((k) => !ADMIN_EXCLUDED.includes(k)),
  },
  {
    key: SYSTEM_ROLE_KEYS.LOAN_OFFICER,
    name: "Loan Officer",
    description: "Reviews documentation on assigned applications and hands off completed files.",
    permissions: [
      "portal.staff",
      "loan_products.read",
      "applications.read_assigned",
      "applications.update_assigned",
      "applications.review_documents",
      "applications.request_information",
      "tasks.manage_own",
    ],
  },
  {
    key: SYSTEM_ROLE_KEYS.AGENT,
    name: "Agent",
    description: "Refers customers, tracks referred applications and own commissions.",
    permissions: [
      "portal.agent",
      "loan_products.read",
      "referrals.create",
      "applications.create",
      "applications.read_referred",
      "commissions.read_own",
      "tasks.manage_own",
    ],
  },
  {
    key: SYSTEM_ROLE_KEYS.CUSTOMER,
    name: "Customer",
    description: "Applies for loans and manages own applications and documents.",
    permissions: ["portal.customer", "loan_products.read", "applications.create", "applications.read_own", "applications.withdraw_own"],
  },
];
