import { Select } from "../../ui/Controls";

const DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365, 400];

/** A number of days up to `max`, or none (`fallback` names what then applies). The current value always shows. */
export function DaysSelect({ label, value, max, fallback, onChange }: { label: string; value: number | null; max: number; fallback: string; onChange: (days: number | null) => void }) {
  const days = [...new Set([...DAYS.filter((d) => d <= max), ...(value === null ? [] : [value])])].sort((a, b) => a - b);
  const options: [string, string][] = [["", fallback], ...days.map((d): [string, string] => [String(d), `${d} ${d === 1 ? "day" : "days"}`])];
  return <Select small label={label} value={value === null ? "" : String(value)} options={options} onChange={(v) => onChange(v ? Number(v) : null)} />;
}
