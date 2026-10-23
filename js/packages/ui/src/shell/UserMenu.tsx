import { Building2, ChevronDown, LogOut, Settings2, SlidersHorizontal, UserRound } from "lucide-react";
import { currentProject, signOut, useAccount } from "../data/account";
import { hrefTo } from "../routes";
import { Menu } from "./Menu";

/** The signed-in person: their account and preferences, their organization, and sign out. */
export function UserMenu() {
  const account = useAccount();
  const user = account?.user;
  if (!user) return null;
  const org = currentProject(account)?.org;
  const label = (
    <>
      <UserRound aria-hidden="true" />
      <span className="wl-label">{user.name}</span>
      <ChevronDown aria-hidden="true" />
    </>
  );
  return (
    <Menu label={label} title={`Signed in as ${user.email}`}>
      {(close) => (
        <>
          <div className="wl-menu-head">{user.email}</div>
          <a className="wl-menu-item" href={hrefTo("account")} onClick={close}>
            <Settings2 size={16} aria-hidden="true" /> Account
          </a>
          <a className="wl-menu-item" href={hrefTo("account", ["preferences"])} onClick={close}>
            <SlidersHorizontal size={16} aria-hidden="true" /> Preferences
          </a>
          {org && (
            <a className="wl-menu-item" href={hrefTo("organization")} onClick={close}>
              <Building2 size={16} aria-hidden="true" /> {org.name}
            </a>
          )}
          <button type="button" className="wl-menu-item" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </>
      )}
    </Menu>
  );
}
