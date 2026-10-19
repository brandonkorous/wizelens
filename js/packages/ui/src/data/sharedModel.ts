// A page shared by link: its numbers were kept when the link was made, so the page shows them instead of asking the host.
import { createContext, useContext } from "react";

export interface SharedModel {
  page: string;
  model: unknown;
}

export const SharedModelContext = createContext<SharedModel | null>(null);

/** The kept model when this page is the one shared, else null. */
export function useSharedModel(page: string): SharedModel | null {
  const shared = useContext(SharedModelContext);
  return shared && shared.page === page ? shared : null;
}
