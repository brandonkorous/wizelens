// Releases: the version a service ran, kept on each span as `service.version` (hosts copy it from the sender).
import type { Span } from "./types.js";

export const VERSION_ATTR = "service.version";

/** A span's version, or null. */
export const versionOf = (s: Span): string | null => {
  const v = s.attributes[VERSION_ATTR];
  return typeof v === "string" && v ? v.slice(0, 50) : null;
};

/** Spans with the sender's release on those of the sender's service that have no version. */
export function stampVersion<T extends Span>(spans: T[], sender: { service: string; release?: string }): T[] {
  const version = sender.release;
  if (!version) return spans;
  return spans.map((s) => (s.service !== sender.service || s.attributes[VERSION_ATTR] != null ? s : { ...s, attributes: { ...s.attributes, [VERSION_ATTR]: version } }));
}

/** One version of a service: when it first sent data, and its numbers in the range. */
export interface Release {
  service: string;
  version: string;
  /** First seen over all kept data. */
  firstMs: number;
  lastMs: number;
}
