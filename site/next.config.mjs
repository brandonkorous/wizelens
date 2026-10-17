// Static export: the whole site is plain files that any host can serve.
const config = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
};

export default config;
