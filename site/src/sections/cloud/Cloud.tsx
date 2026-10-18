"use client";

import { motion } from "motion/react";
import { Headline, riseDelay } from "@/components/ui/Headline";
import { CopyCommand } from "@/components/ui/CopyCommand";
import { ArrowRight } from "@/components/ui/icons";
import { Tile } from "@/sections/bento/Tile";
import { Compare } from "./Compare";
import { TeamDemo } from "./TeamDemo";
import { HistoryArt, KeysArt, RetentionArt, ScaleArt } from "./tiles/DataTiles";
import { AlertsArt, AuditArt, RolesArt, ShareArt } from "./tiles/TeamTiles";

const EASE = [0.22, 1, 0.36, 1] as const;

const SAFE = [
  "Keys are stored as hashes. The secret is shown once.",
  "The sign-in cookie is HttpOnly, and secure on https.",
  "Every change from a browser needs a header another site cannot send.",
  "Webhooks cannot reach private addresses unless you allow it.",
  "Passwords, tokens, and keys are redacted before they are stored.",
  "Every MCP call goes to the audit log, with the key that made it.",
];

function Hero() {
  return (
    <section className="wl-cloud-hero">
      <div className="wl-wrap wl-cloud-hero-grid">
        <div className="wl-cloud-copy">
          <Headline lines={["The same lens,", "for the team."]} />
          <div className="wl-cloud-intro wl-rise" style={riseDelay(0.35)}>
            <p className="wl-lede">WizeLens Cloud is the dashboard you already know, with accounts, 30 days of history, alerts, share links, and AI access you can scope. Today you run it yourself, on your own Postgres.</p>
            <div className="wl-hero-cta">
              <a href="/docs/cloud/" className="wl-btn wl-btn-primary">Self-host guide <ArrowRight /></a>
            </div>
            <CopyCommand command="npx @wizeworks/lens-cloud" />
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: EASE }}>
          <TeamDemo />
        </motion.div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="wl-section wl-paper">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Built for more than one person.</h2>
          <p className="wl-lede">Everything the in-app dashboard does, plus the parts a team needs.</p>
        </div>
        <div className="wl-bento wl-cloud-bento">
          <Tile area="ro" title="Roles that make sense." body="Organizations hold projects. Viewers read, members alert and share, admins run projects and keys, owners run owners.">{(s) => <RolesArt seen={s} />}</Tile>
          <Tile area="hi" title="30 days of history." body="Every page is computed on the server, from stats tables, never from a sample.">{(s) => <HistoryArt seen={s} />}</Tile>
          <Tile area="al" title="Alerts that say what happened." body="Error rate, latency, traffic, new errors, slow queries, or any metric. To webhooks and Slack, when it fires and when it clears.">{(s) => <AlertsArt seen={s} />}</Tile>
          <Tile area="sh" title="Share one trace." body="A read-only link to one trace, for 1 to 30 days. Revoke it any time.">{(s) => <ShareArt seen={s} />}</Tile>
          <Tile area="sc" title="Fast with a lot of data." body="Measured at 200 traces a second on Postgres." night>{(s) => <ScaleArt seen={s} />}</Tile>
          <Tile area="ke" title="Keys for apps and agents." body="Apps send with an ingest key. Agents read with a read key.">{() => <KeysArt />}</Tile>
          <Tile area="au" title="An audit log." body="Who changed what, and every call an agent made." night>{(s) => <AuditArt seen={s} />}</Tile>
          <Tile area="re" title="Keep what you need." body="Retention per organization.">{(s) => <RetentionArt seen={s} />}</Tile>
        </div>
      </div>
    </section>
  );
}

function SelfHost() {
  return (
    <section className="wl-section wl-night">
      <div className="wl-wrap wl-cloud-self">
        <div>
          <h2 className="wl-h2">Run it yourself.</h2>
          <p className="wl-lede">One Docker Compose file with Postgres. Put it behind https, create the first account, and you own the first organization.</p>
        </div>
        <div className="wl-cloud-steps">
          <CopyCommand command="docker compose -f deploy/docker-compose.cloud.yml up -d" />
          <ol>
            <li><b>Start it</b> with POSTGRES_PASSWORD and WIZELENS_CLOUD_PUBLIC_URL set.</li>
            <li><b>Sign up</b> as the first account, then invite your team.</li>
            <li><b>Make an ingest key</b> per app and set WIZELENS_HUB and WIZELENS_HUB_TOKEN.</li>
          </ol>
          <ul className="wl-cloud-safe">{SAFE.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}

export function Cloud() {
  return (
    <main>
      <Hero />
      <Features />
      <Compare />
      <SelfHost />
    </main>
  );
}
