import { useEffect, useState } from "react";
import { auth, errorText } from "../../data/account";
import { authBase } from "../../data/auth-client";
import { act } from "../../data/useApi";
import { Badge, CopyButton } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { SsoForm } from "./SsoForm";

/** One provider as Better Auth lists it (secrets never come back). */
interface Provider {
  providerId: string;
  type: "oidc" | "saml";
  issuer: string;
  domain: string;
  organizationId: string | null;
  domainVerified: boolean;
  spMetadataUrl: string;
}

function useProviders(orgId: string) {
  const [list, setList] = useState<Provider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    auth((c) => c.sso.providers()).then(
      (d) => live && setList((d.providers as Provider[]).filter((p) => p.organizationId === orgId)),
      (e: unknown) => live && setError(errorText(e)),
    );
    return () => void (live = false);
  }, [orgId, tick]);
  return { list, error, reload: () => setTick((t) => t + 1) };
}

/** One copyable value with its label. */
const Line = ({ label, value }: { label: string; value: string }) => (
  <div className="wl-share-link">
    <span className="wl-muted wl-small">{label}</span>
    <code className="wl-mono wl-small">{value}</code> <CopyButton text={value} />
  </div>
);

/** What the identity provider's admin enters on their side. */
function SetupUrls({ p }: { p: Provider }) {
  const id = encodeURIComponent(p.providerId);
  if (p.type === "oidc") return <Line label="Redirect (callback) URL" value={`${authBase()}/sso/callback/${id}`} />;
  return (
    <>
      <Line label="ACS (reply) URL" value={`${authBase()}/sso/saml2/sp/acs/${id}`} />
      <Line label="Entity ID (audience)" value={p.issuer} />
      <Line label="Metadata URL" value={p.spMetadataUrl} />
    </>
  );
}

/** Until the domain is proven with a DNS TXT record, nobody can sign in with this provider. */
function DomainProof({ p, reload }: { p: Provider; reload: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (p.domainVerified) return null;
  const show = () => void auth((c) => c.sso.requestDomainVerification({ providerId: p.providerId })).then((d) => setToken(d.domainVerificationToken), (e: unknown) => setError(errorText(e)));
  const check = () => void act(() => auth((c) => c.sso.verifyDomain({ providerId: p.providerId })), reload).then(setError);
  return (
    <div className="wl-sso-proof">
      <p className="wl-muted wl-small">Prove you own the domain: add a TXT record, wait for DNS, then check.</p>
      {token && p.domain.split(",").map((d) => <Line key={d} label={`TXT name for ${d.trim()}`} value={`_wizelens-sso-${p.providerId}.${d.trim()}`} />)}
      {token && <Line label="TXT value" value={token} />}
      <span className="wl-row-actions">
        {!token && <button type="button" className="wl-btn" onClick={show}>Show the DNS record</button>}
        {token && <button type="button" className="wl-btn wl-btn-primary" onClick={check}>Check DNS now</button>}
      </span>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
    </div>
  );
}

function ProviderItem({ p, reload }: { p: Provider; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const remove = () => window.confirm(`Remove ${p.providerId}? People who use it can no longer sign in with it.`) && void act(() => auth((c) => c.sso.deleteProvider({ providerId: p.providerId })), reload).then(setError);
  return (
    <div className="wl-sso-item">
      <div className="wl-sso-head">
        <strong>{p.providerId}</strong> <span className="wl-muted">{p.type === "oidc" ? "OpenID Connect" : "SAML"} · {p.domain}</span>
        <Badge tone={p.domainVerified ? "success" : "warning"}>{p.domainVerified ? "Domain proven" : "Domain not proven"}</Badge>
        <button type="button" className="wl-link-btn wl-text-error" onClick={remove}>Remove</button>
      </div>
      <SetupUrls p={p} />
      <DomainProof p={p} reload={reload} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
    </div>
  );
}

/** Owners and admins: single sign-on for this organization. New people from the domain join as members. */
export function SsoPanel({ orgId }: { orgId: string }) {
  const { list, error, reload } = useProviders(orgId);
  return (
    <Panel title="Single sign-on">
      <p className="wl-muted">People with emails at a proven domain sign in with your identity provider. New people join as members.</p>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {list && list.length === 0 && <Empty>No identity provider yet.</Empty>}
      {list?.map((p) => <ProviderItem key={p.providerId} p={p} reload={reload} />)}
      <SsoForm orgId={orgId} reload={reload} />
    </Panel>
  );
}
