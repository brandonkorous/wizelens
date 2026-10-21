import type { ServerResponse } from "node:http";
import { HEADER_ENDPOINT, HEADER_EXPECTED, HEADER_TRACE } from "@wizeworks/lens-core";

const EXPOSE = "access-control-expose-headers";
const OURS = [HEADER_TRACE, HEADER_ENDPOINT, HEADER_EXPECTED];

/** The header value with our names added, without repeats. */
export function withOurNames(value: unknown): string {
  const list = Array.isArray(value) ? value.join(",") : value == null ? "" : String(value);
  const parts = new Set(list.split(",").map((s) => s.trim()).filter(Boolean));
  for (const name of OURS) parts.add(name);
  return [...parts].join(", ");
}

const isExpose = (key: unknown) => typeof key === "string" && key.toLowerCase() === EXPOSE;

/** Add our names to the header inside a writeHead headers argument: an object, a flat array, or pairs. */
function mergeInto(headers: object): void {
  if (!Array.isArray(headers)) {
    const record = headers as Record<string, unknown>;
    for (const key of Object.keys(record)) if (isExpose(key)) record[key] = withOurNames(record[key]);
    return;
  }
  for (let i = 0; i < headers.length; i++) {
    const item: unknown = headers[i];
    if (Array.isArray(item) && isExpose(item[0])) item[1] = withOurNames(item[1]);
    else if (isExpose(item) && i + 1 < headers.length) headers[i + 1] = withOurNames(headers[i + 1]);
  }
}

/** Keep our names in Access-Control-Expose-Headers, even when a CORS layer sets that header after us. */
export function keepExposeHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Expose-Headers", withOurNames(res.getHeader(EXPOSE)));
  const writeHead = res.writeHead;
  res.writeHead = function (this: ServerResponse, ...args: unknown[]) {
    const headers = args.slice(1).find((a): a is object => !!a && typeof a === "object");
    if (headers) mergeInto(headers);
    if (!this.headersSent) this.setHeader("Access-Control-Expose-Headers", withOurNames(this.getHeader(EXPOSE)));
    return writeHead.apply(this, args as Parameters<ServerResponse["writeHead"]>);
  } as ServerResponse["writeHead"];
}
