import { Writable } from "node:stream";
import bunyan from "bunyan";
import { createConsola } from "consola";
import log4js from "log4js";
import pino from "pino";
import winston from "winston";
import { afterEach, describe, expect, it } from "vitest";
import type { LogRecord } from "@wizeworks/lens-core/internal";
import { createWizeLens } from "../wizelens.js";
import type { WizeLens } from "../types.js";
import { instrumentBunyan } from "./bunyan.js";
import { instrumentConsola } from "./consola.js";
import { log4jsAppender } from "./log4js.js";
import { nestLogger } from "./nest.js";
import { instrumentPino } from "./pino.js";
import { instrumentWinston } from "./winston.js";

const open: WizeLens[] = [];
afterEach(async () => void (await Promise.all(open.splice(0).map((w) => w.shutdown()))));

const make = (captureConsole = false) => {
  const wl = createWizeLens({ service: "logs-api", storage: "memory", instrumentFetch: false, captureConsole });
  open.push(wl);
  return wl;
};
const sink = () => new Writable({ objectMode: true, write: (_c, _e, cb) => cb() });

/** Run `fn` inside a span and return the logs of its trace. */
function inSpan(wl: WizeLens, fn: () => void): LogRecord[] {
  let traceId = "";
  wl.tracer.startActiveSpan("work", (span) => {
    traceId = span.spanContext().traceId;
    fn();
    span.end();
  });
  return wl.store.get(traceId)?.logs ?? [];
}

describe("console", () => {
  it("copies console calls inside a span, not outside, and stops on shutdown", async () => {
    const before = console.warn;
    const wl = make(true);
    const logs = inSpan(wl, () => {
      console.warn("low stock %d", 3);
      console.error(new Error("boom"));
    });
    console.log("outside");
    expect(logs.map((l) => [l.level, l.category, l.message])).toEqual([
      ["warn", "console", "low stock 3"],
      ["error", "console", expect.stringContaining("Error: boom")],
    ]);
    expect(logs[1]!.attributes["exception.message"]).toBe("boom");
    await wl.shutdown();
    expect(console.warn).toBe(before);
  });
});

describe("pino", () => {
  it("copies lines with fields, bindings, errors, and levels", () => {
    const wl = make();
    const logger = pino({ level: "debug" }, sink());
    expect(instrumentPino(wl, logger)).toBe(true);
    const child = logger.child({ reqId: "r1" });
    const logs = inSpan(wl, () => {
      child.info({ orderId: 7, password: "x" }, "order %s", "placed");
      logger.error(new Error("bad"), "failed");
      logger.trace("hidden");
    });
    expect(logs.map((l) => [l.level, l.message])).toEqual([["info", "order placed"], ["error", "failed"]]);
    expect(logs[0]!.attributes).toMatchObject({ reqId: "r1", orderId: 7, password: "[redacted]" });
    expect(logs[0]!.attributes.pid).toBeUndefined();
    expect(logs[1]!.attributes["exception.message"]).toBe("bad");
  });
});

describe("winston", () => {
  it("copies lines with metadata, splat, child metadata, and level filter", () => {
    const wl = make();
    const logger = winston.createLogger({ level: "info", transports: [new winston.transports.Stream({ stream: sink() })] });
    instrumentWinston(wl, logger);
    const logs = inSpan(wl, () => {
      logger.info("user %s signed in", "ana", { userId: 4 });
      logger.child({ module: "billing" }).warn("card declined");
      logger.debug("hidden");
      logger.error(new Error("crash"));
    });
    expect(logs.map((l) => [l.level, l.message])).toEqual([
      ["info", "user ana signed in"],
      ["warn", "card declined"],
      ["error", "crash"],
    ]);
    expect(logs[0]!.attributes.userId).toBe(4);
    expect(logs[1]!.attributes.module).toBe("billing");
  });
});

describe("bunyan", () => {
  it("copies records with fields and errors", () => {
    const wl = make();
    const logger = bunyan.createLogger({ name: "jobs", streams: [{ stream: sink(), level: "info" }] });
    instrumentBunyan(wl, logger);
    const logs = inSpan(wl, () => {
      logger.child({ job: "sync" }).info({ rows: 12 }, "synced");
      logger.error({ err: new Error("lost") }, "sync failed");
    });
    expect(logs.map((l) => [l.level, l.category, l.message])).toEqual([["info", "jobs", "synced"], ["error", "jobs", "sync failed"]]);
    expect(logs[0]!.attributes).toMatchObject({ job: "sync", rows: 12 });
    expect(logs[1]!.attributes["exception.message"]).toBe("lost");
  });
});

describe("log4js, consola, and NestJS", () => {
  it("log4js appender copies events with category and context", () => {
    const wl = make();
    log4js.configure({ appenders: { wl: { type: log4jsAppender(wl) } }, categories: { default: { appenders: ["wl"], level: "info" } } });
    const logger = log4js.getLogger("payments");
    logger.addContext("tenant", "acme");
    const logs = inSpan(wl, () => logger.warn("retry %d", 2));
    expect(logs.map((l) => [l.level, l.category, l.message, l.attributes.tenant])).toEqual([["warn", "payments", "retry 2", "acme"]]);
  });

  it("consola reporter copies lines with tag and type", () => {
    const wl = make();
    const consola = createConsola({ reporters: [], level: 4 });
    instrumentConsola(wl, consola);
    const logs = inSpan(wl, () => {
      consola.withTag("cache").success("warmed");
      consola.fatal("down");
    });
    expect(logs.map((l) => [l.level, l.category, l.message])).toEqual([["info", "cache", "warmed"], ["critical", "consola", "down"]]);
  });

  it("NestJS logger copies lines, passes them on, and respects levels", () => {
    const wl = make();
    const seen: unknown[][] = [];
    const inner = { log: (...a: unknown[]) => seen.push(a), error: (...a: unknown[]) => seen.push(a), isLevelEnabled: (l: string) => l !== "debug" };
    const logger = nestLogger(wl, inner);
    const logs = inSpan(wl, () => {
      logger.log("ready", "OrdersService");
      logger.error("failed", "Error: x\n    at f (a.js:1:1)", "OrdersController");
      logger.debug("hidden", "OrdersService");
    });
    expect(logs.map((l) => [l.level, l.category, l.message])).toEqual([["info", "OrdersService", "ready"], ["error", "OrdersController", "failed"]]);
    expect(logs[1]!.attributes["exception.stacktrace"]).toContain("at f");
    expect(seen).toHaveLength(2);
  });
});
