import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
let url: string;
let owner: Client;
let orgId: string;

beforeEach(async () => {
  ({ cloud, url } = await startCloud());
  ({ owner, orgId } = await setupOwner(cloud, url));
});

afterEach(async () => {
  await cloud?.close();
});

const preview = (id: string) => new Client(url).call<Record<string, unknown>>("GET", `api/invites/${id}`);

describe("invite preview", () => {
  it("names the organization, the inviter, and the email while the invite is open", async () => {
    const id = await invite(owner, orgId, "vic@acme.io", "member");
    const res = await preview(id);
    expect([res.status, res.body.inviter, res.body.email, res.body.role]).toEqual([200, "Olive", "vic@acme.io", "member"]);
  });

  it("says who to ask when the invite was used or expired", async () => {
    const used = await invite(owner, orgId, "vic@acme.io", "member");
    await joinWithInvite(url, used, "vic@acme.io");
    const a = await preview(used);
    expect([a.status, JSON.stringify(a.body)]).toEqual([410, expect.stringMatching(/was already used\. Ask Olive for a new one\./)]);
    const old = await invite(owner, orgId, "uma@acme.io", "viewer");
    await cloud.app.db.query("UPDATE invites SET expires_at = now() - interval '1 day' WHERE id = $1", [old]);
    expect(JSON.stringify((await preview(old)).body)).toMatch(/expired \(invites last 7 days\)\. Ask Olive/);
  });

  it("is a 404 for an id that never was an invite", async () => {
    expect((await preview("not-an-invite")).status).toBe(404);
  });
});
