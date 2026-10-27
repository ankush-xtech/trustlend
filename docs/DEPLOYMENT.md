# Deployment guide (Vercel + Neon + S3)

> Nothing in this guide has been executed against live Vercel, Neon, S3 or Resend accounts — those credentials were not available during development. The steps follow each provider's standard setup; verify each one during your first deployment.

## 1. Install dependencies

```bash
npm ci
```

Node.js 20.9+ (Vercel default Node 24 is fine).

## 2. Environment variables

Set these in Vercel (Project → Settings → Environment Variables) for Production (and Preview with separate resources). See `.env.example` for descriptions.

| Variable | Production value |
| --- | --- |
| `APP_ENV` | `production` (enables strict config validation) |
| `APP_URL` | `https://your-domain` (must be https) |
| `DATABASE_URL` | Neon **pooled** connection string (`…-pooler….neon.tech/…?sslmode=require`) |
| `DATABASE_URL_DIRECT` | Neon **direct** connection string (migrations) |
| `DATABASE_DRIVER` | `pg` (TCP; recommended on Vercel Fluid compute) or `neon` (WebSocket driver) |
| `DATABASE_POOL_MAX` | `5` |
| `SESSION_TTL_HOURS`, `SESSION_IDLE_TIMEOUT_HOURS` | `168`, `24` (adjust to policy) |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend API key; sender on a verified domain |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Private bucket + least-privilege IAM credentials |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | Only for S3-compatible providers (R2, MinIO) |
| `SIGNED_URL_TTL_SECONDS` | `60` |
| `MAX_UPLOAD_MB` | `10` (keep ≤ the platform request body limit — Vercel Functions accept ~4.5 MB request bodies; set `4` on Vercel or move to direct-to-S3 presigned uploads, see SECURITY.md gaps) |
| `MALWARE_SCANNER` | `clamav` with `CLAMAV_HOST`/`CLAMAV_PORT`, or `none` + enable "Require a clean malware scan" setting only once scanning exists |
| `CRON_SECRET` | ≥ 32 random characters (Vercel Cron sends it as a Bearer token) |
| `LOG_LEVEL` | `info` |

In production, configuration validation fails (and requests error out) if email is not Resend, storage is not S3, `CRON_SECRET` is weak, `APP_URL` is not https, or the dev signature scanner is selected.

## 3. Provision Neon

1. Create a Neon project in the region closest to your Vercel functions (e.g. `aws-ap-south-1` for India).
2. Create a database (UTF8 is Neon's default) and a dedicated role for the app.
3. Copy the pooled and direct connection strings into `DATABASE_URL` / `DATABASE_URL_DIRECT`.
4. Enable point-in-time restore (history retention) appropriate to your plan.
5. Optional: use Neon branches for Preview deployments.

## 4. Run migrations

From a trusted machine or CI job (never automatically in the request path):

```bash
DATABASE_URL_DIRECT="postgres://…direct…" npm run db:migrate
```

Migrations are forward-only and non-destructive. Review new migration SQL before applying. Never run `db:seed` against production (it refuses when `APP_ENV=production`).

## 5. Configure private file storage

1. Create an S3 bucket with **Block Public Access = on**, default encryption (SSE-S3 or SSE-KMS), versioning on.
2. No bucket policy granting public reads. CORS is not required (downloads use redirects to presigned URLs; uploads go through the app).
3. IAM policy for the app user limited to `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/applications/*`.
4. Lifecycle: no expiry for application documents (retention policy decides), abort incomplete multipart uploads after 7 days.

## 6. Authentication settings

No third-party OAuth provider is used. Ensure `APP_URL` matches the production domain exactly — it is used for email links and the `__Host-` secure cookie. If you serve the app behind another proxy domain, add it to `experimental.serverActions.allowedOrigins` in `next.config.ts`.

## 7. Email provider

1. Add and verify your sending domain in Resend (SPF, DKIM, DMARC).
2. Set `RESEND_API_KEY` and `EMAIL_FROM`.
3. Emails are queued in the `notifications` outbox and dispatched after each response and by the cron job; check `/admin/notifications` for delivery status and failures.

## 8. Provision the first administrator

```bash
DATABASE_URL_DIRECT="…" APP_URL="https://your-domain" npm run admin:provision -- --email owner@company.com --name "Owner Name"
```

Open the printed single-use link (valid 72 h) to set a password. Then create further staff via `/admin/users` (invitations) and agents via `/admin/agents/new`. Create real loan products and commission rules in the admin UI (the demo catalog is seed-only and marked illustrative).

## 9. Tests and production build

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

## 10. Deploy

```bash
npm i -g vercel
vercel link
vercel deploy            # preview
vercel deploy --prod     # production
```

`vercel.json` registers two cron jobs: notification dispatch every 5 minutes (Vercel Pro or above; on Hobby use daily, or an external scheduler calling the endpoint with `Authorization: Bearer $CRON_SECRET`) and daily maintenance (expired sessions, used tokens, rate-limit windows, secret email bodies).

## 11. Verify production health

- `GET /api/health` → `{"status":"ok","database":"ok",…}` and integration modes (no secrets).
- Sign in as the provisioned admin; check `/admin/notifications` shows the Resend provider; upload and download a test document in a test application and confirm the download redirects to an `X-Amz-Expires=60` URL.
- Confirm response headers: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: DENY`.

## 12. Backups, monitoring and incident recovery

- **Backups:** Neon point-in-time restore (set retention per policy); S3 versioning (+ optional cross-region replication). Test a restore into a branch quarterly.
- **Monitoring:** configure a Vercel log drain (Datadog, Better Stack, etc.) for the structured JSON logs; alert on `"level":"error"`, `database pool error`, `email delivery failed`, and on `/api/health` failures via an uptime monitor.
- **Incident recovery:** to cut off a compromised account, deactivate it in `/admin/users` (sessions are revoked immediately). To revoke all sessions globally, `DELETE FROM sessions;`. Rotate `RESEND_API_KEY`, S3 keys and `CRON_SECRET` through Vercel env vars and redeploy. Audit trail: `/admin/audit`.
- **Data deletion requests:** application, financial and audit records are retention-protected by triggers; deletions must follow a documented legal procedure executed by a DBA (see SECURITY.md).
