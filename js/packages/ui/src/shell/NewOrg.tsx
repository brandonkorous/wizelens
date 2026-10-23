import type { ReactNode } from "react";
import { createOrg } from "../data/account";
import { act } from "../data/useApi";
import { useAsk } from "../ui/Dialog";

/** "New organization": ask for its name, make it (you own it, with one project), and switch to it. Render `dialog` once. */
export function useNewOrg(): { dialog: ReactNode; start: () => void } {
  const { dialog, prompt, confirm } = useAsk();
  const start = async () => {
    const body = "For a separate company or client. You own it, and it starts with one project.";
    const name = await prompt({ title: "New organization", body, confirmLabel: "Create organization", input: { label: "Name" } });
    if (!name) return;
    const error = await act(() => createOrg(name), () => undefined);
    if (error) await confirm({ title: "The organization was not made", body: error, confirmLabel: "OK" });
  };
  return { dialog, start: () => void start() };
}
