// Tags on rows that count many requests (endpoints, services, error groups): a rule shows when every field it names describes the row.
import type { SearchField, SearchNode } from "../search/ast.js";
import { compileSearch, type SearchDoc } from "../search/match.js";
import { displayService, messageShape, rawService } from "../stats/errors.js";
import type { ActiveTag } from "./types.js";

export type GroupKind = "endpoints" | "services" | "errors";

/** What a group row can answer: these fields, and free words only for error groups (their type and message). */
const GROUP_FIELDS: Record<GroupKind, { fields: ReadonlySet<SearchField>; text: boolean }> = {
  endpoints: { fields: new Set(["service", "method", "route", "path"]), text: false },
  services: { fields: new Set(["service"]), text: false },
  errors: { fields: new Set(["service", "error"]), text: true },
};

/** True when every leaf of the tree is something a row of `kind` answers. */
function fitsGroup(n: SearchNode, kind: GroupKind): boolean {
  if (n.type === "and" || n.type === "or") return n.items.every((i) => fitsGroup(i, kind));
  if (n.type === "not") return fitsGroup(n.item, kind);
  if (n.type === "text") return GROUP_FIELDS[kind].text;
  return n.type === "field" && GROUP_FIELDS[kind].fields.has(n.field);
}

const services = (service: string): string[] => [...new Set([service, rawService(service), displayService(service)])];

/** An endpoint row: "METHOD route" in a service. A route-less endpoint holds the path, so path reads it too. */
export function endpointDoc(service: string, endpoint: string): SearchDoc {
  const space = endpoint.indexOf(" ");
  const [method, route] = space > 0 ? [endpoint.slice(0, space), endpoint.slice(space + 1)] : [null, endpoint];
  return { kind: "requests", text: [], fields: { service: services(service), method, route, path: route }, attrs: [] };
}

export const serviceDoc = (service: string): SearchDoc => ({ kind: "requests", text: [], fields: { service: services(service) }, attrs: [] });

/** An error group: its service, its type, and its message; free words read the type and message. */
export function errorGroupDoc(g: { service: string; type: string; message: string }): SearchDoc {
  const text = [g.type, g.message, messageShape(g.message)].map((s) => s.toLowerCase());
  return { kind: "requests", text, fields: { service: services(g.service), error: true, outcome: "error" }, attrs: [] };
}

/** The tags of one group row, in the rules' order. */
export function groupTags(tags: readonly ActiveTag[], kind: GroupKind, doc: SearchDoc): string[] {
  return tags.filter((t) => fitsGroup(t.node, kind) && compileSearch(t.node)(doc)).map((t) => t.name);
}
