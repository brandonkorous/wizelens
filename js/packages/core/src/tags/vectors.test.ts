import { describe, expect, it } from "vitest";
import { formatSearch } from "../search/format.js";
import { parseSearch } from "../search/parse.js";
import { activeTags, BUILT_IN_TAGS, tagList } from "./builtins.js";
import { checkTagInput } from "./check.js";
import { expandTags } from "./expand.js";

interface TagVectors {
  builtIns: { name: string; color: string; query: string }[];
  rules: { name: string; query: string }[];
  expand: { q: string; text: string; unknown: string[] }[];
  names: { input: string; name: string | null }[];
  queries: { query: string; ok: boolean }[];
  colors: { color: string; ok: boolean }[];
}

// The tag cases in docs/search-vectors.json; the .NET suite runs the same file (TagTests.cs).
const url = new URL("../../../../../docs/search-vectors.json", import.meta.url).href;
const v = ((await import(url, { with: { type: "json" } })).default as { tags: TagVectors }).tags;
const tags = activeTags(tagList(v.rules.map((r) => ({ id: r.name, ...r, color: "blue", builtIn: false, enabled: true })), new Set()));

describe("tag vectors", () => {
  it("ships the built-ins the file names", () => {
    expect(BUILT_IN_TAGS).toEqual(v.builtIns);
  });

  it("expands tag: as each case expects", () => {
    for (const c of v.expand) {
      const e = expandTags(parseSearch(c.q), tags);
      expect(formatSearch(e.node), c.q).toBe(c.text);
      expect(e.unknownTags, c.q).toEqual(c.unknown);
    }
  });

  it("checks names, searches, and colors as each case expects", () => {
    for (const c of v.names) {
      const r = checkTagInput({ name: c.input, query: "a" }, ["pay"]);
      expect(r.ok ? r.input.name : null, c.input).toBe(c.name);
    }
    for (const c of v.queries) expect(checkTagInput({ name: "x", query: c.query }, []).ok, c.query).toBe(c.ok);
    for (const c of v.colors) expect(checkTagInput({ name: "x", color: c.color, query: "a" }, []).ok, c.color).toBe(c.ok);
  });
});
