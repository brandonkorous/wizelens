import { useMemo } from "react";
import { X } from "lucide-react";
import { displayService } from "@wizeworks/lens-core";
import { useData } from "../data/hooks";
import { useServiceScope } from "../data/prefs";
import { parseRoute, setQuery } from "../routes";
import { Select } from "./Controls";

/** Service names the dashboard knows, as it shows them: from the hub or cloud registry, the loaded traces, and `more`. */
export function useServiceNames(more: readonly string[] = []): string[] {
  const { registry, traces } = useData();
  const key = more.join("\n");
  return useMemo(() => {
    const raw = [...(registry?.services ?? []).map((s) => s.service), ...traces.flatMap((t) => t.services)];
    return [...new Set([...raw.map(displayService), ...(key ? key.split("\n") : [])])].sort();
  }, [registry, traces, key]);
}

/** Pick the service every page filters by. A link's own `service` gives way to the pick (on Services it names a row, so it stays). */
export function useSetService(): (service: string) => void {
  const [, setService] = useServiceScope();
  return (service) => {
    setService(service);
    if (parseRoute(window.location.hash).page !== "services") setQuery({ service: null, page: null });
  };
}

/** The shared service filter on a page's filter bar. `value` is the service the page shows now. */
export function ServiceSelect({ value, services = [] }: { value: string; services?: readonly string[] }) {
  const names = useServiceNames(value ? [...services, value] : services);
  const pick = useSetService();
  return <Select label="Service" value={value} onChange={pick} options={[["", "All Services"], ...names.map((n): [string, string] => [n, n])]} />;
}

/** A chip in the top bar while a service is chosen, to clear it from any page. */
export function ServiceChip() {
  const [service] = useServiceScope();
  const pick = useSetService();
  if (!service) return null;
  return (
    <button type="button" className="wl-scope-chip" onClick={() => pick("")} title="Show all services">
      <span className="wl-truncate">{service}</span>
      <X size={14} aria-hidden="true" />
    </button>
  );
}
