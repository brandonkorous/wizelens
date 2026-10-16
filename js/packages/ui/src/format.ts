// Number, time, and size formats used across the dashboard.

const DASH = "–";

/** "0.42 ms", "4.2 ms", "184 ms", "1.24 s", "12.4 s". */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  if (ms === 0) return "0 ms";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/** "482,391". */
export const fmtCount = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? DASH : Math.round(n).toLocaleString("en-US"));

/** "0.42%", "12%", "100%". */
export function fmtPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return DASH;
  if (pct === 0) return "0%";
  if (Math.abs(pct) < 10) return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
  return `${Math.round(pct)}%`;
}

/** "1.2 KB", "3.4 MB". */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "1.2M", "980K", "312". */
export function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return fmtCount(n);
}

/** "8:42:17 PM". */
export const fmtTime = (epochMs: number): string => new Date(epochMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** "Oct 15, 2026". */
export const fmtDate = (epochMs: number): string => new Date(epochMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Oct 15, 2026, 8:42 PM". */
export const fmtDateTime = (epochMs: number): string =>
  new Date(epochMs).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const TWO_DAYS_MS = 2 * 24 * 60 * 60_000;

/** Axis label for a chart tick: time of day for short ranges, the date when the chart spans days. */
export const fmtTick = (epochMs: number, spanMs = 0): string =>
  spanMs > TWO_DAYS_MS
    ? new Date(epochMs).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : new Date(epochMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Tooltip label for one chart bucket: with the date when the chart spans days. */
export const fmtBucket = (epochMs: number, spanMs = 0): string =>
  spanMs > TWO_DAYS_MS ? new Date(epochMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }) : fmtTick(epochMs);

/** "20:42:17.123", for trace timelines. */
export function fmtClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function fmtAgo(epochMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : fmtDate(epochMs);
}

/** Stable color slot (0–7) for a service within a list of services. */
export function serviceSlot(service: string, services: readonly string[]): number {
  const i = services.indexOf(service);
  if (i >= 0) return i % 8;
  let h = 0;
  for (const c of service) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 8;
}

/** Short trace id for tables: the first 8 hex digits. */
export const shortId = (traceId: string): string => traceId.slice(0, 8);
