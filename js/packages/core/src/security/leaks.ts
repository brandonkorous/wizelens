// A09 Logging and Alerting Failures: secrets that reached logs, span data, or a response. Redaction left a marker where each was.
import type { Finding } from "../analysis.js";
import { ATTR_REQUEST_BODY, ATTR_RESPONSE_BODY } from "../attributes.js";
import { MARKER_RE, type SecretKind, skipsValuePatterns } from "../redact-values.js";
import type { Attributes, Trace } from "../types.js";

export const SECRET_LABELS: Record<SecretKind, string> = {
  jwt: "JWT",
  "signed-token": "Signed token",
  "aws-key": "AWS key",
  "private-key": "Private key",
  "stripe-key": "Stripe key",
  "github-token": "GitHub token",
  "slack-token": "Slack token",
  "google-key": "Google API key",
  card: "Card number",
};

type Where = "in logs" | "in span data" | "in a response";

/** The secret kinds marked in a text, once per marker. */
export function markersIn(text: string): SecretKind[] {
  if (!text.includes("[redacted:")) return [];
  return [...text.matchAll(MARKER_RE)].map((m) => m[1] as SecretKind).filter((k) => k in SECRET_LABELS);
}

const attrMarkers = (a: Attributes, skip: ReadonlySet<string>): SecretKind[] =>
  Object.entries(a).flatMap(([k, v]) => (typeof v === "string" && !skip.has(k) && !skipsValuePatterns(k) ? markersIn(v) : []));

const BODIES = new Set([ATTR_RESPONSE_BODY, ATTR_REQUEST_BODY]);
const NONE = new Set<string>();

interface Hit {
  kind: SecretKind;
  where: Where;
  spanId: string | null;
}

function hitsOf(trace: Trace): Hit[] {
  const hits: Hit[] = [];
  const add = (kinds: SecretKind[], where: Where, spanId: string | null) => kinds.forEach((kind) => hits.push({ kind, where, spanId }));
  for (const s of trace.spans) {
    add([...attrMarkers(s.attributes, BODIES), ...(s.events ?? []).flatMap((e) => attrMarkers(e.attributes, NONE)), ...markersIn(s.statusMessage ?? "")], "in span data", s.spanId);
    const body = s.attributes[ATTR_RESPONSE_BODY];
    if (typeof body === "string") add(markersIn(body).filter((k) => k !== "jwt"), "in a response", s.spanId);
  }
  for (const l of trace.logs ?? []) add([...markersIn(l.message), ...attrMarkers(l.attributes, NONE)], "in logs", l.spanId);
  return hits;
}

/** One finding per secret kind and place, counting its markers. */
export function findSecretLeaks(trace: Trace): Finding[] {
  const out = new Map<string, Finding>();
  for (const h of hitsOf(trace)) {
    const shape = `${SECRET_LABELS[h.kind]} ${h.where}`;
    const f = out.get(shape) ?? { kind: "secret-leak", severity: h.kind === "jwt" ? "warning" : "error", title: "A secret was written where it is kept", shape, count: 0, totalMs: 0, spanIds: [] };
    const spanIds = h.spanId && !f.spanIds.includes(h.spanId) ? [...f.spanIds, h.spanId] : f.spanIds;
    out.set(shape, { ...f, count: f.count + 1, spanIds });
  }
  return [...out.values()];
}
