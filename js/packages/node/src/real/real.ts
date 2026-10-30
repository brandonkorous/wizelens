// Tests against real servers and the real libraries: on with WIZELENS_TEST_REAL=1 (CI's "Real libraries" job starts the servers).
import type { Span, Trace } from "@wizeworks/lens-core/internal";
import { createWizeLens } from "../wizelens.js";
import type { WizeLens } from "../types.js";
import { startApp } from "../test/helpers.js";

export const REAL = process.env.WIZELENS_TEST_REAL === "1";

export const REAL_URLS = {
  redis: process.env.WIZELENS_TEST_REDIS ?? "redis://127.0.0.1:6379",
  mongo: process.env.WIZELENS_TEST_MONGO ?? "mongodb://127.0.0.1:27017",
  elastic: process.env.WIZELENS_TEST_ELASTIC ?? "http://127.0.0.1:9200",
  sqs: process.env.WIZELENS_TEST_SQS ?? "http://127.0.0.1:9324",
};

/** A fresh in-memory instance for one test file. */
export const realLens = (name: string): WizeLens => createWizeLens({ service: name, storage: "memory", enabled: true });

/** A name no other run uses, for keys, collections, indexes, and queues. */
export const unique = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Run `work` inside one real request to an Express app, and return that request's trace once it is stored. */
export async function inRequest(wizelens: WizeLens, work: () => Promise<unknown>): Promise<Trace> {
  const path = `/${unique("go")}`;
  const app = await startApp(wizelens, (a) => a.get(path, (_req, res, next) => void work().then(() => res.send("ok"), next)));
  try {
    const res = await fetch(`${app.base}${path}`);
    if (!res.ok) throw new Error(`the request failed with ${res.status}: ${await res.text()}`);
    return await traceOf(wizelens, (t) => t.spans.some((s) => s.kind === "server" && s.name.endsWith(path)));
  } finally {
    await app.close();
  }
}

/** The first stored trace that matches, waiting up to five seconds for late spans. */
export async function traceOf(wizelens: WizeLens, match: (t: Trace) => boolean, settleMs = 150): Promise<Trace> {
  for (let i = 0; i < 50; i++) {
    const t = wizelens.store.all().find(match);
    if (t) {
      await new Promise((r) => setTimeout(r, settleMs));
      return wizelens.store.all().find(match)!;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("no matching trace was stored");
}

/** The trace's spans of one category, oldest first. */
export const spansOf = (t: Trace, category: string): Span[] => t.spans.filter((s) => s.category === category).sort((a, b) => a.startMs - b.startMs);
