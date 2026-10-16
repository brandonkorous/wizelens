import type { IncomingMessage, ServerResponse } from "node:http";
import { isProtobuf, parseJson, readBody } from "../body.js";
import type { HubWrite } from "../store.js";
import { type OtlpResourceLogs, writesFromLogs } from "./logs.js";
import { decodeLogs, decodeTraces } from "./proto.js";
import { type OtlpResourceSpans, writesFromSpans } from "./spans.js";

export type OtlpSignal = "traces" | "logs";

/** The OTLP/HTTP paths the hub answers: the standard ones, so OTEL_EXPORTER_OTLP_ENDPOINT can point at the hub. */
export function otlpSignalOf(path: string): OtlpSignal | null {
  const m = /^(?:\/_wizelens)?\/v1\/(traces|logs)$/.exec(path);
  return m ? (m[1] as OtlpSignal) : null;
}

async function writesOf(signal: OtlpSignal, req: IncomingMessage, redactKeys: readonly string[]): Promise<HubWrite[]> {
  const body = await readBody(req);
  if (signal === "traces") {
    const list = isProtobuf(req) ? decodeTraces(body) : ((parseJson(body) as { resourceSpans?: OtlpResourceSpans[] })?.resourceSpans ?? []);
    return writesFromSpans(list, redactKeys);
  }
  const list = isProtobuf(req) ? decodeLogs(body) : ((parseJson(body) as { resourceLogs?: OtlpResourceLogs[] })?.resourceLogs ?? []);
  return writesFromLogs(list, redactKeys);
}

/** Take one OTLP export. Answers in the format it was sent in, with an empty (full success) response. */
export async function handleOtlp(signal: OtlpSignal, req: IncomingMessage, res: ServerResponse, save: (w: HubWrite) => void | Promise<void>, redactKeys: readonly string[]): Promise<void> {
  const proto = isProtobuf(req);
  try {
    for (const w of await writesOf(signal, req, redactKeys)) await save(w);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 3, message: err instanceof Error ? err.message : "invalid body" }));
    return;
  }
  if (proto) res.writeHead(200, { "Content-Type": "application/x-protobuf" }).end();
  else res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
}
