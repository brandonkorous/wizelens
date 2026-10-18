import { describe, expect, it } from "vitest";
import { SearchError, type SearchNode } from "./ast.js";
import { checkSearch } from "./check.js";
import { formatSearch } from "./format.js";
import { compileSearch, type SearchDoc } from "./match.js";
import { parseSearch } from "./parse.js";

interface Vectors {
  parse: { q: string; text: string; ast: SearchNode | null }[];
  errors: { q: string; start: number; end: number }[];
  docs: Record<string, SearchDoc>;
  match: { q: string; doc: string; expect: boolean }[];
}

// The shared cases in docs/search-vectors.json; the .NET suite runs the same file.
const url = new URL("../../../../../docs/search-vectors.json", import.meta.url).href;
const v = (await import(url, { with: { type: "json" } })).default as Vectors;

describe("search vectors", () => {
  it("parses every case to its tree and its text", () => {
    for (const c of v.parse) {
      expect(parseSearch(c.q), c.q).toEqual(c.ast);
      expect(formatSearch(parseSearch(c.q)), c.q).toBe(c.text);
    }
  });

  it("reads its own text back to the same tree", () => {
    for (const c of v.parse) expect(parseSearch(c.text), c.text).toEqual(c.ast);
  });

  it("rejects bad searches with the right position", () => {
    for (const c of v.errors) {
      const r = checkSearch(c.q);
      expect(r.ok, c.q).toBe(false);
      if (!r.ok) expect([r.start, r.end], c.q).toEqual([c.start, c.end]);
      expect(() => parseSearch(c.q)).toThrow(SearchError);
    }
  });

  it("matches documents as each case expects", () => {
    for (const c of v.match) expect(compileSearch(parseSearch(c.q))(v.docs[c.doc]!), `${c.doc}: ${c.q}`).toBe(c.expect);
  });

  it("has cases for every part of the language", () => {
    expect(v.parse.length).toBeGreaterThan(50);
    expect(v.errors.length).toBeGreaterThan(20);
    expect(v.match.length).toBeGreaterThan(80);
  });
});
