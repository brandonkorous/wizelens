import { afterEach, expect, it } from "vitest";
import { deviceOf } from "../auth/security-notices.js";
import type { Cloud } from "../server.js";
import { Client, mailbox, PASSWORD, startCloud } from "../test/cloud.js";
import { confirmedOwner, subjects, until } from "../test/notify.js";
import { totpCode } from "../test/totp.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_WIN_NEXT = CHROME_WIN.replace("141.0.0.0", "142.0.0.0");

async function start() {
  const box = mailbox();
  let url: string;
  ({ cloud, url } = await startCloud({ jobs: false, sendMail: box.sendMail }));
  return { box, url, ...(await confirmedOwner(cloud, url, box)) };
}

it("names a device by browser and system, without versions", () => {
  expect(deviceOf(CHROME_WIN)).toBe("Chrome on Windows");
  expect(deviceOf(CHROME_WIN_NEXT)).toBe(deviceOf(CHROME_WIN));
  expect(deviceOf(undefined)).toBe("an unknown device");
});

it("tells the person about a sign-in on a new device, once, and not about the first one", async () => {
  const { box, url } = await start();
  const signIn = (ua: string) => new Client(url).call("POST", "api/auth/sign-in/email", { email: "owner@acme.io", password: PASSWORD }, { "User-Agent": ua });
  expect((await signIn(CHROME_WIN)).status).toBe(200);
  await until(() => subjects(box, "owner@acme.io").includes("New sign-in to your WizeLens account"));
  await signIn(CHROME_WIN_NEXT);
  await new Promise((r) => setTimeout(r, 100));
  expect(subjects(box, "owner@acme.io").filter((s) => s.startsWith("New sign-in"))).toHaveLength(1);
  expect(box.last("owner@acme.io")!.text).toContain("Chrome on Windows");
});

it("tells the person when the password changes, and when two-step sign-in goes on and off", async () => {
  const { box, owner } = await start();
  expect((await owner.call("POST", "api/auth/change-password", { currentPassword: PASSWORD, newPassword: "the next long password" })).status).toBe(200);
  await until(() => subjects(box, "owner@acme.io").includes("Your WizeLens password was changed"));
  const on = await owner.call<{ totpURI: string }>("POST", "api/auth/two-factor/enable", { password: "the next long password" });
  expect((await owner.call("POST", "api/auth/two-factor/verify-totp", { code: totpCode(on.body.totpURI) })).status).toBe(200);
  await until(() => subjects(box, "owner@acme.io").includes("Two-step sign-in is on for WizeLens"));
  expect((await owner.call("POST", "api/auth/two-factor/generate-backup-codes", { password: "the next long password" })).status).toBe(200);
  await until(() => subjects(box, "owner@acme.io").includes("New WizeLens backup codes"));
  expect((await owner.call("POST", "api/auth/two-factor/disable", { password: "the next long password" })).status).toBe(200);
  await until(() => subjects(box, "owner@acme.io").includes("Two-step sign-in is off for WizeLens"));
  expect(box.sent.filter((m) => m.kind === "security").every((m) => !m.headers)).toBe(true);
});

it("tells the old address when the email changes", async () => {
  const { box, owner } = await start();
  expect((await owner.call("POST", "api/auth/change-email", { newEmail: "olive@new.io", callbackURL: "/" })).status).toBe(200);
  const open = async (to: string) => {
    await until(() => !!box.token(to));
    return owner.call("GET", `api/auth/verify-email?token=${box.token(to)}`);
  };
  expect((await open("owner@acme.io")).status).toBe(200);
  expect((await open("olive@new.io")).status).toBe(200);
  await until(() => subjects(box, "owner@acme.io").includes("Your WizeLens email was changed"));
  expect(box.last("owner@acme.io")!.text).toContain("olive@new.io");
});
