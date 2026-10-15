export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function fmtAgo(epochMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : new Date(epochMs).toLocaleDateString();
}

export function fmtClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Stable color slot (0–7) for a service within a trace's service list. */
export function serviceSlot(service: string, services: readonly string[]): number {
  const i = services.indexOf(service);
  if (i >= 0) return i % 8;
  let h = 0;
  for (const c of service) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 8;
}
