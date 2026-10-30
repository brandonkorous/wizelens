import { Writable } from "node:stream";
import bunyan from "bunyan";
import pino from "pino";
import winston from "winston";
import { afterEach, describe, expect, it } from "vitest";
import { isLooseTraceId, type LogRecord, LOOSE_WINDOW_MS } from "@wizeworks/lens-core";
import { looseLogsOf, type LogOptions } from "../loose-logs.js";
import { TraceStore } from "../store.js";
import { EntryMap, LooseBatcher } from "../store-entries.js";
import type { WizeLens } from "../types.js";
import { createWizeLens } from "../wizelens.js";
import { instrumentBunyan } from "./bunyan.js";
import { instrumentPino } from "./pino.js";
import { instrumentWinston } from "./winston.js";

const open: WizeLens[] = [];
afterEach(async () => void (await Promise.all(open.splice(0).map((w) => w.shutdown()))));

const make = (logs?: LogOptions, captureConsole = false) => {
  const wl = createWizeLens({ service: "jobs-api", storage: "memory", instrumentFetch: false, captureConsole, logs });
  open.push(wl);
  return wl;
};
const sink = () => new Writable({ objectMode: true, write: (_c, _e, cb) => cb() });
const looseLines = (wl: WizeLens): LogRecord[] => wl.store.all().filter((t) => isLooseTraceId(t.traceId)).flatMap((t) => t.logs);

describe("lines outside a request", () => {
  it("are kept from every logger with service and level, and are not traces", () => {
    const wl = make(undefined, true);
    const p = pino({ level: "debug" }, sink());
    instrumentPino(wl, p);
    const w = winston.createLogger({ level: "info", transports: [new winston.transports.Stream({ stream: sink() })] });
    instrumentWinston(wl, w);
    const b = bunyan.createLogger({ name: "boot", streams: [{ stream: sink(), level: "info" }] });
    instrumentBunyan(wl, b);
    p.info("pino started");
    w.warn("winston warmed");
    b.error("bunyan failed");
    console.info("console ready");
    console.warn("[wizelens] own notice");
    wl.logger.info("logger line");
    // The lines can fall in two loose batches when a batch window ends between them, so the order is not checked.
    const byMessage = (a: unknown[], b: unknown[]) => String(a[2]).localeCompare(String(b[2]));
    expect(looseLines(wl).map((l) => [l.level, l.service, l.message, l.spanId]).sort(byMessage)).toEqual([
      ["error", "jobs-api", "bunyan failed", null],
      ["info", "jobs-api", "console ready", null],
      ["info", "jobs-api", "logger line", null],
      ["info", "jobs-api", "pino started", null],
      ["warn", "jobs-api", "winston warmed", null],
    ]);
    expect(wl.store.list(50)).toEqual([]);
  });

  it("follow the level floor, the sample rate, and the off switch", () => {
    const floor = make({ minLevel: "warn" });
    floor.logger.info("dropped");
    floor.logger.warn("kept");
    expect(looseLines(floor).map((l) => l.message)).toEqual(["kept"]);
    const sampled = make({ rate: 0, minLevel: "debug" });
    sampled.logger.debug("dropped");
    sampled.logger.error("kept");
    expect(looseLines(sampled).map((l) => l.message)).toEqual(["kept"]);
    const off = make({ outside: false });
    off.logger.error("dropped");
    expect(looseLines(off)).toEqual([]);
  });

  it("read their options from the variables", () => {
    expect(looseLogsOf({}, { WIZELENS_LOGS_OUTSIDE: "off", WIZELENS_LOGS_MIN_LEVEL: "Warning", WIZELENS_LOGS_SAMPLE_RATE: "0.25" })).toEqual({ outside: false, minLevel: "warn", rate: 0.25 });
    expect(looseLogsOf({ minLevel: "debug" }, { WIZELENS_LOGS_MIN_LEVEL: "error" })).toEqual({ outside: true, minLevel: "debug", rate: 1 });
    expect(looseLogsOf({}, { WIZELENS_LOGS_SAMPLE_RATE: "nope" }).rate).toBe(1);
  });
});

describe("loose batches", () => {
  it("start again each 5-minute window and when full", () => {
    const b = new LooseBatcher(2);
    const first = b.idFor(0);
    expect([b.idFor(1), isLooseTraceId(first)]).toEqual([first, true]);
    const full = b.idFor(2);
    expect(full).not.toBe(first);
    expect(b.idFor(LOOSE_WINDOW_MS)).not.toBe(full);
  });

  it("have their own cap, so lines and traces never push each other out", () => {
    const m = new EntryMap(2, 1);
    m.touch("a".repeat(32), 1);
    m.touch("b".repeat(32), 2);
    m.touch(`${"0".repeat(16)}${"1".repeat(16)}`, 3);
    m.touch(`${"0".repeat(16)}${"2".repeat(16)}`, 4);
    expect([...m.values()].map((e) => e.traceId[0] + e.traceId[31])).toEqual(["aa", "bb", "02"]);
    expect(m.size).toBe(2);
  });

  it("skip trace sampling", () => {
    const store = new TraceStore({ sampler: { log: () => ({ action: "drop" }) } as never });
    const id = store.addLooseLog({ timeMs: 1, level: "info", category: "c", message: "m", service: "s", spanId: null, attributes: {} });
    expect(store.get(id)?.logs.length).toBe(1);
  });
});
