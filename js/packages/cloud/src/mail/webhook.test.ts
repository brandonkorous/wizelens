import { afterEach, expect, it } from "vitest";
import { unsuppress } from "../repo/suppressions.js";
import type { Cloud } from "../server.js";
import { mailbox, startCloud } from "../test/cloud.js";
import { signSvix } from "../test/svix.js";
import { alertMail, resetPasswordMail } from "./templates.js";

const SECRET = `whsec_${Buffer.from("a webhook secret for tests").toString("base64")}`;
let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

async function start() {
  const box = mailbox();
  let url: string;
  ({ cloud, url } = await startCloud({ sendMail: box.sendMail, resendWebhookSecret: SECRET }));
  const post = (event: unknown, sign = true) => {
    const body = JSON.stringify(event);
    const headers = sign ? signSvix(SECRET, body, Date.now()) : {};
    return fetch(`${url}/_wizelens/api/mail/resend`, { method: "POST", headers, body });
  };
  return { box, post };
}

const bounce = (to: string, type: string) => ({ type: "email.bounced", data: { to: [to], bounce: { type, subType: "General", message: "Mailbox does not exist." } } });
const settle = () => new Promise((r) => setTimeout(r, 100));
const notice = { ruleId: "r1", rule: "Errors", project: "shop", state: "fired", message: "Error rate is 12 (above 10)", value: 12, threshold: 10, timeMs: 0, url: "https://x" } as const;
const alert = (to: string) => alertMail(to, notice);

it("puts hard bounces on the list, so no mail goes there again", async () => {
  const { box, post } = await start();
  expect((await post(bounce("Gone@Acme.io", "Permanent"))).status).toBe(204);
  cloud.app.mailer.send(alert("gone@acme.io"));
  cloud.app.mailer.send(resetPasswordMail("gone@acme.io", "https://x"));
  await settle();
  expect(box.sent).toHaveLength(0);
  const rows = await cloud.app.db.query("SELECT email, reason, detail FROM mail_suppressions");
  expect(rows).toEqual([{ email: "gone@acme.io", reason: "bounce", detail: "General: Mailbox does not exist." }]);
});

it("ignores temporary bounces and other events", async () => {
  const { box, post } = await start();
  expect((await post(bounce("busy@acme.io", "Temporary"))).status).toBe(204);
  expect((await post({ type: "email.delivered", data: { to: ["busy@acme.io"] } })).status).toBe(204);
  cloud.app.mailer.send(alert("busy@acme.io"));
  await settle();
  expect(box.sent).toHaveLength(1);
});

it("after a spam complaint, sends only mail the person asked for, until they prove the address", async () => {
  const { box, post } = await start();
  await post({ type: "email.complained", data: { to: ["ann@acme.io"] } });
  cloud.app.mailer.send(alert("ann@acme.io"));
  cloud.app.mailer.send(resetPasswordMail("ann@acme.io", "https://x"));
  await settle();
  expect(box.sent.map((m) => m.kind)).toEqual(["account"]);
  await unsuppress(cloud.app.db, "ann@acme.io");
  cloud.app.mailer.send(alert("ann@acme.io"));
  await settle();
  expect(box.sent).toHaveLength(2);
});

it("keeps a bounce when a complaint comes later", async () => {
  const { post } = await start();
  await post(bounce("x@acme.io", "Permanent"));
  await post({ type: "email.complained", data: { to: ["x@acme.io"] } });
  expect(await cloud.app.db.query("SELECT reason FROM mail_suppressions")).toEqual([{ reason: "bounce" }]);
});

it("refuses an unsigned call, and answers 404 when no secret is set", async () => {
  const { post } = await start();
  expect((await post(bounce("x@acme.io", "Permanent"), false)).status).toBe(401);
  expect(await cloud.app.db.query("SELECT 1 FROM mail_suppressions")).toHaveLength(0);
  await cloud.close();
  let url: string;
  ({ cloud, url } = await startCloud());
  expect((await fetch(`${url}/_wizelens/api/mail/resend`, { method: "POST", body: "{}" })).status).toBe(404);
});
