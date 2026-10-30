import { ATTR_BROWSER_REMOTE, entryServerSpan, type Trace } from "@wizeworks/lens-core/internal";
import { useHost } from "../../data/host";

/** The WizeLens a browser call says answered it, when this trace has no server part: an API on another origin. */
export function remoteElsewhere(trace: Pick<Trace, "spans">): string | null {
  if (entryServerSpan(trace.spans)) return null;
  const remote = trace.spans.map((s) => s.attributes[ATTR_BROWSER_REMOTE]).find((r): r is string => typeof r === "string" && /^https?:\/\//.test(r));
  return remote?.replace(/\/+$/, "") ?? null;
}

/** Says where the server part of a browser call is, and how to see it here. In-app dashboards only: the cloud gets every service. */
export function ServerElsewhere({ trace }: { trace: Trace }) {
  const cloud = useHost().has("accounts");
  const remote = remoteElsewhere(trace);
  if (cloud || !remote) return null;
  return (
    <div className="wl-banner wl-banner-info" role="note">
      <p>
        The server part of this call is in another app's WizeLens: <a href={`${remote}/#/traces/${trace.traceId}`} target="_blank" rel="noreferrer">open it at {remote}</a>.
        To see the whole call here, add <code>{new URL(remote).origin}</code> to <code>TrustedRemotes</code> (.NET) or <code>trustedRemotes</code> (Node) in this app, or send both apps to one hub.
      </p>
    </div>
  );
}
