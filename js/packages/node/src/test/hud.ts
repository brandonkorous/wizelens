import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseOf } from "../release.js";
import type { WizeLens } from "../types.js";

export const FAKE_SCRIPT = "window.fakeHud = 1;\n//# sourceMappingURL=wizelens.iife.js.map\n";
export const FAKE_MAP = '{"version":3,"sources":[],"mappings":""}';
/** The tag from docs/HUD-PLAN.md, with nothing about the server. */
export const PLAIN_TAG = '<script src="/_wizelens/wizelens.js" data-endpoint="/_wizelens" data-hud="true" data-source="inject" defer></script>';
const release = releaseOf({});
/** The tag a test server injects: the plain tag plus the release it finds (this package's package.json in tests). */
export const TAG = PLAIN_TAG.replace(" defer>", `${release ? ` data-release="${release}"` : ""} defer>`);

let bundle: string | undefined;

/** A fake lens-browser bundle and its map in a temp folder, made once, for tests that must not need the browser build. */
export function fakeBundle(): string {
  if (bundle) return bundle;
  const file = join(mkdtempSync(join(tmpdir(), "wl-hud-")), "wizelens.iife.js");
  writeFileSync(file, FAKE_SCRIPT);
  writeFileSync(`${file}.map`, FAKE_MAP);
  return (bundle = file);
}

const servers: Server[] = [];

/** Close every server the HUD tests started. */
export const closeServers = (): Promise<unknown> => Promise.all(servers.map((s) => new Promise((r) => s.close(r))));

/** A plain node:http server with the WizeLens middleware in front of `app`. Resolves its base URL. */
export async function serveWith(wl: WizeLens, app: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer((req, res) => wl.middleware(req, res, () => app(req, res)));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export interface Page {
  status: number;
  length: string | null;
  type: string | null;
  text: string;
  header(name: string): string | null;
}

/** What a client got: status, the headers that matter here, and the body as text. */
export async function fetchPage(url: string, init?: RequestInit): Promise<Page> {
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, length: res.headers.get("content-length"), type: res.headers.get("content-type"), text, header: (name) => res.headers.get(name) };
}
