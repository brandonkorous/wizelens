// Turns a pod labeled wizelens.dev/inject=node|dotnet into one that loads WizeLens: a JSON patch, no app change.
import { MOUNT, RUNTIMES, settings } from "./env.mjs";

export const LABEL = "wizelens.dev/inject";
export const INJECTED = "wizelens.dev/injected";
const VOLUME = "wizelens-auto";

const escape = (key) => key.replaceAll("~", "~0").replaceAll("/", "~1");

/** An add to a list, or to a missing list: JSON patch cannot append to a list that does not exist. */
const addTo = (path, list, item) => (list ? { op: "add", path: `${path}/-`, value: item } : { op: "add", path, value: [item] });

function copyContainer(kind, config) {
  return {
    name: VOLUME,
    image: config.image,
    imagePullPolicy: config.pullPolicy || "IfNotPresent",
    command: ["cp", "-R", `${MOUNT}/${kind}`, `/${VOLUME}/`],
    volumeMounts: [{ name: VOLUME, mountPath: `/${VOLUME}` }],
    resources: { requests: { cpu: "10m", memory: "16Mi" }, limits: { cpu: "200m", memory: "64Mi" } },
    securityContext: { runAsNonRoot: true, runAsUser: 1000, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } },
  };
}

/** The hook variable: { add } when missing, { replace } to join the container's own value, {} when present, null when it comes from valueFrom. */
function hookChange(path, env, kind) {
  const hook = RUNTIMES[kind];
  const index = (env ?? []).findIndex((e) => e.name === hook.name);
  if (index < 0) return { add: { name: hook.name, value: hook.value } };
  const current = env[index];
  if (current.valueFrom) return null;
  if ((current.value ?? "").includes(hook.value)) return {};
  const value = [current.value, hook.value].filter(Boolean).join(hook.join);
  return { replace: { op: "replace", path: `${path}/env/${index}/value`, value } };
}

function containerPatch(pod, i, kind, config, namespace) {
  const container = pod.spec.containers[i];
  const path = `/spec/containers/${i}`;
  const hook = hookChange(path, container.env, kind);
  if (hook === null) return { skipped: `${container.name}: ${RUNTIMES[kind].name} comes from valueFrom` };
  const ops = [addTo(`${path}/volumeMounts`, container.volumeMounts, { name: VOLUME, mountPath: MOUNT, readOnly: true })];
  if (hook.replace) ops.push(hook.replace);
  let hasEnv = !!container.env;
  const names = new Set((container.env ?? []).map((e) => e.name));
  for (const item of [hook.add, ...settings(pod, container, config, namespace)]) {
    if (!item || names.has(item.name)) continue;
    ops.push(addTo(`${path}/env`, hasEnv, item));
    hasEnv = true;
    names.add(item.name);
  }
  return { ops };
}

/** The containers to inject: all, or the ones named in wizelens.dev/container-names. */
function targets(pod) {
  const names = pod.metadata?.annotations?.["wizelens.dev/container-names"]?.split(",").map((n) => n.trim()).filter(Boolean);
  return pod.spec.containers.map((c, i) => (!names || names.includes(c.name) ? i : -1)).filter((i) => i >= 0);
}

/** The JSON patch for one pod, or [] when it is not labeled or already injected. */
export function patchFor(pod, config, namespace) {
  const kind = pod?.metadata?.labels?.[LABEL];
  if (!RUNTIMES[kind] || pod.metadata?.annotations?.[INJECTED] || !pod.spec?.containers) return [];
  const ops = [];
  const skipped = [];
  for (const i of targets(pod)) {
    const result = containerPatch(pod, i, kind, config, namespace);
    if (result.skipped) skipped.push(result.skipped);
    else ops.push(...result.ops);
  }
  if (ops.length === 0) return [];
  const annotations = { [INJECTED]: kind, ...(skipped.length ? { "wizelens.dev/skipped": skipped.join("; ") } : {}) };
  const meta = pod.metadata.annotations
    ? Object.entries(annotations).map(([k, v]) => ({ op: "add", path: `/metadata/annotations/${escape(k)}`, value: v }))
    : [{ op: "add", path: "/metadata/annotations", value: annotations }];
  return [...meta, addTo("/spec/volumes", pod.spec.volumes, { name: VOLUME, emptyDir: {} }), addTo("/spec/initContainers", pod.spec.initContainers, copyContainer(kind, config)), ...ops];
}

/** The AdmissionReview answer. Every pod is allowed; labeled ones get a patch. */
export function review(body, config) {
  const request = body?.request ?? {};
  const patch = patchFor(request.object, config, request.namespace);
  const response = { uid: request.uid, allowed: true };
  if (patch.length > 0) Object.assign(response, { patchType: "JSONPatch", patch: Buffer.from(JSON.stringify(patch)).toString("base64") });
  return { apiVersion: "admission.k8s.io/v1", kind: "AdmissionReview", response };
}
