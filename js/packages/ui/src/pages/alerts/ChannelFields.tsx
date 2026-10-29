import { useState } from "react";
import { Plus, X } from "lucide-react";
import { MAX_ALERT_CHANNELS } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "../../data/account";
import { useHost } from "../../data/host";
import { useApi } from "../../data/useApi";
import { Check, Field, FormRow, SelectField } from "../../ui/Field";
import type { OrgData } from "../organization/orgTypes";
import type { Channel } from "./alertTypes";

const URL_KINDS: [Channel["kind"], string][] = [
  ["slack", "Slack incoming webhook"],
  ["teams", "Microsoft Teams webhook"],
  ["discord", "Discord webhook"],
  ["pagerduty", "PagerDuty (Events API v2)"],
  ["webhook", "Webhook (JSON)"],
];
const ALL_KINDS: [Channel["kind"], string][] = [...URL_KINDS, ["email", "Email to members"]];
const PLACEHOLDER: Partial<Record<Channel["kind"], string>> = {
  slack: "https://hooks.slack.com/services/…",
  teams: "https://….webhook.office.com/…",
  discord: "https://discord.com/api/webhooks/…",
  webhook: "https://example.com/wizelens",
};

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

const blank = (kind: Channel["kind"]): Channel => (kind === "email" ? { kind, to: [] } : kind === "pagerduty" ? { kind, routingKey: "" } : { kind, url: "" });

/** One channel: its kind, and its URL, routing key, or members. Email starts with the person making the rule. */
function ChannelRow({ channel, onChange, onRemove, autoFocus }: { channel: Channel; onChange: (c: Channel) => void; onRemove: () => void; autoFocus: boolean }) {
  const cloud = useHost().has("accounts");
  const me = useAccount()?.user?.email.toLowerCase();
  const pick = (kind: Channel["kind"]) => onChange(kind === channel.kind ? channel : kind === "email" && me ? { kind, to: [me] } : blank(kind));
  return (
    <div className="wl-alert-channel">
      <FormRow>
        <SelectField label="Send to" value={channel.kind} options={cloud ? ALL_KINDS : URL_KINDS} onChange={pick} autoFocus={autoFocus} />
        {"url" in channel && <Field label="URL" type="url" required value={channel.url} onChange={(e) => onChange({ ...channel, url: e.target.value })} placeholder={PLACEHOLDER[channel.kind]} />}
        {channel.kind === "pagerduty" && <Field label="Routing key" required value={channel.routingKey} onChange={(e) => onChange({ kind: "pagerduty", routingKey: e.target.value })} placeholder="The integration key of a PagerDuty service" />}
        <button type="button" className="wl-icon-btn wl-alert-channel-remove" aria-label="Remove this channel" onClick={onRemove}>
          <X size={16} />
        </button>
      </FormRow>
      {channel.kind === "email" && <MemberEmails to={channel.to} onChange={(to) => onChange({ kind: "email", to })} />}
    </div>
  );
}

/** Where the notice goes: up to five channels. None keeps it on the dashboard only. A new channel takes the focus. */
export function ChannelFields({ channels, onChange }: { channels: Channel[]; onChange: (c: Channel[]) => void }) {
  const [added, setAdded] = useState(-1);
  const set = (i: number) => (c: Channel) => onChange(channels.map((x, j) => (j === i ? c : x)));
  return (
    <div className="wl-alert-channels">
      <div className="wl-section-title">Notify</div>
      {channels.length === 0 && <p className="wl-muted wl-small">No channels: the alert shows on the dashboard and in the bell only.</p>}
      {channels.map((c, i) => (
        <ChannelRow key={i} channel={c} onChange={set(i)} onRemove={() => onChange(channels.filter((_, j) => j !== i))} autoFocus={i === added} />
      ))}
      {channels.length < MAX_ALERT_CHANNELS && (
        <button type="button" className="wl-btn" onClick={() => (setAdded(channels.length), onChange([...channels, blank("slack")]))}>
          <Plus aria-hidden="true" /> Add a channel
        </button>
      )}
    </div>
  );
}
