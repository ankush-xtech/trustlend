/**
 * Development demo accounts use this reserved domain (.test is never a real TLD).
 * Logins for this domain are refused when APP_ENV=production, and the seed script refuses to run there.
 */
export const DEMO_EMAIL_DOMAIN = "demo.trustlend.test";

export function isDemoEmail(email: string) {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Builds a tiny valid PDF used for illustrative seed/test documents (contains no real data). */
export function samplePdf(label: string): Buffer {
  const text = `ILLUSTRATIVE SAMPLE DOCUMENT - ${label.replace(/[()\\]/g, "")} - NOT A REAL DOCUMENT`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length + 33} >>\nstream\nBT /F1 12 Tf 40 100 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
