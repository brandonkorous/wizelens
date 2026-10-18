import type { CloudOptions } from "../config.js";
import type { Mail } from "../mail/mailer.js";
import { type Cloud, createCloud } from "../server.js";

/** A cloud on a free port with an in-memory database. */
export async function startCloud(options: CloudOptions = {}): Promise<{ cloud: Cloud; url: string }> {
  const cloud = await createCloud({ database: "memory", port: 0, host: "127.0.0.1", ...options });
  return { cloud, url: await cloud.listen() };
}

/** Mail the cloud sent, and the token in the newest link to one address. */
export function mailbox() {
  const sent: Mail[] = [];
  const last = (to: string) => [...sent].reverse().find((m) => m.to === to);
  const token = (to: string) => new URL((/https?:\/\/\S+/.exec(last(to)?.text ?? "")?.[0] ?? "http://x/").replace("#/", "")).searchParams.get("token") ?? "";
  return { sent, last, token, sendMail: async (m: Mail) => void sent.push(m) };
}

/** A browser-like client: keeps every cookie, sends the page origin and the dashboard header. */
export class Client {
  readonly cookies = new Map<string, string>();

  constructor(private readonly base: string) {}

  get cookie(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async call<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
    const res = await fetch(`${this.base}/_wizelens/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-WizeLens-Client": "dashboard", Origin: this.base, Cookie: this.cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const set of res.headers.getSetCookie()) {
      const [pair = "", ...attrs] = set.split(";");
      const [k = "", v = ""] = pair.split("=");
      if (attrs.some((a) => /max-age=0/i.test(a.trim()))) this.cookies.delete(k.trim());
      else this.cookies.set(k.trim(), v);
    }
    const text = await res.text();
    return { status: res.status, body: (/^[{[]/.test(text) ? JSON.parse(text) : text) as T };
  }
}

export interface Me {
  signedIn: boolean;
  needsSetup: boolean;
  user: { id: string; email: string; emailVerified: boolean; twoFactorEnabled: boolean };
  orgs: { id: string; role: string; projects: { id: string; name: string }[] }[];
}

export const PASSWORD = "a long password 1";

/** Make the first account with the setup token, and return the owner client, org id, and first project id. */
export async function setupOwner(cloud: Cloud, url: string, email = "owner@acme.io") {
  const owner = new Client(url);
  const token = new URL(cloud.setupLink()!.replace("#/", "")).searchParams.get("token")!;
  const res = await owner.call("POST", "api/auth/sign-up/email", { email, password: PASSWORD, name: "Olive" }, { "x-wizelens-setup-token": token });
  if (res.status !== 200) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const me = (await owner.call<Me>("GET", "api/me")).body;
  return { owner, orgId: me.orgs[0]!.id, projectId: me.orgs[0]!.projects[0]!.id };
}

/** Sign up an invited person and accept the invite. Without real mail, the invite id must come with the sign-up. */
export async function joinWithInvite(url: string, inviteId: string, email: string, name = "Vic"): Promise<Client> {
  const c = new Client(url);
  const res = await c.call("POST", "api/auth/sign-up/email", { email, password: PASSWORD, name }, { "x-wizelens-invite": inviteId });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  const accept = await c.call("POST", "api/auth/organization/accept-invitation", { invitationId: inviteId });
  if (accept.status !== 200) throw new Error(`accept failed: ${accept.status} ${JSON.stringify(accept.body)}`);
  return c;
}

/** Invite someone through Better Auth and return the invite id. */
export async function invite(owner: Client, orgId: string, email: string, role: string): Promise<string> {
  const res = await owner.call<{ id: string }>("POST", "api/auth/organization/invite-member", { email, role, organizationId: orgId });
  if (res.status !== 200) throw new Error(`invite failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}
