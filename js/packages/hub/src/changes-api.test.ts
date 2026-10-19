import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { startHub } from "./test/helpers.js";

let hub: Hub | undefined;
afterEach(async () => {
  await hub?.close();
  hub = undefined;
});

/** Read a stream until `text` shows up, for at most 5 s. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string): Promise<string> {
  let got = "";
  const end = Date.now() + 5_000;
  while (!got.includes(text) && Date.now() < end) got += new TextDecoder().decode((await reader.read()).value);
  return got;
}

it("streams an event when settling builds new stats, and says it can", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  const info = (await (await fetch(`${url}/_wizelens/api/info`)).json()) as { capabilities: string[] };
  expect(info.capabilities).toContain("changes");
  const ctl = new AbortController();
  const res = await fetch(`${url}/_wizelens/api/changes`, { signal: ctl.signal });
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = res.body!.getReader();
  expect(await readUntil(reader, "retry:")).toContain("retry: 5000");
  hub.data.store.settleGen += 1;
  expect(await readUntil(reader, "event: data")).toContain(`data: ${hub.data.store.settleGen}`);
  ctl.abort();
});
