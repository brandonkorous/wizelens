import { useState } from "react";
import { ArrowDown, ArrowUp, LayoutDashboard, Plus } from "lucide-react";
import type { DashPanel, SavedItem } from "@wizeworks/lens-core";
import { useAccount } from "../../data/account";
import { changeSaved, useSavedApi } from "../../data/saved";
import { useApi } from "../../data/useApi";
import { navigate } from "../../routes";
import { Badge } from "../../ui/Badges";
import { DetailHead } from "../../ui/DetailHead";
import { Empty, Panel } from "../../ui/Panel";
import { EMPTY_PANEL, PanelEditor } from "./PanelEditor";
import { PanelView } from "./PanelView";

/** Moves, edits, and removes one chart while editing. */
function PanelActions({ i, count, onMove, onEdit, onRemove }: { i: number; count: number; onMove: (to: number) => void; onEdit: () => void; onRemove: () => void }) {
  return (
    <span className="wl-row-actions">
      <button type="button" className="wl-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => onMove(i - 1)}><ArrowUp size={14} /></button>
      <button type="button" className="wl-icon-btn" aria-label="Move down" disabled={i === count - 1} onClick={() => onMove(i + 1)}><ArrowDown size={14} /></button>
      <button type="button" className="wl-link-btn" onClick={onEdit}>Edit</button>
      <button type="button" className="wl-link-btn wl-text-error" onClick={onRemove}>Remove</button>
    </span>
  );
}

function Board({ d, url, editable, reload }: { d: SavedItem; url: string; editable: boolean; reload: () => void }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const savePanels = (panels: DashPanel[]) => void changeSaved(url, "PATCH", { panels }).then(() => (setEditing(null), reload()), (e: unknown) => setNote(String(e)));
  const move = (from: number, to: number) => {
    const next = [...d.panels];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    savePanels(next);
  };
  const put = (p: DashPanel) => savePanels(editing === "new" ? [...d.panels, { ...p, id: `p${Date.now()}` }] : d.panels.map((x, i) => (i === editing ? p : x)));
  const actions = editable && (
    <>
      <button type="button" className="wl-btn wl-btn-sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Add a chart</button>
      <button type="button" className="wl-btn wl-btn-sm" onClick={() => void changeSaved(url, "PATCH", { shared: !d.shared }).then(reload)}>{d.shared ? "Stop sharing" : "Share with the team"}</button>
      <button type="button" className="wl-link-btn wl-text-error" onClick={() => void changeSaved(url, "DELETE").then(() => navigate("#/dashboards"))}>Delete</button>
    </>
  );
  return (
    <>
      <DetailHead back={["#/dashboards", "All dashboards"]} icon={LayoutDashboard} title={d.name} badge={d.shared ? <Badge tone="info">Shared</Badge> : undefined} actions={actions} stats={[["Charts", String(d.panels.length)], ...(d.ownerName ? [["Made by", d.ownerName] as [string, string]] : [])]} />
      {note && <div className="wl-banner wl-banner-error">{note}</div>}
      {editing !== null && <PanelEditor initial={editing === "new" ? EMPTY_PANEL : d.panels[editing]!} onSave={put} onCancel={() => setEditing(null)} />}
      {d.panels.length === 0 && editing === null && <Panel><Empty title="No charts yet">Add a chart: one or more metrics, drawn as lines, areas, bars, numbers, or a table.</Empty></Panel>}
      <div className="wl-dash-grid">
        {d.panels.map((p, i) => (
          <PanelView key={p.id} panel={p} actions={editable && <PanelActions i={i} count={d.panels.length} onMove={(to) => move(i, to)} onEdit={() => setEditing(i)} onRemove={() => savePanels(d.panels.filter((_, j) => j !== i))} />} />
        ))}
      </div>
    </>
  );
}

/** One dashboard: its charts over the chosen time range; its owner can add, edit, move, and remove them. */
export function DashboardView({ id }: { id: string }) {
  const api = useSavedApi();
  const me = useAccount()?.user?.id ?? "";
  const url = api.url(`/${encodeURIComponent(id)}`);
  const { data, error, reload } = useApi<SavedItem>(api.ready ? url : null);
  if (error) return <Panel><Empty title="This dashboard was not found">{error} Go back to <a href="#/dashboards">all dashboards</a>.</Empty></Panel>;
  if (!data) return <Panel><Empty>Loading…</Empty></Panel>;
  const editable = api.canWrite && (!api.cloud || data.owner === me);
  return <div className="wl-dpage"><Board d={data} url={url} editable={editable} reload={reload} /></div>;
}
