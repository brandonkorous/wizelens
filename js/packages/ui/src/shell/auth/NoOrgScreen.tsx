import { type AccountState, loadAccount, signOut } from "../../data/account";
import { apiSend } from "../../data/api";
import { hrefTo } from "../../routes";
import { AuthForm } from "./AuthForm";

/** Signed in, but in no organization (left the last one, or it was deleted): make one, or wait for an invite. */
export function NoOrgScreen({ state }: { state: AccountState }) {
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
      title="You are not in an organization"
      intro={`Signed in as ${state.user?.email ?? ""}. Make an organization, or open an invite link from your team.`}
      fields={[{ name: "name", label: "Organization name", value: `${state.user?.name ?? "My"}'s team` }]}
      submit="Make an organization"
      onSubmit={make}
      footer={footer}
    />
  );
}
