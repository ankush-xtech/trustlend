/**
 * Server-side file type detection from magic bytes. The browser-supplied MIME type and file extension
 * are never trusted. Only PDF, PNG and JPEG are accepted for loan documents.
 */
export const ALLOWED_DOCUMENT_TYPES = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/png": { ext: "png", label: "PNG" },
  "image/jpeg": { ext: "jpg", label: "JPEG" },
} as const;

export type AllowedMime = keyof typeof ALLOWED_DOCUMENT_TYPES;

export function detectMimeType(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length < 8) return null;
  // %PDF-
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  // \x89PNG\r\n\x1a\n
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  // JPEG SOI + marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Strip path components and control characters from an uploaded filename (display only; never used as a path). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "").trim();
  return (cleaned || "document").slice(0, 150);
}
