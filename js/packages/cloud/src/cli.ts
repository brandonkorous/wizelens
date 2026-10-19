#!/usr/bin/env node
import { optionsFromArgs, USAGE } from "./cli-args.js";
import { type Cloud, CLOUD_VERSION, createCloud } from "./server.js";
import { copyMain } from "./copy-cli.js";
import { planMain, stripeSetupMain } from "./billing/cli.js";

function notes(cloud: Cloud): string[] {
  const { app } = cloud;
  const out: string[] = [];
  if (app.db.kind === "pglite") out.push("  Note: PGlite is for trials and tests. Use Postgres for real teams.");
  if (!app.mailer.live) out.push("  Note: no --resend-api-key or --smtp-url, so emails are written to this log and email addresses are not confirmed.");
  if (app.mailer.via === "resend" && !app.config.resendWebhookSecret) out.push("  Note: no --resend-webhook-secret, so bounced addresses keep getting mail.");
  if (app.db.kind === "postgres" && !app.config.publicUrl?.startsWith("https://")) out.push("  Note: set --public-url to an https:// address, so sign-in cookies are Secure.");
  const setup = cloud.setupLink();
  if (setup) out.push("", "  No account yet. Open this link to make the first one (it works once):", `  ${setup}`);
  return out;
}

async function main(): Promise<void> {
  if (process.argv[2] === "copy-telemetry") return copyMain(process.argv.slice(3));
  if (process.argv[2] === "plan") return planMain(process.argv.slice(3), process.env);
  if (process.argv[2] === "stripe-setup") return stripeSetupMain(process.argv.slice(3), process.env);
  const options = optionsFromArgs(process.argv.slice(2), process.env);
  if (options === "help") return void process.stdout.write(USAGE);
  const cloud = await createCloud(options);
  const url = await cloud.listen();
  const db = cloud.app.db.kind === "postgres" ? "Postgres" : `PGlite (${cloud.app.config.database})`;
  console.info(
    [
      `WizeLens Cloud ${CLOUD_VERSION}`,
      `  Dashboard   ${url}/_wizelens/`,
      `  Add-ons     WIZELENS_HUB=${url}  WIZELENS_HUB_TOKEN=<ingest key>`,
      `  OTLP/HTTP   OTEL_EXPORTER_OTLP_ENDPOINT=${url}  (header Authorization=Bearer <ingest key>)`,
      `  Database    ${db}`,
      `  Telemetry   ${cloud.app.telemetry.kind === "clickhouse" ? "ClickHouse" : "the database above"}`,
      `  Mail        ${{ resend: "Resend", smtp: "SMTP", test: "test sender", log: "log only" }[cloud.app.mailer.via]}`,
      `  Billing     ${cloud.app.billing.on ? "Stripe (plans and limits on)" : "off (every organization is unlimited)"}`,
      ...notes(cloud),
    ].join("\n"),
  );
  const stop = () => void cloud.close().then(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err: unknown) => {
  console.error(`[wizelens-cloud] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
