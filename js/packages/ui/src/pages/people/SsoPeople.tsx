import { useApi } from "../../data/useApi";
import { fmtAgo } from "../../format";
import { DotText, type Tone } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

/** One person who signs in through a provider, from `GET api/orgs/<id>/sso/people`. */
interface SsoPerson {
  name: string;
  email: string;
  providerId: string;
  oidc: boolean;
  signedIn: boolean;
  checkedMs: number | null;
  verdict: "ok" | "refused" | "unknown" | null;
}

/** What the last check with the provider said, in a few words. SAML has nothing to ask, so its sign-in lasts its session. */
function statusOf(p: SsoPerson): [Tone, string] {
  const ago = p.checkedMs ? fmtAgo(p.checkedMs) : "";
  if (p.verdict === "refused") return ["danger", `Signed out: ${p.providerId} turned them off (${ago})`];
  if (!p.signedIn) return ["neutral", "Not signed in"];
  if (!p.oidc) return ["info", "Signed in until the session ends (SAML is not checked again)"];
  if (p.verdict === "ok") return ["success", `Signed in · ${p.providerId} confirmed ${ago}`];
  if (p.verdict === "unknown") return ["warning", `Signed in · ${p.providerId} did not answer ${ago}; checked again in 5 minutes`];
  return ["neutral", "Signed in · first check within 5 minutes"];
}

const COLUMNS: Column<SsoPerson>[] = [
  { key: "person", header: "Person", cell: (p) => <span><strong>{p.name}</strong> <span className="wl-muted wl-small">{p.email}</span></span> },
  { key: "provider", header: "Provider", cell: (p) => p.providerId, hideSm: true },
  { key: "status", header: "Status", cell: (p) => { const [tone, text] = statusOf(p); return <DotText tone={tone}>{text}</DotText>; } },
];

/** Everyone who signs in through this organization's providers, and whether the provider still lets them in. */
export function SsoPeople({ orgId }: { orgId: string }) {
  const { data } = useApi<SsoPerson[]>(`./api/orgs/${orgId}/sso/people`);
  if (!data) return null;
  return (
    <Panel title={`People who sign in with single sign-on (${data.length})`} flush>
      <Table columns={COLUMNS} rows={data} rowKey={(p) => `${p.providerId} ${p.email}`} empty={<Empty>Nobody has signed in with a provider yet.</Empty>} />
    </Panel>
  );
}
