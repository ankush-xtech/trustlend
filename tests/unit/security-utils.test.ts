import { describe, expect, it } from "vitest";
import { detectMimeType, sanitizeFilename } from "@/lib/domain/file-signature";
import { safeNextPath } from "@/lib/safe-redirect";
import { toCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/format";
import { samplePdf } from "@/lib/domain/demo";

describe("file signature detection", () => {
  it("detects PDF, PNG and JPEG by magic bytes", () => {
    expect(detectMimeType(samplePdf("x"))).toBe("application/pdf");
    expect(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe("image/jpeg");
  });
  it("rejects disguised or unsupported files regardless of extension", () => {
    expect(detectMimeType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectMimeType(Buffer.from("MZ\x90\x00executable....", "latin1"))).toBeNull();
    expect(detectMimeType(Buffer.from([0x25, 0x50]))).toBeNull();
  });
  it("sanitizes filenames for display", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\scan<1>.pdf")).toBe("scan1.pdf");
    expect(sanitizeFilename("")).toBe("document");
  });
});

describe("redirect validation", () => {
  it("allows same-origin relative paths only", () => {
    expect(safeNextPath("/customer/applications?x=1")).toBe("/customer/applications?x=1");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes cells", () => {
    const csv = toCsv(["Name", "Amount"], [["=HYPERLINK(\"http://evil\")", "1000.00"], ["+cmd", "-25.50"], ["@SUM(A1)", null], ['He said "hi"', 5]]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil"")","1000.00"`);
    expect(lines[2]).toBe(`"'+cmd","-25.50"`); // negative numbers stay numeric
    expect(lines[3]).toBe(`"'@SUM(A1)",""`);
    expect(lines[4]).toBe(`"He said ""hi""","5"`);
  });
});

describe("money formatting", () => {
  it("uses Indian digit grouping without float conversion", () => {
    expect(formatMoney("4200000.00")).toBe("₹42,00,000");
    expect(formatMoney("123456789012.5")).toBe("₹1,23,45,67,89,012.50");
    expect(formatMoney("999")).toBe("₹999");
    expect(formatMoney(null)).toBe("—");
  });
});
