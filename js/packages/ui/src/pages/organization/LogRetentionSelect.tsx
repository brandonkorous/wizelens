import { Select } from "../../ui/Controls";

const DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365, 400];

/** How long a project keeps log lines: its own number of days, or the organization's retention (the traces'). */
export function LogRetentionSelect({ value, traceDays, onChange }: { value: number | null; traceDays: number; onChange: (days: number | null) => void }) {
  const days = [...new Set([...DAYS, ...(value === null ? [] : [value])])].sort((a, b) => a - b);
  const options: [string, string][] = [["", `Like traces (${traceDays} days)`], ...days.map((d): [string, string] => [String(d), `${d} ${d === 1 ? "day" : "days"}`])];
  return <Select small label="Logs kept" value={value === null ? "" : String(value)} options={options} onChange={(v) => onChange(v ? Number(v) : null)} />;
}
