// A list of people to invite at once: one email per row, with an optional role (the fallback, member by default, when left out).
import { MAX_BULK } from "../bulk.js";
import { isPlainList } from "./plain.js";
import type { ImportProblem } from "./projects.js";
import { readRows } from "./rows.js";

export type InviteRole = "viewer" | "member" | "admin" | "owner";

export interface InviteRow {
  row: number;
  email: string;
  role: InviteRole;
}

const ROLES: readonly string[] = ["viewer", "member", "admin", "owner"];
const SHAPE = { headers: { email: "email", "e-mail": "email", mail: "email", address: "email", role: "role" }, order: ["email", "role"] };
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** People from a file or pasted text. `known` holds emails already in the organization or invited; they are named as problems. */
export function parseInviteList(text: string, known: ReadonlySet<string> = new Set(), fallback: InviteRole = "member"): { rows: InviteRow[]; problems: ImportProblem[] } {
  const source = isPlainList(text) ? text.split(/[\s,;]+/).filter(Boolean).join("\n") : text;
  const raw = readRows(source, SHAPE);
  if (typeof raw === "string") return { rows: [], problems: [{ row: 0, message: raw }] };
  const rows: InviteRow[] = [];
  const problems: ImportProblem[] = [];
  if (raw.length > MAX_BULK) problems.push({ row: 0, message: `Invite up to ${MAX_BULK} people at a time; this list has ${raw.length}.` });
  const seen = new Set<string>();
  for (const r of raw.slice(0, MAX_BULK)) {
    const email = String(r.email ?? "").trim().toLowerCase();
    const role = String(r.role ?? "").trim().toLowerCase() || fallback;
    const problem = !EMAIL.test(email) ? `"${email}" is not an email address.` : !ROLES.includes(role) ? `Role "${role}" is not viewer, member, admin, or owner.` : seen.has(email) ? `${email} is listed twice.` : known.has(email) ? `${email} is already a member or invited.` : null;
    if (problem) problems.push({ row: r.row, message: problem });
    else {
      seen.add(email);
      rows.push({ row: r.row, email, role: role as InviteRole });
    }
  }
  return { rows, problems };
}
