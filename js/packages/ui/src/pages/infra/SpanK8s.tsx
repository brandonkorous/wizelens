import { Box, Server } from "lucide-react";
import type { Attributes } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { nodeHref, podHref } from "./links";

const text = (a: Attributes, k: string) => (typeof a[k] === "string" && a[k] ? String(a[k]) : "");

/** Links from a span to its Kubernetes pod and node, when the collector put them on it (k8s.pod.name, k8s.node.name). */
export function SpanK8s({ attributes }: { attributes: Attributes }) {
  const infra = useHost().has("infra");
  const pod = text(attributes, "k8s.pod.name");
  const node = text(attributes, "k8s.node.name");
  if (!infra || (!pod && !node)) return null;
  return (
    <div className="wl-span-k8s">
      {pod && (
        <a className="wl-infra-chip" href={podHref(text(attributes, "k8s.namespace.name"), pod)} title="Open this pod">
          <Box size={12} aria-hidden="true" /> Pod {pod}
        </a>
      )}
      {node && (
        <a className="wl-infra-chip" href={nodeHref(node)} title="Open this node">
          <Server size={12} aria-hidden="true" /> Node {node}
        </a>
      )}
    </div>
  );
}
