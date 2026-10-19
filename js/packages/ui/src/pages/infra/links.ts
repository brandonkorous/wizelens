import { hrefTo } from "../../routes";

/** The Hosts page of one host. */
export const hostHref = (name: string) => hrefTo("hosts", [encodeURIComponent(name)]);

/** The Kubernetes page of one node. */
export const nodeHref = (name: string) => hrefTo("kubernetes", ["node", encodeURIComponent(name)]);

/** The Kubernetes page of one pod. A pod with no namespace uses "-". */
export const podHref = (ns: string, name: string) => hrefTo("kubernetes", ["pod", encodeURIComponent(ns || "-"), encodeURIComponent(name)]);

/** The Kubernetes page with only one workload's pods ("namespace/Kind/name"). */
export const workloadHref = (key: string) => hrefTo("kubernetes", [], { view: "pods", workload: key });

/** A service's own page. */
export { serviceHref } from "../services/serviceParts";

/** A path part back to text. */
export const partOf = (v: string | undefined): string => {
  try {
    return decodeURIComponent(v ?? "");
  } catch {
    return v ?? "";
  }
};
