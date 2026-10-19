import type { AttributeValue, Attributes } from "@wizeworks/lens-core";

// Older semantic-convention names (what the Java, Python, and Go agents still send by default), mapped to the current ones.
export const ALIASES: Record<string, string> = {
  "http.method": "http.request.method",
  "http.status_code": "http.response.status_code",
  "http.url": "url.full",
  "http.target": "url.path",
  "http.scheme": "url.scheme",
  "http.user_agent": "user_agent.original",
  "http.client_ip": "client.address",
  "http.flavor": "network.protocol.version",
  "http.request_content_length": "http.request.body.size",
  "http.response_content_length": "http.response.body.size",
  "db.statement": "db.query.text",
  "db.system": "db.system.name",
  "db.name": "db.namespace",
  "db.operation": "db.operation.name",
  "db.sql.table": "db.collection.name",
  "db.mongodb.collection": "db.collection.name",
  "db.cassandra.table": "db.collection.name",
  "db.cosmosdb.container": "db.collection.name",
  "net.peer.name": "server.address",
  "net.peer.port": "server.port",
  "net.host.name": "server.address",
  "net.host.port": "server.port",
  "net.sock.peer.addr": "network.peer.address",
  "net.sock.peer.port": "network.peer.port",
  "messaging.operation": "messaging.operation.type",
  "messaging.destination": "messaging.destination.name",
  "code.function": "code.function.name",
  "code.filepath": "code.file.path",
  "code.lineno": "code.line.number",
  "deployment.environment": "deployment.environment.name",
};

/** Copy older names to the current ones when the current one is missing. First alias wins. */
export function applyAliases(out: Attributes): Attributes {
  for (const [old, current] of Object.entries(ALIASES)) {
    if (out[old] !== undefined && out[current] === undefined) out[current] = out[old]!;
  }
  return out;
}

const HEADER_RE = /^(http\.(?:request|response)\.header\.)(.+)$/;

/** True for a captured header attribute (`http.request.header.*`, `http.response.header.*`). */
export const isHeaderKey = (key: string): boolean => HEADER_RE.test(key);

/** Header names as the add-ons send them: lower case with dashes (Python sends `content_type`). */
export function headerKey(key: string): string {
  const m = HEADER_RE.exec(key)!;
  return m[1] + m[2]!.toLowerCase().replace(/_/g, "-");
}

/** The agents send each header as a list of values; the dashboard shows them joined with ", ". */
export function headerValue<V extends { arrayValue?: { values?: V[] } }>(v: V | undefined, one: (x: V | undefined) => AttributeValue): AttributeValue {
  if (!v?.arrayValue) return one(v);
  return (v.arrayValue.values ?? []).map((x) => String(one(x) ?? "")).join(", ");
}

/** `http.target` holds the path and the query: split them into `url.path` and `url.query`. */
export function splitTarget(a: Attributes): void {
  const path = a["url.path"];
  if (typeof path !== "string") return;
  const q = path.indexOf("?");
  if (q < 0) return;
  a["url.path"] = path.slice(0, q);
  if (a["url.query"] === undefined) a["url.query"] = path.slice(q + 1);
}
