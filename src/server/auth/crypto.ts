import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/** 256-bit random token, URL safe. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const BCRYPT_COST = process.env.APP_ENV === "test" ? 4 : 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Pre-computed hash of a random value; compared against when the user does not exist so that
// response timing does not reveal whether an account exists.
let dummyHash: string | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= await bcrypt.hash(generateToken(16), BCRYPT_COST);
  await bcrypt.compare(password, dummyHash);
  return false;
}

/** Crockford base32 alphabet (no I, L, O, U) for human-readable random codes. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CROCKFORD[bytes[i] % 32];
  return out;
}
