# WizeLens — Tags Plan

Decided 2026-10-19. A tag is a **rule**: a name, a color, and a search. WizeLens keeps the rules in settings and
checks them each time it shows data. The data itself never holds the tag, so a tag works on old and new data alike,
outlives the telemetry it matched, and moves at once when its rule changes.

## Status (2026-10-19)

| Step | State |
|---|---|
| 1. Core: rules, built-in tags, checks, `tag:` in search, matching (TS + C#, shared vectors) | Done |
| 2. Hosts: rules API and match API on in-app (Node, .NET), hub, and cloud (Postgres, ClickHouse) | Done; tag parity with memory on SQLite, Postgres, and ClickHouse |
| 3. UI: tag chips on every list, the Tags settings section, "Tag this", `tag:` autocomplete | Done |
| 4. MCP: `list_tags`, `tag:` in `search`, matched tags on results | Done |

## Two kinds of tags

- **App tags** (today): the app sets `wizelens.tag.{key}` on a span. They live in the trace and expire with it.
- **Tag rules** (new): a search saved under a name. Any request, trace, span, or log line that matches shows the tag.

`tag:name` in a search matches both: the rule named `name`, or the app tag key `name`. `tag:key:value` matches an app tag
with that value. A pattern (`tag:check*`) matches rule names.

## A rule

| Field | Rule |
|---|---|
| `name` | 1 to 40 characters: lowercase letters, digits, `-`, `_`; starts with a letter or digit; unique in the project |
| `color` | One of `blue`, `green`, `amber`, `orange`, `red`, `violet`, `slate` |
| `query` | A search in the search language, 1 to 2000 characters. It cannot use `tag:`, so rules never depend on rules |

A project holds up to 50 rules of its own.

## Built-in tags

Shipped with WizeLens, on by default, and each one can be turned off per project. They cannot be edited or deleted.

| Tag | Matches |
|---|---|
| `stream` | Responses sent as server-sent events: `@http.response.header.content-type:text/event-stream*` |
| `probe` | Health checks from Kubernetes and load balancers, by user agent |
| `bot` | Crawlers and bots, by user agent |

## Where rules live

| Host | Rules | Edit |
|---|---|---|
| In-app (Node, .NET) | The `tags` option in code | No; the UI shows them and says where they are set |
| Hub | SQLite tables `tag_rules` and `tag_builtins`, one set for the whole hub | Yes; same-origin writes, the hub token when set |
| Cloud | Postgres tables `tag_rules` and `tag_builtins` (migration 16) | Yes; the `tag` permission (members and up), audited |

## API (every host)

| Endpoint | What |
|---|---|
| `GET api/tags?project=` | `{ tags, editable, max }`: built-ins first, then rules by name |
| `POST api/tags?project=` | Create `{ name, color, query }` (hub, cloud) |
| `PATCH api/tags/{id}?project=` | Change a rule; for a built-in (`builtin:stream`), only `enabled` |
| `DELETE api/tags/{id}?project=` | Delete a rule |
| `POST api/tags/match?project=` | `{ kind, items: [{ traceId, owner, timeMs }] }` up to 200 items → `{ matches: { "traceId owner": [names] } }` |

Matching runs each enabled rule as a search limited to the given traces, from an hour before the first row to an hour
after the last, on the host's own search engine (memory, SQLite, Postgres, or ClickHouse). Results are the same as
`api/search` with the rule's query. A trace row also wears the tags its request matches, since route and user are request
fields.

`api/search` expands `tag:` with the project's rules before it runs, and returns `unknownTags` for names that match
no rule, so a typo is not a silent empty page. The search box on the Requests, Traces, and Logs lists expands `tag:` the
same way (`searchTraceIds` and `memorySearchIds` take the host's active tags).

## Lists of groups

Error groups, endpoints, services, and users are counts over many requests, not one document. A rule shows on such a row when
every field it names describes the row: `service`, `method`, `route`, `path` for endpoints; `service` for services;
`service`, `error`, and free words (type and message) for error groups; `user` for users. A rule that names anything else (a duration, an
attribute) does not show on group rows.

## "Tag this"

The request panel, the trace page, the error group, the service page, and the Search page offer "Tag this". It opens
the rule form filled in with a search for a thing that does not expire: the endpoint, the service, the user, the error
group, or the current search. The form shows what the search finds now before it saves.
