import { randomUUID } from "node:crypto";
import type { Mail } from "./mailer.js";

const API = "https://api.resend.com/emails";
const TRIES = 4;

export interface ResendSettings {
  apiKey: string;
  from: string;
  fetch: typeof fetch;
  /** Wait between tries. Tests pass a fast one. */
  sleep?: (ms: number) => Promise<void>;
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 429 and 5xx are worth another try, except a used-up daily or monthly quota. */
const retryable = (status: number, body: string) => (status === 429 && !/quota_exceeded/.test(body)) || status >= 500;

/** Seconds from Retry-After, else 1 s, 2 s, 4 s. At most 30 s. */
const waitMs = (res: Response | null, attempt: number) => Math.min(30_000, Number(res?.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt);

const payload = (s: ResendSettings, m: Mail) =>
  JSON.stringify({ from: s.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, tags: [{ name: "kind", value: m.kind }], ...(m.headers ? { headers: m.headers } : {}) });

/** Send one email through the Resend API. The same Idempotency-Key on every try, so a retry never sends it twice. */
export function resendSender(s: ResendSettings): (mail: Mail) => Promise<void> {
  const sleep = s.sleep ?? pause;
  return async (mail) => {
    const headers = { Authorization: `Bearer ${s.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": randomUUID() };
    let problem = "";
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const res = await s.fetch(API, { method: "POST", headers, body: payload(s, mail), signal: AbortSignal.timeout(15_000) }).catch((err: unknown) => {
        problem = err instanceof Error ? err.message : String(err);
        return null;
      });
      if (res?.ok) return;
      const body = res ? await res.text().catch(() => "") : "";
      if (res) problem = `Resend answered ${res.status}: ${body.slice(0, 300)}`;
      if (res && !retryable(res.status, body)) break;
      if (attempt < TRIES - 1) await sleep(waitMs(res, attempt));
    }
    throw new Error(problem);
  };
}
