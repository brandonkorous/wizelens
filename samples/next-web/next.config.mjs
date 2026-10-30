import { withWizeLensSourceMaps } from "@wizeworks/lens-cli/next";

// Browser source maps on, the release in the bundle, and the maps uploaded after `next build` to WIZELENS_ENDPOINT.
export default withWizeLensSourceMaps(
  {
    reactStrictMode: true,
    serverExternalPackages: ["@wizeworks/lens-node"],
  },
  { upload: !!process.env.WIZELENS_ENDPOINT },
);
