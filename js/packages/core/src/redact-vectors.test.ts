import { describe, expect, it } from "vitest";
import { redactParams, redactValue } from "./redact.js";
import { redactText } from "./redact-values.js";
import type { AttributeValue } from "./types.js";

type Text = string | string[];
interface Vectors {
  attributes: { key: string; value: AttributeValue; want: AttributeValue }[];
  text: { in: Text; out: string }[];
  params: { sql: string; params: unknown; want: unknown }[];
}

// The shared cases in docs/redact-vectors.json; the .NET suite runs the same file.
const url = new URL("../../../../docs/redact-vectors.json", import.meta.url).href;
const v = (await import(url, { with: { type: "json" } })).default as Vectors;
const join = (t: Text) => (Array.isArray(t) ? t.join("") : t);

describe("redaction vectors", () => {
  it("redacts every attribute by its key and its value", () => {
    for (const c of v.attributes) expect(redactValue(c.key, c.value), `${c.key}: ${String(c.value)}`).toEqual(c.want);
  });

  it("replaces secrets found inside text with their marker", () => {
    for (const c of v.text) expect(redactText(join(c.in)), join(c.in)).toBe(c.out);
  });

  it("redacts SQL values by their name or the column they are bound to", () => {
    for (const c of v.params) expect(JSON.parse(redactParams(c.params, undefined, c.sql)!), c.sql).toEqual(c.want);
  });
});
