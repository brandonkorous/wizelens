import type { ServerResponse } from "node:http";
import { HEADER_ENDPOINT, HEADER_TRACE } from "@wizeworks/lens-core";
import type { Req } from "./types.js";

const MAX_BODY = 5 * 1024 * 1024;

export function firstHeader(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.split(",")[0]?.trim() || undefined;
}

export function appendExposeHeaders(res: ServerResponse): void {
  const existing = res.getHeader("Access-Control-Expose-Headers");
  const parts = new Set(
    String(Array.isArray(existing) ? existing.join(",") : (existing ?? ""))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  parts.add(HEADER_TRACE);
  parts.add(HEADER_ENDPOINT);
  res.setHeader("Access-Control-Expose-Headers", [...parts].join(", "));
}

export function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

export async function readJson(req: Req): Promise<unknown> {
  if (req.body !== undefined && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

/** Undici request headers are a `name: value\r\n` string (v5) or a flat array (v6+). */
export function hasRequestHeader(headers: string | (string | string[])[], name: string): boolean {
  if (typeof headers === "string") return headers.toLowerCase().includes(`${name.toLowerCase()}:`);
  for (let i = 0; i < headers.length; i += 2) if (String(headers[i]).toLowerCase() === name.toLowerCase()) return true;
  return false;
}

export function responseHeader(headers: Buffer[], name: string): string | undefined {
  const lower = name.toLowerCase();
  for (let i = 0; i + 1 < headers.length; i += 2) {
    if (headers[i]!.toString("latin1").toLowerCase() === lower) return headers[i + 1]!.toString("latin1");
  }
  return undefined;
}
