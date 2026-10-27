# TrustLend architecture

## 1. Overview

A **modular monolith** on Next.js 16. Every request follows the same layering:

```
UI (Server Components; Client Components only for interactivity)
  → Server Actions / Route Handlers      src/server/actions, src/app/api   (authenticate, parse, call service)
    → Services                           src/server/services               (business rules, authorization, transactions, audit)
      → Authorization policies           src/server/rbac                   (permissions + record-level access)
      → Domain logic (pure)              src/lib/domain                    (workflow state machine, commission calculator)
      → Drizzle / PostgreSQL             src/server/db
      → Providers                        src/server/{storage,email,scanner}
```

Key decisions:

| Decision | Rationale |
| --- | --- |
| Services enforce authorization themselves | UI hiding is not security; pages, actions and route handlers can all be bypassed or reused. Every service takes the `Actor` as its first argument. |
| Database-backed sessions (hashed opaque tokens, Lucia/"Copenhagen Book" pattern) instead of Auth.js | Auth.js credentials login forces JWT sessions, which cannot be revoked instantly. The spec requires disabled users to lose access immediately; here every request re-validates the session **and** user status, and reloads permissions. |
| `cacheComponents` disabled; all portal pages dynamic | Every page is per-user and sensitive; avoids prerendering or keeping hidden routes mounted with personal data. |
| Pure domain modules shared by client and server | The same Zod schemas validate the wizard in the browser and on the server; the same state machine renders available actions and authorizes them. |
| Postgres triggers for append-only tables | Audit/financial history cannot be rewritten even by a buggy code path. |
| Outbox for notifications | Business transactions never wait on an email provider. |

## 2. Entity-relationship model

```
users ─┬─< user_roles >── roles ──< role_permissions >── permissions
       ├─< sessions, auth_tokens (reset / verification / invitation, hashed, single-use)
       ├── agents (1:1, agent_code, status)
       └── customers (0..1 link; customer may exist before having a login)

agents ──< referrals >── customers          (≤1 ACTIVE referral per customer; PENDING_REVIEW for disputes)

loan_products ──< loan_product_documents     (configurable requirements per applicant type)
      │
loan_applications  (reference TL-XX-8chars, status, version, acquisition_source, referring_agent_id, referral_id)
  ├── application_applicants (1:1)  ├──< application_addresses (CURRENT/PERMANENT)
  ├──< application_references (n)   ├── application_employment | application_business (1:1, by applicant type)
  ├──< application_documents ──< document_reviews (append-only)
  ├──< application_status_history (append-only)
  ├──< application_assignments (≤1 ACTIVE)   ├──< information_requests   ├──< application_notes (INTERNAL | CUSTOMER_VISIBLE)
  ├──< application_tasks                     ├──< lender_decisions (append-only)
  ├── disbursements (≤1, append-only)
  └── commission_records (≤1 per application) ──< commission_adjustments (append-only)
                                              └── commission_payments (≤1, unique payment_reference, append-only)
commission_rules (product / agent scoped, PERCENTAGE | FIXED | SLAB, effective dates)
notifications (outbox + in-app inbox) · audit_logs (append-only) · system_settings · rate_limits
```

Integrity rules enforced in the database:

- UUID primary keys everywhere; human-facing references are random Crockford base32 (no sequential IDs).
- `numeric(14,2)` for all money; `decimal.js` arithmetic in code — never floats.
- Check constraints: attribution consistency (`DIRECT` ⇔ no agent), positive amounts, lender decision ⇔ approved amount, commission rule calc fields.
- Unique/partial indexes: one ACTIVE referral per customer; one ACTIVE assignment per application; one commission per application; one disbursement per application; one payment per commission; unique payment references; case-insensitive unique emails.
- Triggers (`drizzle/migrations/0001_append_only_guards.sql`): `UPDATE/DELETE` blocked on audit logs, status history, document reviews, lender decisions, disbursements, commission adjustments and payments; `DELETE` blocked on applications, documents and commission records; commission rows can only be inserted for agent-referred applications attributed to the same agent.
- Timestamps are `timestamptz` (UTC); the UI formats them in `Asia/Kolkata`.

## 3. Authentication

`src/server/auth`, `src/server/services/auth.ts`

- Passwords: bcrypt (cost 12), 10–64 characters with a letter and a number.
- Session cookie: 256-bit random token, `HttpOnly`, `SameSite=Lax`, `Secure` and `__Host-` prefix on HTTPS. Only `sha256(token)` is stored. Absolute TTL 7 days, idle timeout 24 hours (configurable).
- Public registration creates **only Customer** accounts; email verification is required before sign-in (`REQUIRE_EMAIL_VERIFICATION`). Responses are identical for new and existing emails (no account enumeration).
- Login: generic errors, constant-time dummy hash for unknown users, rate limits per IP (40 / 15 min) and per email (10 / 15 min), account lock after 5 consecutive failures (15 min).
- Password reset: single-use, 30-minute hashed token; all sessions revoked on reset. Change password revokes other sessions.
- Agents and staff are onboarded by invitation (72 h single-use link); admins never set passwords.
- Deactivation deletes sessions; any remaining cookie is rejected because status is re-checked on every request.

## 4. Dynamic RBAC

`src/server/rbac`

- The permission **catalog** (`catalog.ts`) lists capabilities the code enforces (≈45 keys such as `applications.review_documents`, `commissions.mark_paid`, plus `portal.*` for workspace access). It is synced to the `permissions` table by the seed/provision scripts.
- **Roles and role→permission mappings live in the database** and are managed in `/admin/roles`. Changes apply on the next request (the actor is reloaded per request). Initial roles: Super Admin, Admin, Loan Officer, Agent, Customer. Highly sensitive keys (`roles.manage`, `permissions.manage`, `settings.manage`, `applications.change_attribution`) are not granted to Admin by default.
- **Anti-escalation:** an actor may only grant or revoke permissions they hold, and may only assign roles whose permissions they hold. Only Super Admins manage the Super Admin role or Super Admin users; the Super Admin role's permissions are immutable; the last active Super Admin cannot be removed or deactivated; nobody can change their own status.
- **Record-level access** (`application-access.ts`), used by every application/document service:

  | View level | Requires |
  | --- | --- |
  | admin | `applications.read_all` |
  | staff | `applications.read_assigned` **and** an ACTIVE assignment to the actor |
  | customer | `applications.read_own` **and** the application's customer is linked to the actor |
  | agent | `applications.read_referred` **and** the application is attributed to the actor's agent profile |

  Unauthorized access returns *not found* (no existence leak). Data is shaped per level: customers and agents never receive internal notes, internal review comments, assignment data or audit data; agents do not receive references' details and can download only files they uploaded.

## 5. Loan products and the wizard

Products store limits and a JSON `config` (applicant types, tenure options, age / experience / vintage rules, references required, permanent-address rule, product-specific extra fields, informational eligibility notes). Document requirements are rows per category, optionally scoped by applicant type. New products need no schema change.

Wizard (`src/components/wizard`, `src/lib/validation/application.ts`): personal → address & references → employment/business (conditional) → loan requirement (+ product fields) → documents → review & submit. Each step is validated in the browser and again on the server, persisted with optimistic concurrency (`version`), and the draft can be resumed at any time. Submission re-validates **all** persisted data against the current product config, is idempotent (a repeated submit returns the existing submission), and records declaration version and consent.

Data minimisation: only the last 4 characters of identity numbers are stored; references are stored as references (not guarantors).

## 6. Workflow (application lifecycle)

`src/lib/domain/workflow.ts` (state machine) + `src/server/services/workflow.ts` (preconditions, persistence).

```
DRAFT ─submit→ SUBMITTED ─(assignment)→ DOCUMENT_REVIEW ⇄ INFORMATION_REQUIRED
DOCUMENT_REVIEW ─complete_documentation (all required docs VERIFIED, none pending, no open requests)→ READY_FOR_ADMIN_REVIEW
READY_FOR_ADMIN_REVIEW ─internal_recommend→ UNDER_PROCESSING ─submit_to_lender→ SUBMITTED_TO_LENDER ─lender_acknowledged→ LENDER_DECISION_PENDING
READY_FOR_ADMIN_REVIEW ─internal_decline→ REJECTED          READY_FOR_ADMIN_REVIEW ─return_to_review→ DOCUMENT_REVIEW
SUBMITTED_TO_LENDER | LENDER_DECISION_PENDING ─record_lender_approval→ APPROVED | ─record_lender_rejection→ REJECTED
APPROVED ─record_disbursement (≤ approved amount, after decision date)→ DISBURSED
pipeline statuses ─put_on_hold→ ON_HOLD ─resume→ previous status
early statuses ─withdraw (customer)→ WITHDRAWN          APPROVED | REJECTED | DISBURSED | WITHDRAWN ─close→ CLOSED
```

| Status | Meaning |
| --- | --- |
| DRAFT | Being completed by the applicant (customer or creating agent) |
| SUBMITTED | Submitted, awaiting assignment |
| DOCUMENT_REVIEW | Assigned staff reviewing documents |
| INFORMATION_REQUIRED | Waiting for the applicant to respond / upload |
| READY_FOR_ADMIN_REVIEW | Documentation verified and handed off; awaiting internal review |
| UNDER_PROCESSING | Internally recommended; being prepared for a lender |
| SUBMITTED_TO_LENDER / LENDER_DECISION_PENDING | With the bank/NBFC |
| APPROVED | Lender approval recorded from external evidence (not an internal decision) |
| REJECTED | Internal decline or lender rejection |
| DISBURSED | Lender-confirmed disbursement recorded |
| ON_HOLD | Paused; resumes to the previous status |
| WITHDRAWN / CLOSED | Terminal |

Every transition: permission + scope check ("owner", "staff" = active assignee or `read_all`, or "system"), required reason where applicable, row lock (`SELECT … FOR UPDATE`), optional optimistic version check, status history row, audit log, and customer/agent notifications for customer-visible changes. Documentation completion is never an approval; internal approval never implies disbursement. Hand-off completes the officer's assignment (they lose access).

## 7. Referral attribution

- Agents create referrals; a new person gets a customer record + ACTIVE referral. An existing customer (email or mobile match) is **never** re-attributed automatically — a PENDING_REVIEW referral is created and the agent sees a neutral message.
- Attribution is decided server-side when a draft is created: an agent may only create applications for customers with their ACTIVE referral; a customer's self-started application is attributed to the agent holding their ACTIVE referral if the agent is active and the referral is younger than the configurable window (`referral.attributionWindowDays`, default 90); otherwise DIRECT.
- Assignment and workflow never modify attribution. Changing it requires `applications.change_attribution`, a reason, is audited, and is blocked once a commission exists.

## 8. Commissions

- **Base:** the confirmed disbursed principal (never requested or approved amounts).
- **Creation:** inside the disbursement transaction, only for `AGENT_REFERRAL` applications (also enforced by trigger). Idempotent through the unique `application_id` index — retries or duplicate events return the existing record.
- **Rule selection:** active and effective on the disbursement date; product/agent match; base within bounds; most specific wins (agent > product > generic), then priority, then latest effective date. No match → `NOT_ELIGIBLE` record with explanation.
- **Calculation:** percentage, fixed, or slab (min inclusive, max exclusive, last slab open; the containing slab's rate applies to the whole base); half-up rounding to 2 dp; optional cap. Rule snapshot and calculation details are stored.
- **Lifecycle:** `PENDING_VERIFICATION → APPROVED → PAID`, with `ADJUSTMENT_REQUIRED`, `CANCELLED`, `NOT_ELIGIBLE`. Adjustments are signed, append-only and send the commission back for re-approval. Payment requires approval, an external payment reference (unique), and the exact payable amount. Agents can never act on their own commission. Rules used by any commission are immutable in their terms.

## 9. Documents

Upload route → service: applicant-side authority + upload-permitting status → product category check → size limit → **magic-byte type detection** (PDF/PNG/JPEG; browser MIME ignored) → malware scan (infected files are never stored; audited) → opaque key `applications/<appId>/<uuid>` in private storage → metadata + audit in a transaction (orphan bytes cleaned on failure). Downloads go through `/api/documents/:id/download`, which re-authorizes, audits, and either redirects to a 60-second presigned S3 URL or streams with `no-store`, `nosniff`, sandbox CSP. Draft removals delete bytes; submitted documents are retained (replacement marks the old one REPLACED).

## 10. Notifications

`notifications` is both outbox (EMAIL) and in-app inbox (IN_APP). Services insert rows inside their transaction with a `dedupe_key`. Delivery happens after the response (`after()`) and via cron (`/api/jobs/dispatch-notifications`), claiming rows with `FOR UPDATE SKIP LOCKED`, exponential backoff, max 5 attempts, provider idempotency key = notification id. Bodies of secret-bearing emails (reset/verification/invitation links) are cleared after delivery.

## 11. Audit logging

`recordAudit(tx, …)` writes in the same transaction as the change: actor, action, entity, sanitized before/after (keys like password/token/hash/storageKey stripped), reason, request ID, IP. Covered: auth events, user/role/permission changes, referrals, attribution changes, assignments, every status transition, document upload/replace/remove/verify/reject/download/malware block, commissions (calculated/approved/adjusted/cancelled/paid), settings, report exports. Readable only with `audit_logs.read`.

## 12. Assumptions (safe, reversible)

- Market: India (INR, PIN codes, Indian mobile numbers, states). Currency is per product.
- One disbursement per application (no tranches) and one payment per commission; both are modelled so they can be extended.
- A customer may have up to `applications.maxOpenPerCustomer` (default 3) open applications.
- Assignment is manual; `assignApplication` is the single entry point a rule/workload assigner can call.
