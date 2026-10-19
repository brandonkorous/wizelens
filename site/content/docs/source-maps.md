---
title: Source maps
description: Turn minified browser stacks back into your source, with the original file, line, function, and a few lines of code.
---

A production build minifies your code, so a browser error's stack says `at oa (index-ucPOZErM.js:171:24720)`. With source
maps, WizeLens shows `applyCoupon` in `src/coupon.ts:4`, with the lines around it, and keeps the raw stack one click away.
Errors also group by that original frame, so one bug stays one error across builds, and the same message thrown in two
places is two errors.

## On your machine: nothing to set up

In development, WizeLens reads the maps your dev server already serves (Vite, webpack, Next.js). The browser package reads
them for the page's own scripts, and the Node add-on and the hub read them from any dev server on `localhost`.

To read a production build on your machine, point the hub or the add-on at the build folder:

```bash
npx @wizeworks/lens-hub --sourcemaps ./dist
```

```ts
createWizeLens({ serviceName: "web-api", sourceMaps: { dirs: ["../web/dist"] } });
```

The ASP.NET Core add-on does not read maps itself: its dashboard reads the maps your site or dev server serves.

## In production: upload at build time

Production sites should not serve their maps. Upload them to the hub or the cloud when you build, under the version your app
reports. Add the plugin for your bundler:

```ts
// vite.config.ts
import { wizelensSourceMaps } from "@wizeworks/lens-cli/vite";

export default defineConfig({ plugins: [react(), wizelensSourceMaps()] });
```

```js
// webpack.config.js
import { WizeLensSourceMapsPlugin } from "@wizeworks/lens-cli/webpack";

export default { plugins: [new WizeLensSourceMapsPlugin()] };
```

```js
// next.config.mjs
import { withWizeLens } from "@wizeworks/lens-cli/next";

export default withWizeLens({ reactStrictMode: true });
```

Each plugin turns on hidden source maps (the files ship without a link to their map), puts the release in the page, and
uploads every map after a production build. Next.js 15.4 and later upload after `next build` with webpack or Turbopack (older versions upload from webpack); the
wrapper deletes the maps it turned on once they are uploaded, so they are not deployed.

Or upload from CI with the command line:

```bash
npx @wizeworks/lens-cli sourcemaps upload ./dist --release 1.4.0
npx @wizeworks/lens-cli sourcemaps list --release 1.4.0
```

## Where the maps go

| Setting | Flag | Variable | Default |
|---|---|---|---|
| Hub or cloud | `--url` | `WIZELENS_URL`, then `WIZELENS_HUB` | `http://localhost:5960` |
| Key | `--token` | `WIZELENS_TOKEN`, then `WIZELENS_HUB_TOKEN` | none |
| Release | `--release` | `WIZELENS_RELEASE` | your `package.json` version |
| Project (hub) | `--project` | `WIZELENS_PROJECT` | none |
| Path prefix | `--url-prefix` | | none |

For WizeLens Cloud, use `https://cloud.wizelens.com` and an **ingest key** of the project (Team → Keys): the maps go to that
project. The cloud keeps the newest 20 releases of each project.

The plugins take the same settings as options (`url`, `token`, `release`, `project`, `urlPrefix`, `deleteAfterUpload`), plus
`upload: false` to skip the upload and `failOnError: true` to fail the build when it does not work (by default it warns).

## The release

Maps are found by the version your app sends with each browser span. The plugins set it for you. Without a plugin, pass it
to the provider:

```tsx
<WizeLensProvider version={import.meta.env.VITE_APP_VERSION}>
```

The release shows on each error, next to its original source.

## What you see

On the **Errors** page, a browser error shows its **Source** (the first frame of your code) and **Release**. The
**Stack Trace** tab opens on **Original**: each frame with its function, file, line, and column, and the frames of your code
with a few lines of source around the line that threw. Library frames are grey. **Raw** shows the stack as the browser sent it.
