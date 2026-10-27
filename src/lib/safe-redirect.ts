/**
 * Validates a post-login redirect target. Only same-origin relative paths are allowed
 * (prevents open redirects such as `//evil.com` or `https://evil.com`).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
