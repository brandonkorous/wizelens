import { asWizeLens, type WizeLens, type WizeLensOptions } from "@wizeworks/lens-browser";

/** What Angular's `ErrorHandler` asks for. Register it with `{ provide: ErrorHandler, useValue: handler }`. */
export interface WizeLensErrorHandler {
  handleError(error: unknown): void;
}

/** The part of Angular's `Router` this package uses: its `events` observable. */
export interface AngularRouterLike {
  events: { subscribe(next: (event: unknown) => void): { unsubscribe(): void } };
}

/** A navigation that ended: Angular's `NavigationEnd`. */
export interface NavigationEndLike {
  url: string;
  urlAfterRedirects: string;
}

// Angular's EventType.NavigationEnd. Events from Angular 14 on carry their type.
const NAVIGATION_END = 1;

/** True for Angular's `NavigationEnd`, by its `type`, or on older versions by its fields (other events with `urlAfterRedirects` also have `state`). */
export function isNavigationEnd(event: unknown): event is NavigationEndLike {
  if (!event || typeof event !== "object") return false;
  const e = event as { type?: unknown; urlAfterRedirects?: unknown; state?: unknown };
  if (typeof e.urlAfterRedirects !== "string") return false;
  return typeof e.type === "number" ? e.type === NAVIGATION_END : !("state" in e);
}

/** The error Angular wrapped: a promise rejection zone.js caught, or an older `ngOriginalError`. */
export function unwrapAngularError(error: unknown): unknown {
  const e = error as { rejection?: unknown; ngOriginalError?: unknown } | null;
  if (e && typeof e === "object") {
    if (e.rejection !== undefined) return e.rejection;
    if (e.ngOriginalError !== undefined) return e.ngOriginalError;
  }
  return error;
}

/** An `ErrorHandler` that sends each error Angular catches to WizeLens, then logs it like Angular's own. Starts WizeLens when it is not running. */
export function createWizeLensErrorHandler(from?: WizeLens | WizeLensOptions): WizeLensErrorHandler {
  const lens = asWizeLens(from);
  return {
    handleError(error: unknown): void {
      lens.captureError(unwrapAngularError(error), { "angular.handler": "ErrorHandler" });
      console.error("ERROR", error);
    },
  };
}

/** Record each finished Angular navigation as a page view. Returns a stop function. */
export function trackAngularRouter(router: AngularRouterLike, from?: WizeLens | WizeLensOptions): () => void {
  const lens = asWizeLens(from);
  if (!lens.enabled) return () => {};
  const sub = router.events.subscribe((event) => {
    if (isNavigationEnd(event)) lens.pageView(event.urlAfterRedirects);
  });
  return () => sub.unsubscribe();
}
