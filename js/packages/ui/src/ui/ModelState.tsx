import type { ModelMeta } from "@wizeworks/lens-core/internal";
import { fmtCount } from "../format";

/** Banners above a page: loading, a failed load, numbers based on part of the data, or stats running behind. */
export function ModelState({ model, loading, error, what }: { model: { meta: ModelMeta } | null; loading: boolean; error: string | null; what: string }) {
  const sampled = model?.meta.sampled;
  const settling = model?.meta.settling ?? 0;
  return (
    <>
      {loading && !model && <div className="wl-banner wl-banner-info">Loading {what}…</div>}
      {error && <div className="wl-banner wl-banner-error">Could not load this page: {error}</div>}
      {sampled && (
        <div className="wl-banner wl-banner-info">
          Based on the newest {fmtCount(sampled.used)} of {fmtCount(sampled.total)} traces in this range. Pick a shorter range for exact numbers.
        </div>
      )}
      {settling > 0 && (
        <div className="wl-banner wl-banner-info">
          Stats are catching up: {fmtCount(settling)} {settling === 1 ? "trace" : "traces"} left. Numbers may be low for a few minutes.
        </div>
      )}
    </>
  );
}
