# @wizeworks/lens-cli

The WizeLens command line, and build plugins for Vite, webpack, and Next.js. They upload your browser source maps to a
WizeLens hub or WizeLens Cloud, so minified stacks show your original file, line, function, and code.

```bash
npx @wizeworks/lens-cli sourcemaps upload ./dist --release 1.4.0 --endpoint https://app.wizelens.com --token wl_ik_...
npx @wizeworks/lens-cli sourcemaps list --release 1.4.0
```

```ts
// vite.config.ts
import { wizeLensSourceMaps } from "@wizeworks/lens-cli/vite";
export default defineConfig({ plugins: [react(), wizeLensSourceMaps()] });

// webpack.config.js
import { WizeLensSourceMapsPlugin } from "@wizeworks/lens-cli/webpack";
export default { plugins: [new WizeLensSourceMapsPlugin()] };

// next.config.mjs
import { withWizeLensSourceMaps } from "@wizeworks/lens-cli/next";
export default withWizeLensSourceMaps({ reactStrictMode: true });
```

Settings come from flags or options, then the environment: `WIZELENS_ENDPOINT` (default the local hub),
`WIZELENS_TOKEN` (a cloud ingest key or the hub token), `WIZELENS_RELEASE` (default the `package.json` version), and
`WIZELENS_PROJECT` (hub only). Installed, the command is `wizelens`.

See [Source maps](https://wizelens.com/docs/source-maps/) for the whole guide.
