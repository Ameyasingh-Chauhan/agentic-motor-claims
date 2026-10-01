import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export const IST = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹1,25,000 — never shows paise (§6.8). */
export function formatINR(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return inr.format(Math.round(Number(value)));
}

/** ₹4.2 L / ₹3.1 Cr / ₹85,000 — KPI cards and chart axes. */
export function formatINRCompact(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const v = Number(value);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const trim = (n) => (Math.round(n * 10) / 10).toString();
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} L`;
  return formatINR(v);
}

export function formatNumber(value) {
  if (value == null) return "—";
  return num.format(value);
}

/** One decimal max (§6.8). */
export function formatPercent(value, decimals = 1) {
  if (value == null) return "—";
  const f = 10 ** decimals;
  return `${Math.round(value * f) / f}%`;
}

export function toIST(date) {
  return dayjs(date).tz(IST);
}

/** 30 Sep 2026 */
export function formatDate(date) {
  if (!date) return "—";
  return toIST(date).format("DD MMM YYYY");
}

/** 02:14 AM IST */
export function formatTime(date) {
  if (!date) return "—";
  return `${toIST(date).format("hh:mm A")} IST`;
}

/** 30 Sep 2026, 02:14 AM IST */
export function formatDateTime(date) {
  if (!date) return "—";
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/** Thu, 01 Oct 2026 · 11:42 AM IST (Topbar clock) */
export function formatClock(date = new Date()) {
  const d = toIST(date);
  return `${d.format("ddd, DD MMM YYYY")} · ${d.format("hh:mm A")} IST`;
}

/** "3 minutes ago" */
export function formatRelative(date) {
  if (!date) return "—";
  return dayjs(date).fromNow();
}

/** MH12AB1234 → MH 12 AB 1234 */
export function formatRegistration(reg) {
  if (!reg) return "—";
  const compact = String(reg).replace(/\s+/g, "").toUpperCase();
  const m = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (!m) return reg;
  return [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ");
}

export function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Risk score → band (§6.5): 0–29 Low, 30–70 Medium, 71–100 High. */
export function riskBand(score) {
  if (score == null) return { key: "pending", label: "Pending", level: "pending" };
  if (score <= 29) return { key: "low", label: "Low risk", level: "pass" };
  if (score <= 70) return { key: "medium", label: "Medium risk", level: "warn" };
  return { key: "high", label: "High risk", level: "fail" };
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}
