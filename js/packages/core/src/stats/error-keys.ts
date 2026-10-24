// Error group keys: exceptions by message shape; HTTP status failures by status and endpoint, with an alias to their old shared key.
import { issueId, type IssueState, type IssueStates } from "../issues.js";

/** Message with ids and numbers replaced, so the same error with other values groups together. */
export function messageShape(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{id}")
    .replace(/\b[0-9a-f]{16,}\b/gi, "{id}")
    .replace(/\d+/g, "#")
    .trim();
}

/** Service, type, and message shape; a browser error's group frame splits errors with the same message thrown in other places. */
export const errorKeyOf = (service: string, type: string, message: string, frame: string | null): string =>
  `${service}|${type}|${messageShape(message)}${frame ? `|${frame}` : ""}`;

/** An HTTP status failure with no exception: one group per status and endpoint, so 503s on many routes do not merge. */
export const httpErrorKeyOf = (service: string, status: number, endpoint: string): string => `${service}|HttpError|${status}|${endpoint}`;

/** The status in an "HTTP 503" status message, or null. */
export function httpStatusOf(message: string | null | undefined): number | null {
  const m = /^HTTP (\d{3})\b/.exec(message ?? "");
  return m ? Number(m[1]) : null;
}

/** The key one HTTP status group had before it was split by status and endpoint ("svc|HttpError|HTTP #"), or null. */
export function legacyErrorKey(key: string): string | null {
  const parts = key.split("|");
  return parts.length >= 4 && parts[1] === "HttpError" && /^\d{3}$/.test(parts[2]!) ? `${parts[0]}|HttpError|HTTP #` : null;
}

/** An error group's state: its own, else the state set on the old shared key it was split from. */
export function errorIssueState(issues: IssueStates, key: string): IssueState | undefined {
  const own = issues[issueId("error", key)];
  if (own) return own;
  const legacy = legacyErrorKey(key);
  return legacy ? issues[issueId("error", legacy)] : undefined;
}
