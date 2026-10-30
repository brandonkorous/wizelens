import { useEffect } from "react";
import { setBrowserUser } from "@wizeworks/lens-browser/internal";

export interface WizeLensUserProps {
  /** The signed-in user's id, sent as `enduser.id`. Null or empty clears it. */
  id: string | null | undefined;
  /** Their display name, sent as `user.full_name` for the Users page. */
  name?: string | null;
}

/** Names the signed-in user on every browser span while it is mounted. Render it where the page knows the user; it needs no place next to the provider. */
export function WizeLensUser({ id, name }: WizeLensUserProps) {
  useEffect(() => {
    setBrowserUser(id, name);
    return () => setBrowserUser(null);
  }, [id, name]);
  return null;
}
