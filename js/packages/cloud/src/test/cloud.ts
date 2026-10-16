import type { CloudOptions } from "../config.js";
import { type Cloud, createCloud } from "../server.js";

/** A cloud on a free port with an in-memory database. */
export async function startCloud(options: CloudOptions = {}): Promise<{ cloud: Cloud; url: string }> {
  const cloud = await createCloud({ database: "memory", port: 0, host: "127.0.0.1", ...options });
  return { cloud, url: await cloud.listen() };
}

/** A browser-like client: keeps the session cookie and sends the dashboard header. */
export class Client {
  cookie = "";

  constructor(private readonly base: string) {}

  async call<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
    const res = await fetch(`${this.base}/_wizelens/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-WizeLens-Client": "dashboard", Cookie: this.cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
  }
}

export interface Me {
  user: { id: string };
  orgs: { id: string; role: string; projects: { id: string; name: string }[] }[];
}

/** Run first-time setup and return the owner client, org id, and first project id. */
export async function setupOwner(url: string) {
  const owner = new Client(url);
  await owner.call("POST", "api/auth/setup", { email: "owner@acme.io", password: "a long password", name: "Olive", orgName: "Acme" });
  const me = (await owner.call<Me>("GET", "api/auth/state")).body;
  return { owner, orgId: me.orgs[0]!.id, projectId: me.orgs[0]!.projects[0]!.id };
}
