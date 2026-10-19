import type { IncomingMessage, ServerResponse } from "node:http";
import type { Stripe } from "stripe";
import type { CloudApp } from "../app.js";
import { AUTH_BASE_PATH } from "../auth/options.js";
import { readRawBody, sendJson } from "../http/http.js";
import { USAGE_ROLE } from "./usage-sub.js";

// Stripe's webhook before Better Auth's: usage subscription events are ours (the plugin would mistake them for the plan's).

export const STRIPE_WEBHOOK_PATH = `${AUTH_BASE_PATH}/stripe/webhook`;

type SubEvent = { type: string; data: { object: { id: string; metadata?: Record<string, string> | null } } };

const usageSubOf = (e: SubEvent) => (e.type.startsWith("customer.subscription.") && e.data.object.metadata?.wizelensRole === USAGE_ROLE ? e.data.object : null);

/** A usage subscription that ended while the plan still runs (for example, canceled in the portal) is made again. */
async function onUsageSub(app: CloudApp, e: SubEvent): Promise<void> {
  const sub = usageSubOf(e)!;
  const orgId = sub.metadata?.wizelensOrgId;
  if (!orgId || e.type !== "customer.subscription.deleted") return;
  await app.db.query("UPDATE orgs SET overage_subscription_id = NULL WHERE id = $1 AND overage_subscription_id = $2", [orgId, sub.id]);
  await app.billing.stripe!.sync(orgId);
}

async function forward(app: CloudApp, req: IncomingMessage, raw: string, res: ServerResponse): Promise<void> {
  const headers = { "content-type": String(req.headers["content-type"] ?? "application/json"), "stripe-signature": String(req.headers["stripe-signature"] ?? "") };
  const answer = await app.auth.handler(new Request(`${app.baseUrl()}${STRIPE_WEBHOOK_PATH}`, { method: "POST", headers, body: raw }));
  res.writeHead(answer.status, { "Content-Type": answer.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" });
  res.end(await answer.text());
}

/** `POST /_wizelens/api/auth/stripe/webhook`. 404 while billing is off. */
export async function stripeWebhook(app: CloudApp, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const stripe = app.billing.stripe;
  if (!stripe) return sendJson(res, 404, { error: "Billing is off." });
  const raw = await readRawBody(req);
  const sig = String(req.headers["stripe-signature"] ?? "");
  let event: Stripe.Event;
  try {
    event = await stripe.client.webhooks.constructEventAsync(raw, sig, stripe.webhookSecret);
  } catch {
    return sendJson(res, 400, { error: "The Stripe signature is not valid." });
  }
  if (!usageSubOf(event as unknown as SubEvent)) return forward(app, req, raw, res);
  await onUsageSub(app, event as unknown as SubEvent);
  sendJson(res, 200, { received: true });
}
