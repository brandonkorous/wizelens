import { useState } from "react";
import { Star } from "lucide-react";
import { changeSaved, useSavedApi } from "../data/saved";
import { useRoute } from "../routes";
import { Check, Field } from "../ui/Field";
import { Menu } from "./Menu";

/** Pages a view can be saved for: list pages with filters, not account screens. */
const SAVABLE = /^#\/(|overview|search|requests|traces|database|rendering|errors|logs|metrics|services|insights|slos|dashboards)(\/|\?|$)/;

function SaveForm({ close }: { close: () => void }) {
  const api = useSavedApi();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const save = () => {
    const href = location.hash || "#/";
    void changeSaved(api.url(), "POST", { kind: href.startsWith("#/search") ? "search" : "view", name: name.trim(), href, shared: !api.cloud || shared }).then(
      () => close(),
      (e: unknown) => setNote(e instanceof Error ? e.message : String(e)),
    );
  };
  return (
    <form className="wl-save-view" onSubmit={(e) => (e.preventDefault(), save())}>
      <Field label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout errors this week" />
      {api.cloud && <Check label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />}
      <p className="wl-muted wl-small">Saves this page with its filters and time range. It shows under Saved in the sidebar.</p>
      {note && <p className="wl-text-error wl-small">{note}</p>}
      <button type="submit" className="wl-btn wl-btn-primary" disabled={!name.trim()}>Save view</button>
    </form>
  );
}

/** A star in the top bar: save the page you are on, with its filters and time range. */
export function SaveView() {
  const api = useSavedApi();
  useRoute();
  if (!api.on || !api.canWrite || !SAVABLE.test(location.hash || "#/")) return null;
  return <Menu label={<Star size={18} aria-hidden="true" />} title="Save this view">{(close) => <SaveForm close={close} />}</Menu>;
}
