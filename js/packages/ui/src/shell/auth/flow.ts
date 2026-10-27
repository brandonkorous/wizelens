import { loadAccount, pendingInvite } from "../../data/account";
import { pendingOAuth, resumeAuthorize } from "../../data/oauth";
import { hrefTo, navigate, takeSignInBack } from "../../routes";

/** The invite page for one invite id. */
export const inviteHref = (id: string) => hrefTo("invite", [], { token: id });

/** The full invite link to send someone. */
export const inviteLink = (id: string) => `${window.location.origin}${window.location.pathname}${inviteHref(id)}`;

/** Once signed in: on with an app's authorization, back to a pending invite, back to the page asked for, else to the overview. */
export async function afterSignIn(): Promise<void> {
  const oauth = pendingOAuth.get();
  if (oauth) return resumeAuthorize(oauth);
  await loadAccount();
  const id = pendingInvite.get();
  const back = takeSignInBack();
  navigate(id ? inviteHref(id) : (back ?? hrefTo("overview")));
}
