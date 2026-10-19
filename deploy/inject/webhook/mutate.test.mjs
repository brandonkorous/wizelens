// node --test deploy/inject/webhook
import assert from "node:assert/strict";
import { test } from "node:test";
import { patchFor, review } from "./mutate.mjs";

const config = { image: "ghcr.io/brandonkorous/wizelens-inject:1.0.0", hub: "http://wizelens-hub.wizelens:5960" };

function pod(kind, container = {}, metadata = {}) {
  return {
    metadata: { labels: { "wizelens.dev/inject": kind, app: "orders" }, ...metadata },
    spec: { containers: [{ name: "api", image: "orders:1", ...container }] },
  };
}

/** Apply the add and replace operations the webhook makes. */
function apply(doc, ops) {
  const out = structuredClone(doc);
  for (const { op, path, value } of ops) {
    const keys = path.slice(1).split("/").map((k) => k.replaceAll("~1", "/").replaceAll("~0", "~"));
    const last = keys.pop();
    const parent = keys.reduce((o, k) => o[k], out);
    if (last === "-") parent.push(value);
    else if (op === "replace" || op === "add") parent[last] = value;
  }
  return out;
}

const envOf = (p, i = 0) => Object.fromEntries(p.spec.containers[i].env.map((e) => [e.name, e.value ?? e.valueFrom]));

test("a Node pod gets the copy step, the volume, NODE_OPTIONS, and the WizeLens settings", () => {
  const p = apply(pod("node"), patchFor(pod("node"), config, "shop"));
  assert.equal(p.metadata.annotations["wizelens.dev/injected"], "node");
  assert.deepEqual(p.spec.volumes, [{ name: "wizelens-auto", emptyDir: {} }]);
  assert.deepEqual(p.spec.initContainers[0].command, ["cp", "-R", "/wizelens/node", "/wizelens-auto/"]);
  assert.equal(p.spec.initContainers[0].image, config.image);
  assert.deepEqual(p.spec.containers[0].volumeMounts, [{ name: "wizelens-auto", mountPath: "/wizelens", readOnly: true }]);
  assert.deepEqual(envOf(p), {
    NODE_OPTIONS: "--import=/wizelens/node/dist/auto.js",
    WIZELENS_ENABLED: "true",
    WIZELENS_DASHBOARD: "false",
    OTEL_SERVICE_NAME: "orders",
    WIZELENS_HUB: config.hub,
    WIZELENS_PROJECT: "shop",
  });
});

test("a .NET pod gets DOTNET_STARTUP_HOOKS joined to the one it sets, and keeps its own settings", () => {
  const container = { env: [{ name: "DOTNET_STARTUP_HOOKS", value: "/other/Hook.dll" }, { name: "OTEL_SERVICE_NAME", value: "billing" }] };
  const source = pod("dotnet", container, { annotations: { "wizelens.dev/hub": "http://hub:5960", "wizelens.dev/dashboard": "true" } });
  const p = apply(source, patchFor(source, config, "shop"));
  const env = envOf(p);
  assert.equal(env.DOTNET_STARTUP_HOOKS, "/other/Hook.dll:/wizelens/dotnet/WizeLens.AutoInstrumentation.dll");
  assert.equal(env.OTEL_SERVICE_NAME, "billing");
  assert.equal(env.WIZELENS_HUB, "http://hub:5960");
  assert.equal(env.WIZELENS_DASHBOARD, "true");
  assert.equal(p.metadata.annotations["wizelens.dev/injected"], "dotnet");
});

test("only the named containers, and the hub token from a Secret", () => {
  const source = pod("node", {}, { annotations: { "wizelens.dev/container-names": "worker" } });
  source.spec.containers.push({ name: "worker", image: "orders:1", volumeMounts: [{ name: "data", mountPath: "/data" }] });
  const p = apply(source, patchFor(source, { ...config, hubTokenSecret: "wizelens-hub" }, "shop"));
  assert.equal(p.spec.containers[0].env, undefined);
  assert.equal(p.spec.containers[1].volumeMounts.length, 2);
  assert.deepEqual(envOf(p, 1).WIZELENS_HUB_TOKEN, { secretKeyRef: { name: "wizelens-hub", key: "token", optional: true } });
});

test("no patch for unlabeled, unknown, or already injected pods; a valueFrom hook is skipped", () => {
  assert.deepEqual(patchFor({ metadata: {}, spec: { containers: [{ name: "a" }] } }, config, "ns"), []);
  assert.deepEqual(patchFor(pod("java"), config, "ns"), []);
  assert.deepEqual(patchFor(pod("node", {}, { annotations: { "wizelens.dev/injected": "node" } }), config, "ns"), []);
  const fromSecret = pod("node", { env: [{ name: "NODE_OPTIONS", valueFrom: { configMapKeyRef: { name: "x", key: "y" } } }] });
  assert.deepEqual(patchFor(fromSecret, config, "ns"), []);
});

test("the review allows every pod and returns a base64 JSON patch", () => {
  const answer = review({ request: { uid: "u1", namespace: "shop", object: pod("node") } }, config);
  assert.equal(answer.response.uid, "u1");
  assert.equal(answer.response.allowed, true);
  assert.equal(answer.response.patchType, "JSONPatch");
  assert.ok(JSON.parse(Buffer.from(answer.response.patch, "base64").toString()).length > 3);
  assert.equal(review({ request: { uid: "u2", object: { metadata: {}, spec: { containers: [] } } } }, config).response.patch, undefined);
});
