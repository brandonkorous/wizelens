// The WizeLens injection webhook: Kubernetes sends each new pod labeled wizelens.dev/inject, and gets a patch back.
import { readFileSync } from "node:fs";
import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";
import { review } from "./mutate.mjs";

const env = process.env;
const config = {
  image: env.WIZELENS_INJECT_IMAGE || "ghcr.io/brandonkorous/wizelens-inject:latest",
  pullPolicy: env.WIZELENS_INJECT_PULL_POLICY,
  hub: env.WIZELENS_INJECT_HUB,
  project: env.WIZELENS_INJECT_PROJECT,
  dashboard: env.WIZELENS_INJECT_DASHBOARD === "true",
  hubTokenSecret: env.WIZELENS_INJECT_HUB_TOKEN_SECRET,
  hubTokenKey: env.WIZELENS_INJECT_HUB_TOKEN_KEY,
};
const port = Number(env.PORT || 8443);
const MAX_BODY = 4 * 1024 * 1024;

function handle(req, res) {
  if (req.method === "GET" && req.url === "/healthz") return res.writeHead(200).end("ok");
  if (req.method !== "POST" || req.url?.split("?")[0] !== "/mutate") return res.writeHead(404).end();
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) req.destroy();
  });
  req.on("end", () => {
    let answer;
    try {
      answer = review(JSON.parse(body), config);
    } catch (err) {
      console.error(`[wizelens-inject] bad review: ${err}`);
      return res.writeHead(400).end();
    }
    if (answer.response.patch) console.info(`[wizelens-inject] injected ${answer.response.uid}`);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(answer));
  });
}

// TLS is required by the API server. Without the files (tests, local runs) the webhook serves plain HTTP.
const tls = env.TLS_CERT_FILE && env.TLS_KEY_FILE ? { cert: readFileSync(env.TLS_CERT_FILE), key: readFileSync(env.TLS_KEY_FILE) } : null;
const server = tls ? createHttps(tls, handle) : createHttp(handle);
server.listen(port, () => console.info(`[wizelens-inject] listening on ${tls ? "https" : "http"} port ${port}, injecting ${config.image}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
