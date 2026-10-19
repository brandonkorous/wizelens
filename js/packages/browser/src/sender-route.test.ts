import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSender } from "./sender.js";
import { span, stubPage } from "./test-env.js";

beforeEach(stubPage);
afterEach(() => vi.unstubAllGlobals());

const PAGE = "http://app.test/_wizelens";
const API = "http://api.test/_wizelens";

it("sends spans and logs to the server that holds their trace, in one post per server", async () => {
  const posts = new Map<string, { spans: unknown[]; logs?: unknown[] }>();
  const send = (async (url: string, init?: RequestInit) => {
    posts.set(url, JSON.parse(String(init!.body)));
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  const owners: Record<string, string> = { page: PAGE, evil: "http://evil.test/_wizelens" };
  const sender = createSender(API, () => send, (id) => owners[id] ?? API);
  sender.push(span("1", "browser", "browser", 1, { traceId: "page" }));
  sender.push(span("2", "browser", "browser", 1, { traceId: "other" }));
  sender.push(span("3", "browser", "browser", 1, { traceId: "evil" }));
  sender.log({ traceId: "page", timeMs: 1, level: "info", category: "console", message: "hi", service: "browser", spanId: null, attributes: {} });
  await sender.flush();
  expect([...posts.keys()].sort()).toEqual([`${API}/api/client-spans`, `${PAGE}/api/client-spans`]);
  expect(posts.get(`${PAGE}/api/client-spans`)).toMatchObject({ spans: [{ spanId: "1" }], logs: [{ message: "hi" }] });
  expect(posts.get(`${API}/api/client-spans`)!.spans).toHaveLength(2);
  expect(posts.get(`${API}/api/client-spans`)!.logs).toBeUndefined();
});
