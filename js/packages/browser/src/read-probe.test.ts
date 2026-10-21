import { expect, it } from "vitest";
import { probeReadApi } from "./read-probe.js";

const answer = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;

it("is true only for a 200 with a JSON object", async () => {
  expect(await probeReadApi("http://app.test/_wizelens", answer('{"service":"api"}'))).toBe(true);
  expect(await probeReadApi("http://app.test/_wizelens", answer("[]"))).toBe(false);
  expect(await probeReadApi("http://app.test/_wizelens", answer("<html></html>"))).toBe(false);
  expect(await probeReadApi("http://app.test/_wizelens", answer("{}", 204))).toBe(false);
  expect(await probeReadApi("http://app.test/_wizelens", answer("{}", 401))).toBe(false);
});

it("is false without fetch, when the server is down, and when it does not answer in time", async () => {
  expect(await probeReadApi("http://app.test/_wizelens", undefined)).toBe(false);
  const down = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  expect(await probeReadApi("http://app.test/_wizelens", down)).toBe(false);
  const hangs = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
  expect(await probeReadApi("http://app.test/_wizelens", hangs, 5)).toBe(false);
});
