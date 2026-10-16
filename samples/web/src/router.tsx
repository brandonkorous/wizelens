import { type MouseEvent, type ReactNode, useSyncExternalStore } from "react";

// A tiny History API router. WizeLens sees every route change as a page view.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    removeEventListener("popstate", listener);
  };
}

export function navigate(path: string): void {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  listeners.forEach((l) => l());
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

/** Match "/products/:id" against a path. Returns the params, or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i]!.startsWith(":")) params[want[i]!.slice(1)] = decodeURIComponent(got[i]!);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
