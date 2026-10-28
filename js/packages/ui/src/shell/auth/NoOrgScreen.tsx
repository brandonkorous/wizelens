import { type AccountState, loadAccount, signOut } from "../../data/account";
import { apiSend } from "../../data/api";
import { useApi } from "../../data/useApi";
import { hrefTo } from "../../routes";
import { AuthForm } from "./AuthForm";
import { inviteHref } from "./flow";

interface Invite {
  id: string;
  orgName: string;
  role: string;
  inviter: string;
}

/** Invites waiting for this email (shown once the email is proven), each a link to its Join page. */
function Waiting({ invites }: { invites: Invite[] }) {
  return (
    <span className="wl-noorg-invites">
      {invites.map((i) => (
        <span key={i.id} className="wl-noorg-invite">
          <span>
            <strong>{i.orgName}</strong> as {i.role}, from {i.inviter}
          </span>
          <a className="wl-btn wl-btn-primary" href={inviteHref(i.id)}>Join</a>
        </span>
      ))}
    </span>
  );
}

/** Signed in, but in no organization (left the last one, or it was deleted): make one, or wait for an invite. */
export function NoOrgScreen({ state }: { state: AccountState }) {
  const invites = useApi<Invite[]>("./api/me/invites").data ?? [];
  const make = async (v: Record<string, string>) => {
    await apiSend("POST", "./api/orgs", { name: v.name });
    await loadAccount();
  };
  const footer = (
    <>
      <a className="wl-link-btn" href={hrefTo("account")}>Account</a> ·{" "}
      <button type="button" className="wl-link-btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
  return (
    <AuthForm
      title={invites.length ? "Your team invited you" : "You are not in an organization"}
      intro={
        invites.length ? (
          <>
            Signed in as {state.user?.email}. Join your team, or make an organization of your own below.
            <Waiting invites={invites} />
          </>
        ) : (
          `Signed in as ${state.user?.email ?? ""}. Make an organization, or open an invite link from your team.`
        )
      }
      fields={[{ name: "name", label: "Organization name", value: `${state.user?.name ?? "My"}'s team` }]}
      submit="Make an organization"
      onSubmit={make}
      footer={footer}
    />
  );
}
