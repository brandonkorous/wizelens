// Synthetic traffic for anomaly tests: steady checkouts through shop, pay, and postgres, then a spike after a pay release. Test-only.
import type { Trace } from "../types.js";
import { client, draft, finish, query, server } from "./scenario-kit.js";

const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;
const DAY = 24 * 60 * MIN;

/** "Now" for the anomaly scenario: a Wednesday, on the hour. */
export const ANOMALY_NOW = Date.UTC(2026, 1, 11, 12);
/** The spike covers the last 20 minutes before now. */
export const SPIKE_MS = 20 * MIN;
/** Checkouts per minute, all the time. */
const PER_MIN = 4;
const QUERY = "SELECT * FROM charges WHERE id = @p0";

export interface AnomalyOptions {
  /** Weeks of history before the current hour (each one hour at the same time of the week). */
  weeks?: number;
  /** Days of history instead (each one hour at the same time of the day). */
  days?: number;
  /** Add the spike; false makes a normal hour. */
  spike?: boolean;
  now?: number;
}

const idOf = (period: number, i: number) => `a7${period.toString(16).padStart(3, "0")}${i.toString(16).padStart(5, "0")}`.padEnd(32, "0");

/** One checkout: shop calls pay, pay reads postgres. In the spike, pay 2.0.0 is slow and times out often. */
function checkout(id: string, at: number, i: number, scale: number, spike: boolean): Trace {
  const d = draft(id);
  const fail = spike && i % 5 < 3;
  const jitter = 1 + (i % 5) * 0.04;
  const q = spike ? 380 : 5 * jitter * scale;
  const payMs = q + 25 * jitter * scale;
  const shop = server(d, { at, ms: payMs + 30 * jitter * scale, method: "GET", path: "/api/checkout", route: "/api/checkout", service: "shop", status: fail ? 502 : 200, extra: { "service.version": "5.1.0" } });
  const call = client(d, shop, at + 5, payMs + 5, "http://pay:5300/api/charge", "POST", fail ? 500 : 200);
  const error = fail ? { type: "TimeoutError", message: "charge store timed out" } : undefined;
  const version = { "service.version": spike ? "2.0.0" : "1.9.0" };
  const pay = server(d, { at: at + 7, ms: payMs, method: "POST", path: "/api/charge", route: "/api/charge", service: "pay", parent: call.spanId, status: fail ? 500 : 200, error, extra: version });
  query(d, pay, at + 9, q, QUERY, { system: "postgresql", ns: "payments", params: `${i}`, rows: 1 });
  return finish(d);
}

/** One hour of checkouts ending at `end`; with `spike`, its last 20 minutes are the spike. */
function hourOf(period: number, end: number, scale: number, spike: boolean): Trace[] {
  const out: Trace[] = [];
  for (let i = 0; i < 60 * PER_MIN; i++) {
    const at = end - 60 * MIN + i * (MIN / PER_MIN) + 1_000;
    out.push(checkout(idOf(period, i), at, i, scale, spike && at >= end - SPIKE_MS));
  }
  return out;
}

/** The current hour (with or without the spike) and the same hour in earlier weeks or days, newest first. */
export function anomalyTraces(o: AnomalyOptions = {}): Trace[] {
  const now = o.now ?? ANOMALY_NOW;
  const back = o.days ? Array.from({ length: o.days }, (_, k) => (k + 1) * DAY) : Array.from({ length: o.weeks ?? 4 }, (_, k) => (k + 1) * WEEK);
  const traces = [hourOf(0, now, 1, o.spike !== false), ...back.map((ago, k) => hourOf(k + 1, now - ago, 1 + 0.05 * (k + 1), false))].flat();
  return traces.sort((a, b) => b.startMs - a.startMs);
}
