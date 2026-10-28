import { useState } from "react";
import { apiSend } from "../../data/api";
import { useApi } from "../../data/useApi";
import { useAsk } from "../../ui/Dialog";
import { Check } from "../../ui/Field";

/** "Require single sign-on" of each provider, from `GET api/orgs/<id>/sso`. */
export function useRequired(orgId: string) {
  const { data, reload } = useApi<{ providerId: string; required: boolean }[]>(`./api/orgs/${orgId}/sso`);
  return { isRequired: (providerId: string) => !!data?.find((p) => p.providerId === providerId)?.required, reload };
}

interface Props {
  orgId: string;
  providerId: string;
  domain: string;
  required: boolean;
  reload: () => void;
}

/** Make the provider the only way in for its domain. Owners keep their password, for when the provider is down. */
export function RequireSso({ orgId, providerId, domain, required, reload }: Props) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const { dialog, confirm } = useAsk();
  const send = (on: boolean) =>
    apiSend<{ signedOut: number }>("PATCH", `./api/orgs/${orgId}/sso/${encodeURIComponent(providerId)}`, { required: on }).then(
      (r) => (setNote({ ok: true, text: on ? `Required. ${r.signedOut} ${r.signedOut === 1 ? "person was" : "people were"} signed out and sign in again with single sign-on.` : `People at ${domain} can use a password again.` }), reload()),
      (e: unknown) => setNote({ ok: false, text: e instanceof Error ? e.message : String(e) }),
    );
  const change = async (on: boolean) => {
    const body = on
      ? `Everyone at ${domain} except owners is signed out now. After that they sign in only with single sign-on: a password, a passkey, or a password reset is refused.`
      : `People at ${domain} can sign in with a password or a passkey again.`;
    if (await confirm({ title: on ? `Require single sign-on for ${domain}?` : `Allow passwords for ${domain}?`, body, confirmLabel: on ? "Require single sign-on" : "Allow passwords", danger: !on })) void send(on);
  };
  return (
    <div className="wl-sso-required">
      {dialog}
      <Check label="Require single sign-on" checked={required} onChange={(e) => void change(e.target.checked)} />
      <p className="wl-muted wl-small">
        People at {domain} sign in only with this provider. Owners can still use a password and two-step sign-in, so you can get in if the provider is down.
      </p>
      {note && <div className={`wl-banner ${note.ok ? "wl-banner-success" : "wl-banner-error"}`} role="status">{note.text}</div>}
    </div>
  );
}
