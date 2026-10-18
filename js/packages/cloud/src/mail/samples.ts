import type { Headline } from "@wizeworks/lens-core";
import type { DigestData } from "../notify/digest-data.js";
import type { EmailContent } from "./content.js";
import * as emails from "./emails.js";
import { digest } from "./emails-digest.js";
import { projectBack, projectQuiet } from "./emails-health.js";
import * as security from "./emails-security.js";
import { orgDeleted, roleChanged, teamChanges } from "./emails-team.js";

// Sample data for every email, for the preview command and the template tests.
const APP = "https://app.wizelens.com/_wizelens";
const LINK = `${APP}/#/verify-email?token=sample-token`;
const STOP = `${APP}/api/mail/unsubscribe?token=sample`;
const AT = Date.UTC(2026, 9, 18, 14, 30);
const LINKS = { account: `${APP}/#/account`, forgot: `${APP}/#/forgot-password` };

const notice = (state: "fired" | "resolved") => ({
  rule: "Checkout errors",
  project: "shop",
  state,
  message: state === "fired" ? "Error rate is 7.4% (above 5)" : "Error rate is 1.2% (no longer above 5)",
  value: state === "fired" ? 7.4 : 1.2,
  threshold: 5,
  timeMs: AT,
  url: `${APP}/#/alerts?project=p1`,
});

const h = (value: number, previous: number): Headline => ({ value, previous, change: ((value - previous) / previous) * 100, series: [] });

const WEEK: DigestData = {
  empty: false,
  requests: h(48_210, 41_900),
  errorRate: h(1.8, 1.1),
  avgMs: h(132, 140),
  sqlQueries: h(310_442, 306_100),
  p95Ms: 412,
  errors: [
    { type: "TimeoutError", message: "payments-api did not answer in 5000 ms", count: 214 },
    { type: "TypeError", message: "Cannot read properties of null (reading 'total')", count: 37 },
  ],
  slowest: [
    { endpoint: "POST /checkout", p95Ms: 1840, count: 3120 },
    { endpoint: "GET /orders/:id", p95Ms: 620, count: 9811 },
  ],
  insights: [{ title: "N+1 query: SELECT * FROM order_items WHERE order_id = ?", occurrences: 9811 }],
  alertsFired: 1,
};

export const SAMPLES: Record<string, EmailContent> = {
  "verify-email": emails.verifyEmail(LINK),
  "reset-password": emails.resetPassword(LINK),
  "change-email": emails.changeEmail("new@acme.io", LINK),
  "delete-account": emails.deleteAccount(LINK),
  invite: emails.invite("Olive", "Acme", "member", LINK),
  "alert-fired": emails.alert(notice("fired")),
  "alert-resolved": emails.alert(notice("resolved")),
  "security-password": security.passwordChanged(LINKS, AT),
  "security-email": security.emailChanged(LINKS, "olive@new.io", AT),
  "security-2fa-off": security.twoFactorChanged(LINKS, false, AT),
  "security-passkey": security.passkeyChanged(LINKS, true, "MacBook Touch ID", AT),
  "security-backup-codes": security.backupCodesMade(LINKS, AT),
  "security-new-sign-in": security.newSignIn(LINKS, "Chrome on Windows", "203.0.113.7", AT),
  "team-changes": teamChanges("Acme", [{ text: "Vic (vic@acme.io) made an ingest key for shop.", timeMs: AT }, { text: "Vic (vic@acme.io) invited ann@acme.io as member.", timeMs: AT + 60_000 }], `${APP}/#/team`, STOP),
  "team-role": roleChanged("Acme", "admin", `${APP}/#/team`, STOP),
  "team-org-deleted": orgDeleted("Acme", "Olive (olive@acme.io)", `${APP}/`),
  "health-quiet": projectQuiet("shop", "Acme", AT, AT + 3 * 3_600_000, `${APP}/#/`, STOP),
  "health-back": projectBack("shop", "Acme", 5 * 3_600_000, `${APP}/#/`, STOP),
  "digest-weekly": digest("shop", "Acme", "weekly", WEEK, { project: `${APP}/#/`, stop: STOP }),
  "digest-daily": digest("shop", "Acme", "daily", { ...WEEK, alertsFired: 0, errorRate: h(0.9, 1.4), errors: [] }, { project: `${APP}/#/`, stop: STOP }),
};
