import { expect, it } from "vitest";
import { optionsFromArgs } from "../cli-args.js";
import { resolveConfig } from "../config.js";
import { createMailer } from "./mailer.js";

const db = { query: async () => [] };
const PUBLIC = "https://app.wizelens.com";

it("reads the Resend settings from flags and the environment", () => {
  const env = { WIZELENS_CLOUD_RESEND_API_KEY: "re_env", WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET: "whsec_env" };
  expect(optionsFromArgs([], env)).toMatchObject({ resendApiKey: "re_env", resendWebhookSecret: "whsec_env" });
  expect(optionsFromArgs(["--resend-api-key", "re_flag"], env)).toMatchObject({ resendApiKey: "re_flag" });
});

it("checks the Resend settings", () => {
  expect(() => resolveConfig({ resendApiKey: "re_x" })).toThrow("--public-url");
  expect(() => resolveConfig({ resendApiKey: "key", publicUrl: PUBLIC })).toThrow("starts with re_");
  expect(() => resolveConfig({ resendApiKey: "re_x", smtpUrl: "smtp://h", publicUrl: PUBLIC })).toThrow("not both");
  expect(() => resolveConfig({ resendWebhookSecret: "secret" })).toThrow("whsec_");
});

it("sends through Resend when a key is set, else SMTP, else the log", async () => {
  expect((await createMailer(resolveConfig({ resendApiKey: "re_x", publicUrl: PUBLIC }), db)).via).toBe("resend");
  expect((await createMailer(resolveConfig({}), db)).via).toBe("log");
  expect((await createMailer(resolveConfig({}), db)).live).toBe(false);
});
