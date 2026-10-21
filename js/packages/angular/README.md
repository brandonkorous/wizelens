# @wizeworks/lens-angular

[WizeLens](https://github.com/brandonkorous/wizelens) for Angular apps, on top of [@wizeworks/lens-browser](https://github.com/brandonkorous/wizelens/tree/main/js/packages/browser): links every
`HttpClient` call (and `fetch`) to its server trace, sends page views from the router, and reports the errors Angular catches.

The package does not import `@angular/*`, so it works with any Angular version from 14 on and adds nothing but WizeLens to your bundle.
You register its two parts yourself.

## Install

```bash
npm install @wizeworks/lens-angular
```

## Errors: `createWizeLensErrorHandler`

```ts
// app.config.ts
import { ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer } from "@angular/core";
import { provideRouter, Router } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { createWizeLensErrorHandler, initWizeLens, trackAngularRouter } from "@wizeworks/lens-angular";
import { routes } from "./app.routes";

const lens = initWizeLens({ endpoint: "/_wizelens", enabled: isDevMode() });

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    { provide: ErrorHandler, useValue: createWizeLensErrorHandler(lens) },
    provideAppInitializer(() => void trackAngularRouter(inject(Router), lens)),
  ],
};
```

`createWizeLensErrorHandler(lensOrOptions)` returns an object with `handleError(error)`. It sends the error to WizeLens and then logs
it like Angular's own handler (`console.error("ERROR", error)`). Promise rejections that zone.js wraps are unwrapped first, so the
error groups by its real stack.

Given options instead of an instance, it starts WizeLens itself, `hud` and `slowMs` included (or uses the running instance).

## Page views: `trackAngularRouter`

`trackAngularRouter(router, lensOrOptions?)` subscribes to `router.events` and records each `NavigationEnd` as a page view, by its
`urlAfterRedirects`. It returns a stop function. Before Angular 19, without `provideAppInitializer`, call it from your root
component's constructor:

```ts
export class AppComponent {
  constructor(router: Router) {
    trackAngularRouter(router);
  }
}
```

With the History API (Angular's default) page views are seen without it too; it names the path after redirects and covers
`useHash: true`.

## NgModule apps

```ts
@NgModule({
  providers: [{ provide: ErrorHandler, useValue: createWizeLensErrorHandler({ endpoint: "/_wizelens" }) }],
})
export class AppModule {}
```

## The HUD

The same HUD as every WizeLens browser package: the last request, its server trace, errors, and links into the dashboard, in a
`<wizelens-hud>` element with its own shadow root, so your CSS cannot reach it. Two options set it:

| Option | Default | Description |
|---|---|---|
| `hud` | `"auto"` | `"auto"` asks `{endpoint}/api/info` once and shows the HUD when the server's read API answers, as in development; a send-only server shows nothing. `true` shows it and reads traces back. `false` shows nothing and reads nothing back. |
| `slowMs` | `500` | The HUD shows requests at or over this many ms as "warning". |

```ts
const lens = initWizeLens({ endpoint: "/_wizelens", enabled: isDevMode(), hud: true, slowMs: 800 });
```

When a .NET or Node add-on puts its HUD script into the pages it serves in development, the app's instance takes over from it: one HUD and one
capture per page.

## HttpClient

`HttpClient` uses `XMLHttpRequest` unless you call `withFetch()`. WizeLens traces both. Options are the
[@wizeworks/lens-browser options](https://github.com/brandonkorous/wizelens/tree/main/js/packages/browser#options).

MIT licensed.
