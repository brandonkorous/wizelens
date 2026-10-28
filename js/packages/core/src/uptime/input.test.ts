import { describe, expect, it } from "vitest";
import type { UptimeCheckInput } from "./check.js";
import { parseCheckInput, sameCheckProblem } from "./input.js";

const input = (raw: Record<string, unknown>): UptimeCheckInput => {
  const r = parseCheckInput(raw);
  if (!r.ok) throw new Error(r.error);
  return r.input;
};

describe("sameCheckProblem", () => {
  const home = { id: "c1", ...input({ name: "Home page — every 1 min", url: "http://localhost:4173/" }) };

  it("refuses a second check with the same name, method, and URL", () => {
    expect(sameCheckProblem([home], input({ name: " home page — EVERY 1 min ", url: "http://localhost:4173/" }))).toBe('"Home page — every 1 min" already checks GET http://localhost:4173/. Edit that check, or give this one another name.');
  });

  it("lets a check keep its own name, and takes another name, method, or URL", () => {
    expect(sameCheckProblem([home], home, "c1")).toBeNull();
    expect(sameCheckProblem([home], input({ name: "Home page (body)", url: "http://localhost:4173/" }))).toBeNull();
    expect(sameCheckProblem([home], input({ name: "Home page — every 1 min", url: "http://localhost:4173/", method: "HEAD" }))).toBeNull();
    expect(sameCheckProblem([home], input({ url: "http://localhost:4173/contact" }))).toBeNull();
  });
});
