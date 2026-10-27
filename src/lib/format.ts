/**
 * Display formatting. Timestamps are stored in UTC and rendered in the platform display time zone.
 * Money values are decimal strings; formatting uses Intl only for display, never for arithmetic.
 */
export const DISPLAY_TIME_ZONE = "Asia/Kolkata";

export function formatMoney(amount: string | number | null | undefined, currency = "INR", opts: { decimals?: boolean } = {}): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const [intPart, frac = ""] = String(amount).split(".");
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;
  // Indian digit grouping without converting to a float.
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  const showDecimals = opts.decimals ?? frac.replace(/0+$/, "") !== "";
  const decimals = showDecimals ? `.${(frac + "00").slice(0, 2)}` : "";
  return `${negative ? "-" : ""}${symbol}${grouped}${decimals}`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: typeof value === "string" && value.length === 10 ? "UTC" : DISPLAY_TIME_ZONE,
  }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTenure(months: number | null | undefined): string {
  if (!months) return "—";
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? "" : "s"}`;
  return `${months} months`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
