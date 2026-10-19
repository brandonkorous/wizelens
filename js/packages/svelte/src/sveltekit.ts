import { asWizeLens, currentWizeLens, type WizeLens, type WizeLensOptions } from "@wizeworks/lens-browser";

/** What SvelteKit passes to `handleError` in hooks.client.ts. */
export interface HandleClientErrorInput {
  error: unknown;
  event?: { route?: { id?: string | null } | null; url?: URL } | null;
  status?: number;
  message?: string;
}

export type HandleClientError<T = unknown> = (input: HandleClientErrorInput) => T;

/** What SvelteKit passes to an `afterNavigate` callback. */
export interface AfterNavigateLike {
  type?: string;
  to?: { url: URL } | null;
}

// The lens to use when called: the one given, else the running one. Null means nothing to do.
const lensOf = (from?: WizeLens | WizeLensOptions): WizeLens | null => (from ? asWizeLens(from) : currentWizeLens());

/** A SvelteKit `handleError` for hooks.client.ts that sends the error to WizeLens, then runs `next` (else logs it, as SvelteKit does). */
export function createHandleError<T = void>(next?: HandleClientError<T>, from?: WizeLens | WizeLensOptions): HandleClientError<T | void> {
  return (input) => {
    const route = input.event?.route?.id;
    lensOf(from)?.captureError(input.error, {
      ...(route ? { "sveltekit.route": route } : {}),
      ...(input.status !== undefined ? { "http.response.status_code": input.status } : {}),
    });
    if (next) return next(input);
    console.error(input.error);
  };
}

/** `export const handleError = handleErrorWithWizeLens;` in hooks.client.ts, once `initWizeLens` ran. */
export const handleErrorWithWizeLens: HandleClientError<void> = createHandleError();

/** An `afterNavigate` callback that records each client-side navigation as a page view. The first load is already one. */
export function pageViewOnNavigate(from?: WizeLens | WizeLensOptions): (navigation: AfterNavigateLike) => void {
  return (navigation) => {
    if (navigation.type === "enter" || !navigation.to) return;
    lensOf(from)?.pageView(navigation.to.url.pathname + navigation.to.url.search);
  };
}

/** Call in your root +layout.svelte with SvelteKit's `afterNavigate`: each navigation is a page view. */
export function trackSvelteKitNavigation(afterNavigate: (callback: (navigation: AfterNavigateLike) => void) => void, from?: WizeLens | WizeLensOptions): void {
  afterNavigate(pageViewOnNavigate(from));
}
