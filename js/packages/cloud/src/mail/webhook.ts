import type { Ctx } from "../app.js";
import { fail, readRawBody } from "../http/http.js";
import { type SuppressReason, suppress } from "../repo/suppressions.js";
import { verifySvix } from "./svix.js";

export const RESEND_WEBHOOK_PATH = "api/mail/resend";

interface ResendEvent {
  type?: unknown;
  data?: { to?: unknown; bounce?: { type?: unknown; subType?: unknown; message?: unknown } };
}

const header = (ctx: Ctx, name: string) => {
  const v = ctx.req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** What to do with an event: only hard bounces and spam complaints change anything. */
function suppressionFor(e: ResendEvent): { reason: SuppressReason; detail: string } | null {
  if (e.type === "email.complained") return { reason: "complaint", detail: "Marked as spam." };
  if (e.type !== "email.bounced" || e.data?.bounce?.type !== "Permanent") return null;
  const b = e.data.bounce;
  return { reason: "bounce", detail: [b.subType, b.message].filter((x) => typeof x === "string" && x).join(": ") || "Hard bounce." };
}

/** POST from Resend's webhook, signed with the endpoint's secret. Hard bounces and complaints go on the suppression list. */
export async function resendWebhook(ctx: Ctx): Promise<void> {
  const secret = ctx.app.config.resendWebhookSecret;
  if (!secret) fail(404, "Not found.");
  const raw = await readRawBody(ctx.req);
  const signed = { id: header(ctx, "svix-id"), timestamp: header(ctx, "svix-timestamp"), signature: header(ctx, "svix-signature") };
  if (!verifySvix(secret!, signed, raw, ctx.app.config.now())) fail(401, "The webhook signature does not match.");
  let event: ResendEvent;
  try {
    event = JSON.parse(raw) as ResendEvent;
  } catch {
    return fail(400, "The body is not valid JSON.");
  }
  const action = suppressionFor(event);
  const to = Array.isArray(event.data?.to) ? event.data.to.filter((x): x is string => typeof x === "string") : [];
  if (action) for (const email of to) await suppress(ctx.app.db, email, action.reason, action.detail, ctx.app.config.now());
  ctx.res.writeHead(204).end();
}
