# TrustLend

Loan origination and application-processing platform: customers apply for loans through a five-step wizard, agents refer customers and track commissions, and staff process applications through a controlled, audited workflow.

**Stack:** Next.js 16 (App Router, Server Components, Server Actions) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui (Base UI) · React Hook Form + Zod · PostgreSQL (Neon in production) · Drizzle ORM · Vitest + Testing Library · Playwright.

| Doc | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, entity-relationship model, RBAC, workflow, commissions, integrations |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production setup on Vercel + Neon + S3, environment variables, operations |
| [docs/SECURITY.md](docs/SECURITY.md) | Security controls checklist, compliance notes, production-readiness gaps |
| [docs/TEST-REPORT.md](docs/TEST-REPORT.md) | Test strategy and latest actual results |

## Quick start (local development)

Requirements: Node.js ≥ 20.9 (24 LTS recommended). No Docker needed — a real PostgreSQL 18 runs via `embedded-postgres`.

```bash
npm install
cp .env.example .env          # defaults work locally
npm run db:local              # terminal 1: PostgreSQL on :54320 (data in ./.pgdata)
npm run db:migrate            # terminal 2
npm run db:seed               # illustrative demo data (refuses to run when APP_ENV=production)
npm run dev                   # http://localhost:3000
```

Already have PostgreSQL (or a Neon dev branch)? Skip `db:local` and point `DATABASE_URL` at it. Create the database with `ENCODING 'UTF8'`.

### Demo accounts (development only)

Password for all: `TrustLend-Demo-2026` (override with `SEED_DEMO_PASSWORD`). They use the reserved `@demo.trustlend.test` domain; **logins for this domain are refused when `APP_ENV=production`** and the seed script refuses to run there.

| Email | Role | Lands in |
| --- | --- | --- |
| `superadmin@demo.trustlend.test` | Super Admin | `/admin` |
| `admin@demo.trustlend.test` | Admin | `/admin` |
| `officer@demo.trustlend.test`, `officer2@…` | Loan Officer | `/staff` |
| `agent@demo.trustlend.test`, `agent2@…` | Agent | `/agent` |
| `customer@demo.trustlend.test` | Customer | `/customer` |

The seed creates sample applications through the real services (a draft, a direct application awaiting information, a submitted referral, and a fully disbursed referral with a pending commission).

### Email, files and scanning in development

- **Email:** `EMAIL_PROVIDER=dev` writes messages to `.dev-mailbox/` and shows them at **`/dev/mailbox`** (verification, reset and invitation links). Nothing is delivered. The provider refuses to run in production.
- **Documents:** `STORAGE_DRIVER=local` stores files in `.private-storage/` (outside `public/`), served only through the authorized download endpoint.
- **Malware scanning:** `MALWARE_SCANNER=signature` detects the EICAR test file only — a development stand-in, not protection. See [docs/SECURITY.md](docs/SECURITY.md).

### First administrator (any environment)

There is no default admin account. Provision one securely:

```bash
npm run admin:provision -- --email owner@yourcompany.com --name "Jane Owner"
```

It prints a single-use invitation link (72 h) to your terminal; open it to set the password.

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` / `build` / `start` | Next.js development / production build / production server |
| `lint`, `typecheck` | ESLint, route type generation + `tsc --noEmit` |
| `test` | Unit + UI + integration tests (Vitest). Integration starts its own PostgreSQL on :54330 |
| `test:unit`, `test:integration` | Individual Vitest projects |
| `test:e2e` | Playwright: builds the app, resets `trustlend_e2e`, runs scenarios A–D on :3100 |
| `test:all` | Everything above |
| `db:local` | Local PostgreSQL (embedded) |
| `db:generate` | Generate a migration from schema changes (drizzle-kit) |
| `db:migrate` | Apply migrations (uses `DATABASE_URL_DIRECT` if set) |
| `db:seed` | Illustrative demo data (non-production only) |
| `admin:provision` | Secure first Super Admin provisioning |

## Project structure

```
src/
  app/                 routes: (public) site, (auth) pages, customer/, agent/, staff/, admin/, api/, dev/mailbox
  components/          ui/ (shadcn), shared/, layout/, wizard/, applications/, admin/, agent/, public/, auth/
  lib/                 isomorphic domain logic: workflow state machine, commission calculator, validation, labels, formatting
  server/
    db/                Drizzle schema, client (pg | neon), qualified-column helper
    auth/              sessions, crypto, current-actor resolution
    rbac/              permission catalog, actor loading, authorization + record-level policies
    services/          business logic (applications, documents, workflow, commissions, users, roles, reports, …)
    actions/           Server Actions (thin: authenticate → service)
    storage/ email/ scanner/   provider interfaces + implementations
drizzle/migrations/    SQL migrations (incl. append-only triggers)
scripts/               local DB, migrate, seed, provision admin, shared demo catalog
tests/                 unit/, integration/, e2e/, support/
```

## Integration status

| Integration | Status |
| --- | --- |
| PostgreSQL / Neon | Implemented (`pg` TCP driver or `@neondatabase/serverless`). Verified locally against PostgreSQL 18; **not yet run against a live Neon project**. |
| Email (Resend) | Implemented behind an interface with outbox + retries + idempotency keys. **Not tested against a live Resend account** — requires `RESEND_API_KEY` and a verified sending domain. |
| Private storage (S3 / S3-compatible) | Implemented with presigned 60 s URLs and SSE. **Not tested against a live bucket.** Local driver tested. |
| Malware scanning (ClamAV) | clamd INSTREAM client implemented; **not tested against a live clamd**. Dev signature scanner tested. |
| SMS / WhatsApp | Not implemented (optional in spec); notification service is channel-extensible. |
| Bank / NBFC integration | Not implemented. Lender decisions and disbursements are recorded manually from external confirmation, with evidence notes and audit. |
| Identity verification (KYC) | Not implemented. Document verification is an explicit human review; no authenticity claims are made. |
| Error monitoring | Structured JSON logs with redaction (collectable by Vercel log drains). No Sentry/APM SDK configured. |
# trustlend
