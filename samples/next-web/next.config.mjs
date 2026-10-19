import { withWizeLens } from "@wizeworks/lens-cli/next";

// Browser source maps on, the release in the bundle, and the maps uploaded after `next build` to WIZELENS_HUB or WIZELENS_URL.
export default withWizeLens(
  {
    reactStrictMode: true,
    serverExternalPackages: ["@wizeworks/lens-node"],
  },
  { upload: !!(process.env.WIZELENS_HUB || process.env.WIZELENS_URL) },
);
