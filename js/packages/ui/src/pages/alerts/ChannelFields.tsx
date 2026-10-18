import { currentProject, useAccount } from "../../data/account";
import { useHost } from "../../data/host";
import { useApi } from "../../data/useApi";
import { Select } from "../../ui/Controls";
import { Check, Field, FormRow } from "../../ui/Field";
import type { OrgData } from "../team/teamTypes";
import type { Channel } from "./alertTypes";

const URL_KINDS: [Channel["kind"], string][] = [
  ["webhook", "Webhook (JSON)"],
  ["slack", "Slack incoming webhook"],
];
const ALL_KINDS: [Channel["kind"], string][] = [...URL_KINDS, ["email", "Email to members"]];

/** Members of the current project's organization to send to. The cloud sends only to confirmed emails. */
function MemberEmails({ to, onChange }: { to: string[]; onChange: (to: string[]) => void }) {
  const account = useAccount();
  const org = currentProject(account)?.org;
  const { data } = useApi<OrgData>(org ? `./api/orgs/${org.id}` : null);
  const toggle = (email: string, on: boolean) => onChange(on ? [...to, email] : to.filter((e) => e !== email));
  const hint = account?.mail ? "Only members with a confirmed email get it." : "This cloud cannot send email yet: notices go to its log.";
  return (
    <fieldset className="wl-check-list">
      <legend>Send to these members</legend>
      {(data?.members ?? []).map((m) => (
        <Check key={m.userId} label={`${m.name} (${m.email})`} checked={to.includes(m.email.toLowerCase())} onChange={(e) => toggle(m.email.toLowerCase(), e.target.checked)} />
      ))}
      <small className="wl-muted">{hint}</small>
    </fieldset>
  );
}

/** Where the notice goes: a URL for webhooks and Slack; on the cloud, also email to members. */
export function ChannelFields({ channel, onChange }: { channel: Channel; onChange: (c: Channel) => void }) {
  const cloud = useHost().has("accounts");
  const pick = (kind: Channel["kind"]) => onChange(kind === "email" ? { kind, to: channel.kind === "email" ? channel.to : [] } : { kind, url: channel.kind === "email" ? "" : channel.url });
  return (
    <>
      <FormRow>
        <Select label="Send to" value={channel.kind} options={cloud ? ALL_KINDS : URL_KINDS} onChange={pick} />
        {channel.kind !== "email" && (
          <Field label="URL" type="url" value={channel.url} onChange={(e) => onChange({ kind: channel.kind, url: e.target.value } as Channel)} placeholder="https://hooks.slack.com/services/…" />
        )}
      </FormRow>
      {channel.kind === "email" && <MemberEmails to={channel.to} onChange={(to) => onChange({ kind: "email", to })} />}
    </>
  );
}
