import { describe, expect, it } from "vitest";
import { addContribution, type Agg, contribution, emptyAgg, mergeAgg, subtractAgg, trimAgg } from "./agg.js";
import { KIND_SPEC } from "./kinds.js";

const spec = KIND_SPEC["err.g"];
const svc = KIND_SPEC.svc;

function aggOf(items: { t: number; v: number; id: string }[], s = svc): Agg {
  const a = emptyAgg(s.hist);
  for (const x of items) addContribution(a, contribution("svc", "k", x.t, { err: x.v > 50 ? 1 : 0, sum: x.v, c: [x.v, 1], values: [x.v], top: { rank: x.t, data: x.id } }), x.id, s);
  return a;
}

const additive = (a: Agg) => ({ n: a.n, err: a.err, sum: a.sum, c: a.c, hist: a.hist });

describe("aggregates", () => {
  it("subtract undoes merge on every additive field", () => {
    const a = aggOf([{ t: 10, v: 12, id: "a" }, { t: 20, v: 70, id: "b" }]);
    const b = aggOf([{ t: 15, v: 3, id: "c" }, { t: 30, v: 99, id: "d" }, { t: 31, v: 12, id: "e" }]);
    expect(additive(subtractAgg(mergeAgg(a, b, svc), b))).toEqual(additive(a));
    expect(additive(subtractAgg(mergeAgg(b, a, svc), a))).toEqual(additive(b));
  });

  it("merges display fields: first, last, top by rank, newest ids", () => {
    const a = aggOf([{ t: 10, v: 1, id: "a" }, { t: 40, v: 1, id: "b" }], spec);
    const b = aggOf([{ t: 5, v: 1, id: "c" }, { t: 30, v: 1, id: "d" }], spec);
    const m = mergeAgg(a, b, spec);
    expect(m).toMatchObject({ n: 4, firstMs: 5, lastMs: 40, top: "b", topRank: 40 });
    expect(m.ids).toEqual(["b", "a", "d", "c"]);
    expect(mergeAgg(b, a, spec).ids).toEqual(["b", "a", "d", "c"]);
  });

  it("caps ids and keeps the newest", () => {
    const a = emptyAgg();
    for (let i = 0; i < 80; i++) addContribution(a, contribution("err.g", "k", i), `t${i}`, spec);
    expect(a.ids).toHaveLength(50);
    expect(a.ids[0]).toBe("t79");
  });

  it("trims to what a need asked for", () => {
    const a = aggOf([{ t: 10, v: 12, id: "a" }]);
    expect(trimAgg(a, {})).toMatchObject({ hist: null, top: null, topRank: 0, ids: [], firstMs: 10, lastMs: 10 });
    expect(trimAgg(a, { hist: true, top: true, times: false })).toMatchObject({ top: "a", topRank: 10, firstMs: 0, lastMs: 0 });
    expect(trimAgg(emptyAgg(), {})).toMatchObject({ firstMs: 0, lastMs: 0 });
  });
});
