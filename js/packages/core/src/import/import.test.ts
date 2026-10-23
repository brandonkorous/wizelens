import { describe, expect, it } from "vitest";
import { readCsv } from "./csv.js";
import { MAX_IMPORT_ROWS, parseProjectImport } from "./projects.js";

describe("readCsv", () => {
  it("reads quotes, doubled quotes, CRLF, tabs, and skips blank lines", () => {
    expect(readCsv('﻿a,"b, c","say ""hi"""\r\n\r\nd,e\n')).toEqual([["a", "b, c", 'say "hi"'], ["d", "e"]]);
    expect(readCsv("a\tb c\nd\te")).toEqual([["a", "b c"], ["d", "e"]]);
    expect(readCsv('"line\nbreak",x')).toEqual([["line\nbreak", "x"]]);
  });
});

describe("parseProjectImport", () => {
  it("takes plain names, one per line, as ingest keys named after the project", () => {
    const { rows, problems } = parseProjectImport("orders-api\nbilling-api\n\nsearch\n");
    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.name, r.kind, r.keyName])).toEqual([["orders-api", "ingest", "orders-api"], ["billing-api", "ingest", "billing-api"], ["search", "ingest", "search"]]);
  });

  it("reads a header in any order, with browser sites and key names", () => {
    const text = 'Sites,Project,Kind,Key name,Team\n"https://shop.example.com https://*.example.com",Shop web,browser,shop-pages,web\n,Orders API,,orders-prod,core';
    const { rows, problems } = parseProjectImport(text);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { row: 1, name: "Shop web", kind: "browser", keyName: "shop-pages", sites: ["https://shop.example.com", "https://*.example.com"] },
      { row: 2, name: "Orders API", kind: "ingest", keyName: "orders-prod", sites: [] },
    ]);
  });

  it("reads JSON lists of names or objects", () => {
    expect(parseProjectImport('["a", {"project": "b", "kind": "browser", "origins": ["https://b.io"]}]').rows.map((r) => [r.name, r.kind, r.sites])).toEqual([["a", "ingest", []], ["b", "browser", ["https://b.io"]]]);
    expect(parseProjectImport('{"projects": [{"name": "c", "key": "c-key"}]}').rows[0]).toMatchObject({ name: "c", keyName: "c-key" });
    expect(parseProjectImport("[oops").problems[0]!.message).toMatch(/not valid JSON/);
    expect(parseProjectImport('{"x": 1}').problems[0]!.message).toMatch(/list of projects/);
  });

  it("names every bad row: no name, a bad kind, missing or bad sites, and repeats", () => {
    const text = "name,kind,sites\n,ingest,\nA,robot,\nB,browser,\nC,browser,shop.example.com\nD,,\nd,,";
    const { rows, problems } = parseProjectImport(text);
    expect(rows.map((r) => r.name)).toEqual(["D"]);
    expect(problems.map((p) => p.row)).toEqual([1, 2, 3, 4, 6]);
    expect(problems[1]!.message).toMatch(/robot/);
    expect(problems[3]!.message).toMatch(/not a site/);
    expect(problems[4]!.message).toMatch(/already has a key named "d" on row 5/);
  });

  it("takes many keys for one project, one row per service, and refuses a key name twice", () => {
    const text = "name,kind,sites,key name\nOrders,,,orders-api\norders,,,orders-worker\nOrders,browser,https://shop.io,shop\nOrders,,,ORDERS-API";
    const { rows, problems } = parseProjectImport(text);
    expect(rows.map((r) => [r.name, r.keyName, r.kind])).toEqual([["Orders", "orders-api", "ingest"], ["orders", "orders-worker", "ingest"], ["Orders", "shop", "browser"]]);
    expect(problems).toEqual([{ row: 4, message: expect.stringMatching(/already has a key named "ORDERS-API" on row 1/) }]);
  });

  it("refuses an empty file and one past the limit", () => {
    expect(parseProjectImport("  \n").problems[0]!.message).toMatch(/empty/);
    const big = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `p${i}`).join("\n");
    expect(parseProjectImport(big).problems[0]!.message).toMatch(/up to 5000/);
  });
});

describe("parseCheckImport", () => {
  it("reads URLs, a header with options, and JSON, and checks each like a hand-made check", async () => {
    const { parseCheckImport } = await import("./checks.js");
    expect(parseCheckImport("https://a.io/health\nhttps://b.io", 100).rows.map((r) => [r.input.name, r.input.method, r.input.intervalMin])).toEqual([["a.io", "GET", 5], ["b.io", "GET", 5]]);
    const csv = parseCheckImport("Name,URL,Method,Interval,Expected status\nShop,https://shop.io,HEAD,1,200-399", 100);
    expect(csv.rows[0]!.input).toMatchObject({ name: "Shop", url: "https://shop.io", method: "HEAD", intervalMin: 1, expectStatus: "200-399" });
    expect(parseCheckImport('[{"url": "https://c.io", "name": "C"}]', 100).rows[0]!.input.name).toBe("C");
  });

  it("names bad rows, repeats, and a list past the limit", async () => {
    const { parseCheckImport } = await import("./checks.js");
    const { problems } = parseCheckImport("url,method\nnot a url,GET\nhttps://a.io,GET\nhttps://a.io,GET\nhttps://b.io,FLY", 100);
    expect(problems.map((p) => p.row)).toEqual([1, 3, 4]);
    expect(parseCheckImport("https://a.io\nhttps://b.io\nhttps://c.io", 2).problems[0]!.message).toMatch(/at most 2/);
  });
});

describe("parseInviteList", () => {
  it("takes a plain list, or rows with roles, and names bad or known emails", async () => {
    const { parseInviteList } = await import("./invites.js");
    expect(parseInviteList("a@x.io, B@x.io; c@x.io\nd@x.io").rows.map((r) => [r.email, r.role])).toEqual([["a@x.io", "member"], ["b@x.io", "member"], ["c@x.io", "member"], ["d@x.io", "member"]]);
    expect(parseInviteList("email,role\na@x.io,admin\nb@x.io,").rows.map((r) => r.role)).toEqual(["admin", "member"]);
    const bad = parseInviteList("email,role\nnope,member\na@x.io,boss\nb@x.io,viewer\nb@x.io,viewer\nk@x.io,", new Set(["k@x.io"]));
    expect(bad.problems.map((p) => p.row)).toEqual([1, 2, 4, 5]);
  });
});

describe("parseInviteList plain lists", () => {
  it("splits a mixed plain list and keeps admin@ addresses as emails", async () => {
    const { parseInviteList } = await import("./invites.js");
    expect(parseInviteList("admin@x.io\nb@x.io, c@x.io").rows.map((r) => r.email)).toEqual(["admin@x.io", "b@x.io", "c@x.io"]);
  });
});
