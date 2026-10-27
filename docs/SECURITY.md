# Security checklist, compliance notes and production gaps

## Implemented controls

| Area | Control | Where |
| --- | --- | --- |
| Authorization | Every service checks authentication, permission and record-level access; unauthorized records return 404 | `src/server/services/*`, `src/server/rbac/*` |
| Authorization | Pages gate by portal/permission (defence in depth; not the boundary) | `src/server/auth/current.ts` |
| RBAC | Database-driven roles/permissions, effective next request; anti-escalation; super-admin protections | `services/roles.ts`, `services/users.ts`, `rbac/authorize.ts` |
| IDOR | IDs from the browser never authorize; facts loaded from DB; UUID validation | `services/application-access.ts` |
| Sessions | Hashed opaque tokens, HttpOnly/SameSite=Lax/Secure/`__Host-`, absolute + idle expiry, status re-check every request, revocation on reset/deactivation | `auth/session.ts` |
| Passwords | bcrypt cost 12; length/complexity policy; no admin-set passwords (invitations) | `auth/crypto.ts`, `services/auth.ts` |
| Enumeration | Identical responses for registration, reset and resend; generic login errors; dummy-hash timing | `services/auth.ts` |
| Brute force | Postgres-backed rate limits (login per IP/email, register, reset, verification, upload, download, contact, export) + 5-failure account lock | `server/rate-limit.ts` |
| CSRF | Server Actions: Next.js Origin/Host check. Route handlers: explicit Origin / Sec-Fetch-Site check. SameSite=Lax cookies | `server/http.ts` |
| Injection | Drizzle parameterized queries; raw SQL only with bound parameters; LIKE input escaped; fully-qualified columns in correlated subqueries | services, `db/sql.ts` |
| XSS | React escaping; no `dangerouslySetInnerHTML`; CSP; files served with `nosniff` + sandbox CSP + attachment disposition | `next.config.ts`, download route |
| Redirects | `next` parameter restricted to same-origin relative paths | `lib/safe-redirect.ts` |
| Headers | CSP, HSTS (prod), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP; `no-store` on portals/API | `next.config.ts` |
| Uploads | Size limit, magic-byte detection (PDF/PNG/JPEG), malware scan hook, opaque keys, private storage, presigned 60 s URLs, audited downloads | `services/documents.ts`, `storage/`, `scanner/` |
| Financial integrity | numeric(14,2) + decimal.js; unique/idempotent commission creation; payment requires approval + exact amount + unique reference; agents cannot act on own commission | `services/commissions.ts`, schema |
| Tamper resistance | Append-only triggers on audit, history, reviews, lender decisions, disbursements, adjustments, payments; delete-protection on applications/documents/commissions | migration `0001` |
| Logging | Structured JSON with key-based redaction (passwords, tokens, identity, bodies); audit snapshots strip sensitive keys | `server/logger.ts`, `services/audit.ts` |
| Data minimisation | Only last 4 chars of identity numbers; masked payout references; secret email bodies purged after delivery | schema, notifications |
| Secrets | Environment variables only; production config validation refuses dev providers | `config/env.ts` |
| Demo safety | Demo accounts use a reserved `.test` domain; refused at login in production; seed refuses in production; no default admin | `lib/domain/demo.ts`, scripts |

## Compliance (not claimed)

TrustLend has security features, but **no compliance with any legal or regulatory framework is claimed**. Before launch, at minimum:

- **India DPDP Act 2023:** appoint responsibilities, finalize the privacy notice and consent text (the shipped Privacy Policy and Terms are templates marked "requires legal review"), implement data-principal rights workflows (access, correction, erasure where legally permissible), breach notification process, and a retention schedule.
- **RBI guidelines** relevant to your model (e.g. Digital Lending Directions if you act as a Lending Service Provider): disclosures, grievance redressal officer, lender agreements, KFS requirements — the platform records lender decisions but does not produce lender disclosures.
- **KYC/AML:** the platform performs no identity verification; lenders/regulated entities must. If KYC providers are added, isolate them behind a provider interface with consent capture.
- **Security assurance:** independent penetration test, threat model review, dependency audit (`npm audit`), and an information-security policy (access reviews, key rotation).

## Production-readiness gaps (remaining work)

1. **Live integrations untested:** Neon, Resend, S3 and ClamAV were implemented against their APIs but not exercised with real credentials.
2. **Malware scanning:** no production scanner is deployed. Options: ClamAV container (e.g. on Fly/Render/ECS) using the built-in clamd client, or S3 + a scanning service with async quarantine. Until then use `MALWARE_SCANNER=none` (files flagged *Not scanned*) and keep reviewers aware.
3. **Upload size on Vercel:** Function request bodies are limited (~4.5 MB). Either set `MAX_UPLOAD_MB=4` or implement direct-to-S3 presigned POST uploads with a post-upload validation/scan step.
4. **Row-level security:** authorization is enforced in the application layer and reinforced with constraints/triggers. PostgreSQL RLS (per-request `set_config` of the actor) is a possible further hardening step.
5. **CSP nonces:** CSP currently allows `'unsafe-inline'` scripts (required by Next.js without nonces). Adopt nonce-based CSP via `proxy.ts` for stricter XSS protection.
6. **MFA** for staff/admin accounts is not implemented (recommended before launch).
7. **Error monitoring/APM** SDK (e.g. Sentry) not configured; only structured logs.
8. **SMS/WhatsApp** notifications and **bank/NBFC integrations** are not implemented.
9. **Data retention automation:** retention periods must be defined by legal; deletion of retained financial/audit records requires a reviewed DBA procedure (triggers intentionally block it).
10. **Rate limiting** is Postgres-based (fine for moderate traffic); consider a dedicated store (e.g. Upstash Redis) or Vercel firewall rules at scale, plus bot protection on public forms.
11. **Accessibility audit** with assistive technologies has not been performed (components use semantic HTML, labels and focus states).
