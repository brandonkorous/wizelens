// Calls a framework makes to its own telemetry service (Next.js does in dev): not the app's work, so they are not recorded.
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const HOSTS = new Set(["telemetry.nextjs.org"]);

const hostOf = (url: unknown): string | null => {
  try {
    return typeof url === "string" ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};

/** True for an outgoing call to a framework's own telemetry host, by its address, its URL, or a Next.js "fetch POST <url>" name. */
export function isToolTelemetrySpan(span: Pick<ReadableSpan, "name" | "attributes">): boolean {
  const a = span.attributes;
  const named = /^fetch \w+ (\S+)/.exec(span.name)?.[1];
  const hosts = [a["server.address"], a["net.peer.name"], hostOf(a["url.full"]), hostOf(a["http.url"]), hostOf(named)];
  return hosts.some((h) => typeof h === "string" && HOSTS.has(h));
}
