import type { RequestItem, Span } from "@wizeworks/lens-core";
import { fmtBytes } from "../../format";
import { DotText, toneOfStatus } from "../../ui/Badges";
import { Empty, KeyValues } from "../../ui/Panel";
import { bodyOf, numberAttr, requestHeaders, responseHeaders, statusText } from "./spanInfo";

function HeaderList({ headers }: { headers: [string, string][] }) {
  return (
    <dl className="wl-kv wl-rq-headers">
      {headers.map(([name, value]) => (
        <div key={name} style={{ display: "contents" }}>
          <dt className="wl-mono">{name}</dt>
          <dd className={`wl-mono${value === "[redacted]" ? " wl-text-warn" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const NOT_CAPTURED = "This service did not capture headers. Update its WizeLens add-on to v0.3 or later.";

/** Request line, client details, and the captured request headers. */
export function PanelHeaders({ r, server }: { r: RequestItem; server: Span | undefined }) {
  if (!server) return <Empty title="No server span">This request has no server data, so there are no headers to show.</Empty>;
  const query = server.attributes["url.query"];
  const headers = requestHeaders(server);
  return (
    <>
      <h3 className="wl-section-title">Request</h3>
      <KeyValues
        rows={[
          ["Method", r.method],
          ["Path", <span className="wl-mono">{String(server.attributes["url.path"] ?? r.path)}</span>],
          ["Query", query ? <span className="wl-mono">{String(query)}</span> : <span className="wl-muted">None</span>],
          ["Route", String(server.attributes["http.route"] ?? "–")],
          ["Body size", fmtBytes(numberAttr(server, "http.request.body.size"))],
          ["Client", r.clientAddress ?? "–"],
        ]}
      />
      <h3 className="wl-section-title">Headers ({headers.length})</h3>
      {headers.length ? <HeaderList headers={headers} /> : <p className="wl-muted wl-small">{NOT_CAPTURED}</p>}
    </>
  );
}

function Body({ server }: { server: Span }) {
  const body = bodyOf(server);
  if (!body) {
    return (
      <p className="wl-muted wl-small">
        Response body capture is off. Turn it on with <code className="wl-mono">CaptureResponseBody = true</code> (.NET) or{" "}
        <code className="wl-mono">captureResponseBody: true</code> (Node). Only text and JSON bodies are kept, up to 16 KB.
      </p>
    );
  }
  return (
    <>
      <pre className="wl-code wl-rq-body">{body.text}</pre>
      {body.truncated && <p className="wl-muted wl-small">Only the first 16 KB were captured.</p>}
    </>
  );
}

/** Status, size, response headers, and the body preview when body capture is on. */
export function PanelResponse({ r, server }: { r: RequestItem; server: Span | undefined }) {
  if (!server) return <Empty title="No server span">This request has no server data, so there is no response to show.</Empty>;
  const headers = responseHeaders(server);
  const type = server.attributes["http.response.header.content-type"];
  return (
    <>
      <h3 className="wl-section-title">Response</h3>
      <KeyValues
        rows={[
          ["Status", <DotText tone={toneOfStatus(r.status)}>{statusText(r.status, r.aborted)}</DotText>],
          ["Content type", type ? String(type) : "–"],
          ["Body size", fmtBytes(numberAttr(server, "http.response.body.size"))],
        ]}
      />
      <h3 className="wl-section-title">Headers ({headers.length})</h3>
      {headers.length ? <HeaderList headers={headers} /> : <p className="wl-muted wl-small">{NOT_CAPTURED}</p>}
      <h3 className="wl-section-title">Body</h3>
      <Body server={server} />
    </>
  );
}
