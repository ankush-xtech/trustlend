# Test report

Run date: 2026-10-26 · Windows 11 · Node.js 24.13 · PostgreSQL 18.4 (embedded) · Chromium (Playwright 1.64)

All results below were produced by actually executing the commands and inspecting their output.

| Check | Command | Result |
| --- | --- | --- |
| Type checking | `npm run typecheck` | ✅ no errors |
| Lint | `npm run lint` | ✅ no errors or warnings |
| Unit + UI tests | `npm run test:unit` | ✅ 6 files, 61 tests passed |
| Integration tests (real PostgreSQL) | `npm run test:integration` | ✅ 5 files, 41 tests passed |
| End-to-end (production build) | `npm run test:e2e` | ✅ 4 scenarios passed (`next build` succeeded as part of the run) |
| Portal smoke crawl | ad-hoc Playwright crawl of every portal page as each demo role | ✅ all pages 200, no runtime/console errors (after fixing the defect noted below) |

## Coverage by requirement

**Unit (`tests/unit`)**
- `commission-calc.test.ts` — percentage/fixed/slab maths, half-up rounding, caps, slab boundaries (min inclusive / max exclusive), rule selection (specificity, priority, effective dates, base bounds), slab validation, exact decimal sums.
- `workflow.test.ts` — allowed transitions, docs-complete ≠ approval, approval ≠ disbursement, hold/resume, system-only transitions, per-role action authorization.
- `validation.test.ts` — conditional step schemas (age limits, permanent address, references, salaried vs business fields, product rules), amount limits, tenure options, product-specific fields, shared validators.
- `rbac.test.ts` — permission checks, anti-escalation, super-admin protection, record ownership (customer / agent / assigned officer / custom role), initial role separation.
- `security-utils.test.ts` — file signature detection, filename sanitising, safe redirects, CSV formula-injection protection, money formatting.
- `step-personal.test.tsx` (React Testing Library) — wizard step validation, normalised submission, server field errors mapped to the form.

**Integration (`tests/integration`, real PostgreSQL with migrations and triggers)**
- `auth.test.ts` — customer-only registration, no enumeration, verification token single use, generic errors, lockout, hashed sessions, immediate revocation on deactivation, reset token single use / expiry / session revocation.
- `rbac.test.ts` — custom role created, permission granted then revoked takes effect immediately, role deactivation, escalation attempts blocked, customer self-elevation blocked, last super admin protected, audit entries.
- `applications.test.ts` — draft persistence and resume, server-side validation, ordered steps, optimistic concurrency conflicts, cross-customer isolation, inactive products, open-application limit, idempotent submission, DIRECT attribution, agent attribution preserved through assignment, agent cannot use another agent's customer, duplicate referral → review, self-started referred application attribution, officer access only while assigned, data shaping for agents.
- `documents.test.ts` — valid upload, disguised/oversized/wrong-category rejection, malware block (never stored, audited), applicant-only uploads, draft removal deletes bytes, download authorization matrix, audited reviews, replacement rules, "require clean scan" setting.
- `workflow-commissions.test.ts` — information-request loop, hand-off preconditions, officer cannot approve, invalid transitions, withdraw, hold/resume, direct application never yields commission (service + DB trigger), commission base = disbursed amount, idempotent creation, duplicate disbursement blocked, attribution change blocked after commission, agent cannot approve own commission, adjustment + re-approval, exact payment amount, duplicate payment blocked, agent-scoped commission visibility, NOT_ELIGIBLE path, append-only tables.

**End-to-end (`tests/e2e`, browser against `next build` + `next start`)**
- **A — Direct customer:** register → unverified login blocked → verify via mailbox link (explicit POST) → login → business loan → 5 steps (incl. amount validation error) → upload 5 documents → submit → visible in customer portal → visible to admin with "Direct customer" / no referring agent → no commission row.
- **B — Agent referral:** agent refers customer → starts home loan → 5 steps + uploads → submit → attribution recorded → admin assigns officer → second officer gets 404 → officer verifies all documents and hands off (redirected, access ends) → admin records internal review, lender submission, lender approval, disbursement → commission 20,000.00 on a 40,00,000 disbursement (slab 0.50%) → approve → record payment → agent sees own commission; other agent sees none and gets 404 on direct URL.
- **C — Dynamic RBAC:** super admin creates custom role → invites user → user accepts invitation → workspace accessible, admin pages denied, report export API 403 → permission removed → access denied on next request → audit entries → customer cannot reach role admin or export API and still has only the customer role.
- **D — Document security:** valid upload 201; disguised, oversized (11 MB) and EICAR uploads 422; cross-origin upload 403; owner download 200 with attachment + no-store; anonymous 401; other agent/officer 404; storage paths not publicly served and never present in page HTML; uploads/downloads/malware blocks audited.

## Defects found and fixed during verification

| Found by | Defect | Fix |
| --- | --- | --- |
| Portal crawl | `/admin/customers` 500: Drizzle renders single-table columns unqualified, so correlated subqueries bound `"id"` to the inner table (could also silently produce wrong counts elsewhere) | `qcol()` helper; all correlated subqueries now use fully-qualified columns |
| Integration | Local PostgreSQL on Windows defaulted to WIN1252; `₹` in emails failed | Clusters/databases created explicitly as UTF8 (matches Neon) |
| Integration | Account lockout (10 failures) was unreachable behind the per-email rate limit (8) | Lock after 5 failures; per-email limit 10 |
| E2E | Step 4 form remounted when the background refresh after step 3 arrived, discarding typed input | Applicant type applied locally; no remount key |
| E2E | After hand-off the officer's page refreshed into a 404 | Redirect to the queue with a confirmation banner |
| E2E | Dropping the database under a running server crashed it via an unhandled idle-client error | Pool `error` handler (never crash on idle-client errors); E2E resets schema in place |
| Admin fork review | Commission rule edits failed for any used slab rule (slab comparison mismatch) | Canonical slab normalisation before comparison |

## Not covered

- Live Neon, Resend, S3 and ClamAV (credentials unavailable); providers are unit-wired and the local/dev equivalents are tested.
- Load/performance testing, cross-browser E2E (Chromium only), assistive-technology accessibility testing, penetration testing.
