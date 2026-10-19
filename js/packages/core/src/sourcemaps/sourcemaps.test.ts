import { describe, expect, it } from "vitest";
import { originalPosition, parseSourceMap } from "./map.js";
import { enclosingName } from "./names.js";
import { displaySource, groupFrameOf, resolveStack } from "./resolve.js";
import { parseStack } from "./stack.js";
import { decodeMappings, encodeMappings } from "./vlq.js";
import { checkResolve, checkUpload, mapFileCandidates, normalizeMapFile } from "./wire.js";
import { CART_MAP, CART_STACK, cartLoader, NEW_COL } from "../testing/sourcemap.js";

describe("vlq", () => {
  it("decodes what it encodes, with values carried across lines", () => {
    const lines = [[[0, 0, 0, 0], [30, 0, 2, 4, 0]], [], [[5, 1, 10, 2], [9]]];
    expect(decodeMappings(encodeMappings(lines))).toEqual(lines);
  });

  it("decodes a known mapping", () => {
    expect(decodeMappings("AAAA,SAAS;;C")).toEqual([[[0, 0, 0, 0], [9, 0, 0, 9]], [], [[1]]]);
    expect(decodeMappings("AAAA,SAASC")).toEqual([[[0, 0, 0, 0], [9, 0, 0, 9, 1]]]);
  });
});

describe("source map lookup", () => {
  it("finds the original position, name, and content", () => {
    const map = parseSourceMap(CART_MAP)!;
    expect(originalPosition(map, 1, NEW_COL)).toMatchObject({ source: "../../src/cart.ts", line: 3, column: 11, name: "Error" });
    expect(originalPosition(map, 1, NEW_COL + 3)).toMatchObject({ line: 3, column: 11 });
    expect(originalPosition(map, 1, 1)).toMatchObject({ line: 1, column: 1 });
    expect(originalPosition(map, 2, 1)).toBeNull();
  });

  it("reads index maps with sections and applies sourceRoot", () => {
    const inner = { version: 3, sources: ["a.ts"], sourceRoot: "src", names: [], mappings: "AAAA,KAAE" };
    const map = parseSourceMap({ version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, sources: ["x.ts"], names: [], mappings: "AAAA" } }, { offset: { line: 2, column: 10 }, map: inner }] })!;
    expect(originalPosition(map, 3, 16)).toMatchObject({ source: "src/a.ts", line: 1, column: 3 });
    expect(originalPosition(map, 1, 1)).toMatchObject({ source: "x.ts" });
  });

  it("rejects what is not a v3 map", () => {
    expect(parseSourceMap("{")).toBeNull();
    expect(parseSourceMap({ version: 2, mappings: "" })).toBeNull();
  });
});

describe("stack parsing", () => {
  it("reads Chrome, Firefox, and Safari frames", () => {
    const stack = [
      "TypeError: x is undefined",
      "    at Object.applyCoupon (https://app.test/assets/a.js:1:200)",
      "    at async https://app.test:8080/assets/a.js:2:5",
      "    at new Cart (http://localhost:5173/src/cart.ts?t=1:10:3)",
      "applyCoupon@https://app.test/assets/a.js:1:200",
      "@https://app.test/assets/a.js:3:4",
      "https://app.test/assets/a.js:4:9",
      "    at Array.map (<anonymous>)",
    ].join("\n");
    expect(parseStack(stack).map((f) => [f.fn, f.url, f.line, f.column])).toEqual([
      ["Object.applyCoupon", "https://app.test/assets/a.js", 1, 200],
      [null, "https://app.test:8080/assets/a.js", 2, 5],
      ["new Cart", "http://localhost:5173/src/cart.ts?t=1", 10, 3],
      ["applyCoupon", "https://app.test/assets/a.js", 1, 200],
      [null, "https://app.test/assets/a.js", 3, 4],
      [null, "https://app.test/assets/a.js", 4, 9],
    ]);
  });
});

describe("names and paths", () => {
  it("finds the function around a line, past closed blocks", () => {
    const src = ["function outer() {", "  const helper = () => {", "    return 1;", "  };", "  if (x) {", "    boom();", "  }", "}"].join("\n");
    expect(enclosingName(src, 6, 5)).toBe("outer");
    expect(enclosingName(src, 3, 5)).toBe("helper");
    expect(enclosingName("const go = () => run();", 1, 18)).toBe("go");
    expect(enclosingName("class A {\n  async save(x) {\n    y();\n  }\n}", 3, 5)).toBe("save");
  });

  it("cleans source paths for display", () => {
    expect(displaySource("webpack://my-app/./src/App.tsx")).toBe("src/App.tsx");
    expect(displaySource("../../src/cart.ts?v=2")).toBe("src/cart.ts");
    expect(displaySource("../../node_modules/react-dom/cjs/x.js")).toBe("node_modules/react-dom/cjs/x.js");
    expect(displaySource("C:/code/app/src/App.tsx")).toBe("src/App.tsx");
  });
});

describe("resolveStack", () => {
  it("resolves frames, keeps the raw ones, and adds source context", async () => {
    const frames = await resolveStack(CART_STACK, "1.0.0", cartLoader);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({ source: "src/cart.ts", line: 3, fn: "applyCoupon", inApp: true });
    expect(frames[0]!.raw.fn).toBe("a");
    expect(frames[0]!.context).toEqual({ start: 1, lines: expect.arrayContaining(['    throw new Error("Coupon code is empty");']) as unknown });
    expect(frames[1]).toMatchObject({ source: "src/cart.ts", line: 7, fn: "checkout" });
    expect(frames[2]).toMatchObject({ source: null, inApp: false });
    expect(groupFrameOf(frames)).toBe("src/cart.ts:applyCoupon");
  });

  it("leaves frames raw when the loader finds nothing or fails", async () => {
    const frames = await resolveStack(CART_STACK, null, () => Promise.reject(new Error("down")));
    expect(frames.every((f) => f.source === null)).toBe(true);
    expect(groupFrameOf(frames)).toBeNull();
  });
});

describe("wire checks", () => {
  it("normalizes file keys and candidates", () => {
    expect(normalizeMapFile("~/assets/a.js")).toBe("assets/a.js");
    expect(normalizeMapFile("https://x.test/static/a.js.map")).toBe("static/a.js");
    expect(normalizeMapFile("../etc/passwd")).toBeNull();
    expect(mapFileCandidates("https://x.test/app/assets/a.js?v=1")).toEqual(["app/assets/a.js", "assets/a.js", "a.js"]);
  });

  it("checks uploads and resolve bodies", () => {
    expect(checkUpload(new URLSearchParams("release=1.2&file=/assets/a.js"))).toEqual({ release: "1.2", file: "assets/a.js" });
    expect(typeof checkUpload(new URLSearchParams("file=a.js"))).toBe("string");
    expect(checkResolve({ stack: "x", release: 5 })).toEqual({ stack: "x", release: null });
    expect(checkResolve({})).toBeNull();
  });
});
