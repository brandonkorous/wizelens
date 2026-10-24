// "Tag this": searches for things that outlive their traces (an endpoint, a service, a user, an error group), and tag names for autocomplete.
import type { SearchField, SearchNode } from "../search/ast.js";
import { formatSearch } from "../search/format.js";
import type { Suggestion, SuggestRequest } from "../search/suggest.js";
import { messageShape } from "../stats/error-keys.js";
import { rawService } from "../stats/errors.js";
import { TAG_LIMITS, type TagRule } from "./types.js";

/** What "Tag this" offers: a label, a tag name to start from, and the search. */
export interface TagScope {
  label: string;
  name: string;
  query: string;
}

const field = (f: SearchField, value: string): SearchNode => ({ type: "field", field: f, cmp: "=", value: { type: "string", value } });

const and = (...items: SearchNode[]): string => formatSearch(items.length === 1 ? items[0]! : { type: "and", items });

/** A tag name from any text: lowercase, words joined by `-`, at most 40 characters. */
export function tagNameOf(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, TAG_LIMITS.name).replace(/-+$/, "");
  return slug || "tag";
}

export function endpointScope(service: string, endpoint: string): TagScope {
  const space = endpoint.indexOf(" ");
  const parts = space > 0 ? [field("method", endpoint.slice(0, space)), field("route", endpoint.slice(space + 1))] : [field("route", endpoint)];
  return { label: `This endpoint (${endpoint})`, name: tagNameOf(endpoint), query: and(field("service", rawService(service)), ...parts) };
}

export const serviceScope = (service: string): TagScope => ({ label: `This service (${service})`, name: tagNameOf(service), query: and(field("service", rawService(service))) });

export const userScope = (user: string): TagScope => ({ label: `This user (${user})`, name: tagNameOf(`user-${user}`), query: and(field("user", user)) });

/** The longest part of an error message that stays the same between errors (ids and numbers vary). */
export function stableText(message: string): string {
  const parts = messageShape(message).split(/\{id\}|#/).map((p) => p.trim());
  return parts.reduce((a, b) => (b.length > a.length ? b : a), "").slice(0, 120);
}

export function errorScope(g: { service: string; type: string; message: string }): TagScope {
  const text = stableText(g.message) || g.type;
  const query = and(field("service", rawService(g.service)), { type: "field", field: "error", cmp: "=", value: { type: "bool", value: true } }, { type: "text", value: text });
  return { label: `This error (${g.type})`, name: tagNameOf(g.type), query };
}

export const searchScope = (query: string): TagScope => ({ label: "This search", name: tagNameOf(query.replace(/[@:]/g, " ")), query });

/** Values for `tag:` in autocomplete: the project's enabled tags that start with the prefix. */
export function tagSuggestions(tags: readonly TagRule[], prefix: string): Suggestion[] {
  const p = prefix.toLowerCase();
  return tags.filter((t) => t.enabled && t.name.startsWith(p)).map((t) => ({ value: t.name, help: t.builtIn ? "Built-in tag" : t.query }));
}

/** Autocomplete for `tag:` values from the project's tags; null for any other field, which the host answers from its data. */
export const suggestTags = (r: SuggestRequest, tags: readonly TagRule[]): Suggestion[] | null => (r.field === "tag" ? tagSuggestions(tags, r.prefix).slice(0, r.limit) : null);
