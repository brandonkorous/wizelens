// The read-only ClickHouse user for scoped reads: row policies hold each of its reads to the one organization it names.
import { createHmac } from "node:crypto";
import { type ChClient, chClient } from "./http.js";
import { ORG_TABLES } from "./schema.js";

/** The reader of one database, and the writer whose rows it reads. */
export interface Reader {
  url: string;
  name: string;
  password: string;
  writer: string;
}

/** Tables without an organization column: the reader gets none of them. */
const UNSCOPED = ["trace_updates", "ch_meta", "project_retention"];

const ident = (name: string) => `\`${name.replace(/[`\\]/g, (c) => `\\${c}`)}\``;
const literal = (text: string) => `'${text.replace(/['\\]/g, (c) => `\\${c}`)}'`;

/** The writer's URL with user `<writer>_reader` and an HMAC of the writer's password, so every pod derives the same reader. */
export function readerOf(writerUrl: string): Reader {
  const u = new URL(writerUrl);
  const writer = decodeURIComponent(u.username || "default");
  const password = createHmac("sha256", decodeURIComponent(u.password)).update("wizelens-reader").digest("hex");
  const name = `${writer}_reader`;
  u.username = encodeURIComponent(name);
  u.password = password;
  return { url: u.toString(), name, password, writer };
}

/** Make or update the reader, its grants, and the row policies. The writer needs access management. */
export async function ensureReader(ch: ChClient, r: Reader): Promise<void> {
  const db = ident(ch.database);
  const [user, writer] = [ident(r.name), ident(r.writer)];
  await ch.command(`CREATE USER IF NOT EXISTS ${user} IDENTIFIED WITH sha256_password BY ${literal(r.password)}`);
  await ch.command(`ALTER USER ${user} IDENTIFIED WITH sha256_password BY ${literal(r.password)}`);
  await ch.command(`GRANT SELECT ON ${db}.* TO ${user}`);
  for (const t of UNSCOPED) await ch.command(`REVOKE SELECT ON ${db}.${t} FROM ${user}`);
  for (const t of ORG_TABLES) {
    // A table with policies shows nothing to a user no policy names, so the writer gets one that passes every row.
    await ch.command(`CREATE ROW POLICY OR REPLACE wl_org ON ${db}.${t} USING org_id = getSetting('SQL_wl_org') TO ${user}`);
    await ch.command(`CREATE ROW POLICY OR REPLACE wl_writer ON ${db}.${t} USING 1 TO ${writer}`);
  }
}

/** A client that reads as the reader for one organization. A read without the setting fails rather than widen. */
export const readerClient = (r: Reader, org: string): ChClient => chClient({ url: r.url, settings: { SQL_wl_org: org } });
