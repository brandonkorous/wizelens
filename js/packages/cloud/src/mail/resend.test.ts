import { expect, it } from "vitest";
import type { Mail } from "./mailer.js";
import { resendSender } from "./resend.js";

const mail: Mail = { kind: "alert", to: "ann@acme.io", subject: "Errors is 12 (above 10)", text: "hi", html: "<p>hi</p>" };

/** A fake Resend: answers each call with the next status, and keeps every request. */
function fakeResend(...answers: { status: number; body?: string; retryAfter?: string }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const waits: number[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    return new Response(a.body ?? "{}", { status: a.status, headers: a.retryAfter ? { "retry-after": a.retryAfter } : {} });
  }) as unknown as typeof globalThis.fetch;
  const send = resendSender({ apiKey: "re_test", from: "WizeLens <no-reply@wizelens.com>", fetch, sleep: async (ms) => void waits.push(ms) });
  return { send, calls, waits };
}

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

it("posts the email with the key, the sender, and a kind tag", async () => {
  const r = fakeResend({ status: 200, body: '{"id":"e1"}' });
  await r.send(mail);
  expect(r.calls[0]!.url).toBe("https://api.resend.com/emails");
  expect(headersOf(r.calls[0]!.init).Authorization).toBe("Bearer re_test");
  expect(JSON.parse(String(r.calls[0]!.init.body))).toEqual({
    from: "WizeLens <no-reply@wizelens.com>",
    to: ["ann@acme.io"],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: "alert" }],
  });
});

it("sends reply_to when a reply address is set", async () => {
  const bodies: string[] = [];
  const fetch = (async (_url: string, init: RequestInit) => (bodies.push(String(init.body)), new Response("{}"))) as unknown as typeof globalThis.fetch;
  await resendSender({ apiKey: "re_test", from: "WizeLens <hello@updates.wizelens.com>", replyTo: "hello@wizelens.com", fetch })(mail);
  expect(JSON.parse(bodies[0]!)).toMatchObject({ from: "WizeLens <hello@updates.wizelens.com>", reply_to: "hello@wizelens.com" });
});

it("tries again after 429 and 5xx with the same Idempotency-Key, using Retry-After", async () => {
  const r = fakeResend({ status: 429, retryAfter: "3" }, { status: 503 }, { status: 200 });
  await r.send(mail);
  expect(r.calls).toHaveLength(3);
  expect(new Set(r.calls.map((c) => headersOf(c.init)["Idempotency-Key"])).size).toBe(1);
  expect(r.waits).toEqual([3000, 2000]);
});

it("gives up at once on a 4xx answer or a used-up quota", async () => {
  const bad = fakeResend({ status: 422, body: '{"message":"Invalid to field."}' });
  await expect(bad.send(mail)).rejects.toThrow("Resend answered 422");
  expect(bad.calls).toHaveLength(1);
  const quota = fakeResend({ status: 429, body: '{"name":"daily_quota_exceeded"}' });
  await expect(quota.send(mail)).rejects.toThrow("daily_quota_exceeded");
  expect(quota.calls).toHaveLength(1);
});

it("stops after 4 tries", async () => {
  const r = fakeResend({ status: 500 });
  await expect(r.send(mail)).rejects.toThrow("Resend answered 500");
  expect(r.calls).toHaveLength(4);
});
