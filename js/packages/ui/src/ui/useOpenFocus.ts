import { useEffect, useRef } from "react";

/** A detail panel opened from a table row takes focus on its title; closing hands focus back to the row. */
export function useOpenFocus<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    // Only a row's Enter or click: a panel open on page load, or paged by its own buttons, leaves focus where it is.
    const from = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("tr, [role=row]") : null;
    if (!from) return;
    ref.current?.focus();
    // On close the panel's buttons are gone and focus falls to <body>.
    return () => {
      if (from.isConnected && (!document.activeElement || document.activeElement === document.body)) from.focus();
    };
  }, [key]);
  return ref;
}
