import { cleanSearchParams, logSearchText } from "@wizeworks/lens-core/internal";
import { Field, FormRow, SelectField } from "../../ui/Field";

const LEVELS: [string, string][] = [["", "Any level"], ["debug", "Debug and up"], ["info", "Info and up"], ["warn", "Warnings and up"], ["error", "Errors and up"], ["critical", "Critical only"]];
const ORIGINS: [string, string][] = [["", "In and outside requests"], ["request", "In requests"], ["outside", "Outside requests"]];

/** The log search a log count rule counts: the Logs page filters. "Alert on this search" fills them in. */
export function LogRuleFields({ search, onChange }: { search: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const set = (k: string) => (v: string) => onChange(cleanSearchParams({ ...search, [k]: v }));
  return (
    <>
      <FormRow>
        <SelectField label="Level" value={search.level ?? ""} options={LEVELS} onChange={set("level")} />
        <Field label="Service (optional)" value={search.service ?? ""} onChange={(e) => set("service")(e.target.value)} placeholder="All" />
        <Field label="Text (optional)" value={search.q ?? ""} onChange={(e) => set("q")(e.target.value)} placeholder="timed out" />
        <SelectField label="Written" value={search.origin ?? ""} options={ORIGINS} onChange={set("origin")} />
      </FormRow>
      <p className="wl-muted wl-small">
        Counts the log lines that match {logSearchText(search) ? <strong>{logSearchText(search)}</strong> : "every line"} over the window.
        {(search.category || search.pattern) && " The category and pattern from the Logs page apply too."}
      </p>
    </>
  );
}
