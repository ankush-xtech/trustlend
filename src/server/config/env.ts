import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    /** `pg` (node-postgres, TCP) for local/standard Postgres; `neon` for Neon serverless driver (WebSocket). */
    DATABASE_DRIVER: z.enum(["pg", "neon"]).default("pg"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    SESSION_IDLE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    REQUIRE_EMAIL_VERIFICATION: bool.default(true),

    EMAIL_PROVIDER: z.enum(["dev", "resend"]).default("dev"),
    EMAIL_FROM: z.string().default("TrustLend <no-reply@localhost>"),
    RESEND_API_KEY: z.string().optional(),
    DEV_MAILBOX_DIR: z.string().default(".dev-mailbox"),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default(".private-storage"),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(false),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(15).max(900).default(60),
    MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(10),

    /** `none`: files marked NOT_SCANNED; `signature`: built-in EICAR/known-signature check (dev only); `clamav`: clamd over TCP. */
    MALWARE_SCANNER: z.enum(["none", "signature", "clamav"]).default("signature"),
    CLAMAV_HOST: z.string().optional(),
    CLAMAV_PORT: z.coerce.number().int().optional(),

    CRON_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    TRUST_PROXY_HEADERS: bool.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== "production") return;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (env.EMAIL_PROVIDER !== "resend") fail("Production requires EMAIL_PROVIDER=resend");
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) fail("RESEND_API_KEY is required");
    if (env.STORAGE_DRIVER !== "s3") fail("Production requires STORAGE_DRIVER=s3 (private bucket)");
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) fail("CRON_SECRET (>=32 chars) is required in production");
    if (!env.APP_URL.startsWith("https://")) fail("APP_URL must use https in production");
    if (env.MALWARE_SCANNER === "signature")
      fail("MALWARE_SCANNER=signature is a development stand-in; use clamav or none (with manual quarantine)");
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parsed and validated environment. Parsed lazily so that `next build` does not require runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction() {
  return env().APP_ENV === "production";
}

/** For tests only. */
export function resetEnvCache() {
  cached = null;
}
