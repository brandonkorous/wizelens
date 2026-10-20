// Server-side scenario traces: N+1, duplicate and slow queries, failures, and a multi-service checkout. Test-only.
import { ATTR_LAYER, ATTR_MESSAGING, ATTR_RPC } from "../attributes.js";
import type { Trace } from "../types.js";
import { aborted, client, draft, fetchSpan, finish, log, query, server, span, tag } from "./scenario-kit.js";

/** A browser fetch of one order: the server runs the same item query once per line (N+1). */
export function ordersN1(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const f = 1 + (i % 4) * 0.25;
  const order = 100 + i;
  const fetch = fetchSpan(d, { at, ms: 80 * f + 20, url: `http://shop.test/api/orders/${order}`, renderMs: 25 + i, route: "/orders/{}" });
  const srv = server(d, { at: at + 5, ms: 60 * f, path: `/api/orders/${order}`, route: "/api/orders/{id}", parent: fetch.spanId, user: `user-${i % 3}`, extra: tag("cache", i % 2 ? "hit" : "miss") });
  query(d, srv, at + 8, 4, `SELECT * FROM orders WHERE id = ${order}`, { ns: "shop", rows: 1 });
  for (let k = 0; k < 6; k++) query(d, srv, at + 13 + k * 5, 3 + (k % 3) * f, "SELECT * FROM items WHERE order_id = @p0", { ns: "shop", params: `${order}:${k}`, rows: 2, table: "items" });
  log(d, at + 10, "info", `Loaded order ${order}`, "api", srv.spanId);
  log(d, at + 12, "debug", "Cache lookup done", "api", srv.spanId, { hit: i % 2 === 1 });
  return finish(d);
}

/** Cart update in a transaction: the same query with the same parameters twice, and every operation. */
export function cartDup(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const fail = i % 3 === 0;
  const srv = server(d, { at, ms: 40 + i, method: "POST", path: "/api/cart", route: "/api/cart", status: fail ? 409 : 201, extra: i % 5 === 0 ? aborted : tag("beta", true) });
  const pg = { system: "postgresql", ns: "shop" };
  query(d, srv, at + 1, 1, "BEGIN", pg);
  query(d, srv, at + 3, 4, "SELECT * FROM carts WHERE user_id = @p0", { ...pg, params: "u-7", rows: 1 });
  query(d, srv, at + 8, 4, "SELECT * FROM carts WHERE user_id = @p0", { ...pg, params: "u-7", rows: 1 });
  query(d, srv, at + 13, 3, `INSERT INTO cart_items (cart_id, sku) VALUES (7, 'sku-${i}')`, pg);
  query(d, srv, at + 17, 5, "UPDATE carts SET total = 42.5 WHERE id = 7", { ...pg, error: fail ? "deadlock detected" : undefined });
  query(d, srv, at + 23, 2, "DELETE FROM cart_items WHERE id = 3", pg);
  query(d, srv, at + 26, 1, "COMMIT", pg);
  log(d, at + 30, "warn", "Cart total recomputed", "api", srv.spanId);
  return finish(d);
}

/** A slow report: one slow query, then three slow queries that waited together, and a call to an outside host. */
export function reportSlow(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const ms = 600 + 120 * (i % 5);
  const srv = server(d, { at, ms, path: `/api/reports/${i % 4}`, route: "/api/reports/{id}" });
  query(d, srv, at + 10, 250 + i, "SELECT region, SUM(total) FROM sales GROUP BY region", { ns: "shop", rows: 4, table: "sales" });
  for (let k = 0; k < 3; k++) query(d, srv, at + 300 + k * 5, 150, `SELECT * FROM stock WHERE warehouse = ${k}`, { ns: "shop", rows: 10 * (k + 1) });
  client(d, srv, at + 480, 30 + (i % 3), "https://maps.example.com/geo?q=berlin");
  log(d, at + 20, "info", "Report started", "api", srv.spanId);
  return finish(d);
}

/** A payment that did not go through: a 500 with a critical log (a failure), or a 400 with a validation error (not a failure). */
export function payFail(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const timeout = i % 2 === 0;
  const error = timeout ? { type: "TimeoutError", message: `bank did not answer after ${3000 + i} ms` } : { type: "ValidationError", message: `card ${4000 + i} expired` };
  const srv = server(d, { at, ms: 120 + i, method: "POST", path: "/api/pay", route: "/api/pay", status: timeout ? 500 : 400, error, user: "user-9" });
  query(d, srv, at + 4, 6, "SELECT * FROM payments WHERE order_id = @p0", { ns: "shop", params: `${i}`, rows: 0, table: "payments" });
  if (timeout) {
    log(d, at + 100, "error", `Payment failed for order ${77 + i}`, "api", srv.spanId);
    log(d, at + 110, "critical", "Payment provider down", "api", srv.spanId);
  } else log(d, at + 50, "warn", "Card rejected", "api", srv.spanId);
  return finish(d);
}

/** Browser → gateway → orders → outside calls (N+1 HTTP) and a queue → billing worker. */
export function checkoutFlow(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const fetch = fetchSpan(d, { at, ms: 300, method: "POST", url: "http://shop.test/checkout", renderMs: 40, route: "/checkout" });
  const gw = server(d, { at: at + 10, ms: 280, method: "POST", path: "/checkout", route: "/checkout", service: "gateway", parent: fetch.spanId });
  const handler = span(d, { category: "internal", service: "gateway", parentSpanId: gw.spanId, startMs: at + 15, durationMs: 260, name: "CheckoutController.Post", attributes: { [ATTR_LAYER]: "handler" } });
  const call = client(d, handler, at + 20, 200, "http://orders:5200/orders", "POST");
  const orders = server(d, { at: at + 25, ms: 190, method: "POST", path: "/orders", route: "/orders", service: "orders", parent: call.spanId });
  for (let k = 0; k < 5; k++) client(d, orders, at + 30 + k * 20, 15, `https://api.stripe.com/v1/charges/${900 + k}`, "GET", k === 0 && i % 4 === 0 ? 502 : 200);
  const queue = { [ATTR_MESSAGING.system]: "rabbitmq", [ATTR_MESSAGING.destination]: "orders" };
  const send = span(d, { category: "messaging", kind: "producer", service: "orders", parentSpanId: orders.spanId, startMs: at + 140, durationMs: 3, name: "orders send", attributes: { ...queue, [ATTR_MESSAGING.operation]: "send" } });
  const handle = span(d, { category: "messaging", kind: "consumer", service: "billing", parentSpanId: send.spanId, startMs: at + 160, durationMs: 25, name: "orders process", attributes: { ...queue, [ATTR_MESSAGING.operation]: "process" } });
  query(d, handle, at + 165, 10, "INSERT INTO invoices (order_id) VALUES (@p0)", { system: "postgresql", ns: "billing", params: `${i}` });
  query(d, handler, at + 232, 8, "SELECT * FROM sessions WHERE token = @p0", { ns: "auth", params: "t", rows: 1, table: "sessions" });
  log(d, at + 200, "info", "Order placed", "orders", orders.spanId);
  log(d, at + 170, "info", "Invoice queued", "billing", handle.spanId);
  return finish(d);
}

/** A gRPC call without an HTTP status; it also handles an audit message, so "orders" is both an API and a consumer. */
export function grpcCall(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const extra = { [ATTR_RPC.system]: "grpc", [ATTR_RPC.service]: "orders.v1.Orders", [ATTR_RPC.method]: "GetOrder" };
  const srv = server(d, { at, ms: 15 + (i % 7), method: "POST", path: "/orders.v1.Orders/GetOrder", status: null, service: "orders", extra });
  query(d, srv, at + 2, 3, "SELECT * FROM orders WHERE id = @p0", { params: `${i}`, rows: 1 });
  const audit = { [ATTR_MESSAGING.system]: "kafka", [ATTR_MESSAGING.destination]: "audit" };
  span(d, { category: "messaging", kind: "consumer", service: "orders", parentSpanId: srv.spanId, startMs: at + 8, durationMs: 2, name: "audit process", attributes: audit });
  return finish(d);
}
