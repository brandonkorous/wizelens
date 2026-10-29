"use client";

import { Tile } from "@/sections/bento/Tile";
import { AccountArt, MailArt, SsoArt } from "./tiles/AccessTiles";
import { HistoryArt, KeysArt, RetentionArt } from "./tiles/DataTiles";
import { ProjectsArt } from "./tiles/ProjectsArt";
import { AuditArt, RolesArt, ShareArt } from "./tiles/TeamTiles";

// The people side of the cloud: roles, projects, sign-in, keys, sharing, email, history, and the audit log.
export function TeamFeatures() {
  return (
    <section className="wl-section wl-paper">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Built for more than one person.</h2>
          <p className="wl-lede wl-cloud-lede">Everything the in-app dashboard does, plus the parts a team needs. The Billing page shows this month&apos;s data, and owners can cap what extra data costs. See <a href="/pricing/">pricing</a>.</p>
        </div>
        <div className="wl-bento wl-cloud-bento">
          <Tile area="ro" title="Roles that make sense." body="Four roles, from viewer to owner. Viewers read. Members also make alerts, tags, and share links. Admins also run projects, keys, and people. Owners also set the spend cap and can delete the organization. Anyone below admin can get more, less, or no access to one project.">{(s) => <RolesArt seen={s} />}</Tile>
          <Tile area="pa" title="Every project, one screen." body="Pick All projects and see your whole organization at once. Totals add up, and two services with the same name stay apart.">{(s) => <ProjectsArt seen={s} />}</Tile>
          <Tile area="ss" title="Single sign-on and SCIM." body="Connect Okta, Entra ID, Google, Auth0, Keycloak, or any SAML 2.0 provider. Prove the domain with a DNS TXT record. SCIM adds and removes people for you. On Business, Enterprise, and any self-hosted cloud." night>{(s) => <SsoArt seen={s} />}</Tile>
          <Tile area="ac" title="Accounts that stay yours." body="Two-step sign-in with backup codes, passkeys, and every signed-in device in one list. Breached passwords are refused, and every change sends you an email.">{(s) => <AccountArt seen={s} />}</Tile>
          <Tile area="ke" title="Keys for apps, sign-in for agents." body="Apps send with an ingest key. Claude signs in and reads only the projects you pick. Keys can expire, keep to scopes, and rotate.">{() => <KeysArt />}</Tile>
          <Tile area="sh" title="Share a trace or a page." body="A read-only link to one trace, or to a page as it is now, for 1 to 30 days. Revoke it any time.">{(s) => <ShareArt seen={s} />}</Tile>
          <Tile area="em" title="Email worth opening." body="Daily, weekly, or monthly digests per project, at your hour. A note when a busy project goes quiet, and team changes for owners and admins.">{(s) => <MailArt seen={s} />}</Tile>
          <Tile area="hi" title="Up to 400 days of history." body="Every page is computed on the server, from stats tables, never from a sample. 14 to 400 days, by plan.">{(s) => <HistoryArt seen={s} />}</Tile>
          <Tile area="re" title="Keep what you need." body="Retention per organization, shorter per project, and logs kept on their own clock.">{(s) => <RetentionArt seen={s} />}</Tile>
          <Tile area="au" title="An audit log." body="Who changed what, and every call an agent made. Business and Enterprise export it as CSV or JSON." night>{(s) => <AuditArt seen={s} />}</Tile>
        </div>
      </div>
    </section>
  );
}
