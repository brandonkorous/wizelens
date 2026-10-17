// Helpers for scale tests: sum a kind's contributions over whole trace sets. Test-only: excluded from the build.
import { addContribution, type Agg, emptyAgg } from "../scale/agg.js";
import { type FactOptions, traceFacts } from "../scale/facts.js";
import { KIND_SPEC, type RollupKind } from "../scale/kinds.js";
import type { Trace } from "../types.js";

/** Every contribution of one kind, summed per key over all the traces, with no window. */
export function sumKind(traces: readonly Trace[], kind: RollupKind, o: Partial<FactOptions> = {}): Map<string, Agg> {
  const spec = KIND_SPEC[kind];
  const out = new Map<string, Agg>();
  for (const t of traces) {
    for (const c of traceFacts(t, o).contributions) {
      if (c.kind !== kind) continue;
      const a = out.get(c.key) ?? emptyAgg(spec.hist);
      addContribution(a, c, t.traceId, spec);
      out.set(c.key, a);
    }
  }
  return out;
}

/** The one aggregate of a kind keyed "". */
export const totalOf = (traces: readonly Trace[], kind: RollupKind, o: Partial<FactOptions> = {}): Agg => sumKind(traces, kind, o).get("") ?? emptyAgg();

/** Relative difference, for percentile checks. */
export const relErr = (a: number, b: number): number => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));
