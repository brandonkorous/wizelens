import { type FormEvent, type ReactNode, useState } from "react";
import { useOnce } from "../../ui/useOnce";
import { DEFAULT_EXPECT_STATUS, UPTIME_METHODS, type UptimeCheckInput, type UptimeMethod } from "@wizeworks/lens-core";
import { Check, Field, FormRow, SelectField, TextArea } from "../../ui/Field";
import { Modal } from "../../ui/Modal";

const INTERVALS: [string, string][] = [1, 2, 5, 10, 15, 30, 60].map((m) => [String(m), m === 1 ? "Every minute" : m === 60 ? "Every hour" : `Every ${m} minutes`]);
const METHODS: [UptimeMethod, string][] = UPTIME_METHODS.map((m) => [m, m]);

export const EMPTY_CHECK: UptimeCheckInput = { name: "", url: "https://", method: "GET", headers: {}, expectStatus: DEFAULT_EXPECT_STATUS, expectBody: "", intervalMin: 5, timeoutMs: 10_000, env: "", enabled: true };

/** Headers as "Name: value" lines, and back. */
const headersText = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n");
function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const draftOf = (c: UptimeCheckInput | null): UptimeCheckInput => {
  if (!c) return EMPTY_CHECK;
  const { name, url, method, headers, expectStatus, expectBody, intervalMin, timeoutMs, env, enabled } = c;
  return { name, url, method, headers, expectStatus, expectBody, intervalMin, timeoutMs, env, enabled };
};

/** New or changed check: what to call, how often, and what counts as up. */
export function CheckForm({ initial, lead, onSave, onCancel }: { initial: UptimeCheckInput | null; lead?: ReactNode; onSave: (c: UptimeCheckInput) => Promise<string | null>; onCancel: () => void }) {
  const [c, setC] = useState(() => draftOf(initial));
  const [headers, setHeaders] = useState(() => headersText(c.headers));
  const [error, setError] = useState<string | null>(null);
  const { busy, once } = useOnce();
  const set = <K extends keyof UptimeCheckInput>(k: K) => (v: UptimeCheckInput[K]) => setC((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    once(() => onSave({ ...c, headers: parseHeaders(headers) }).then(setError));
  };
  return (
    <Modal title={initial ? `Edit "${initial.name}"` : "New check"} onClose={onCancel} wide>
      <form className="wl-form" onSubmit={submit}>
        {lead}
        <FormRow>
          <Field label="Name" value={c.name} onChange={(e) => set("name")(e.target.value)} placeholder="Website" />
          <Field label="URL" required type="url" value={c.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://example.com/health" />
          <SelectField label="Method" value={c.method} options={METHODS} onChange={set("method")} />
        </FormRow>
        <FormRow>
          <SelectField label="Runs" value={String(c.intervalMin)} options={INTERVALS} onChange={(v) => set("intervalMin")(Number(v))} />
          <Field label="Timeout (seconds)" type="number" min={1} max={60} required value={c.timeoutMs / 1000} onChange={(e) => set("timeoutMs")(Math.round(Number(e.target.value) * 1000))} />
          <Field label="Expected status" value={c.expectStatus} onChange={(e) => set("expectStatus")(e.target.value)} hint='"200", "200-299", or "200,301-302". A 3xx here stops redirects being followed.' />
          <Field label="Environment (optional)" value={c.env} onChange={(e) => set("env")(e.target.value)} placeholder="None" />
        </FormRow>
        <Field label="Response must contain (optional)" value={c.expectBody} onChange={(e) => set("expectBody")(e.target.value)} placeholder='"status":"ok"' />
        <TextArea label="Headers (optional)" value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="Authorization: Bearer ..." hint='One "Name: value" per line. Secret values show as [redacted]; leave them as they are to keep them.' />
        <Check label="On" checked={c.enabled} onChange={(e) => set("enabled")(e.target.checked)} />
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>Save check</button>
        </div>
      </form>
    </Modal>
  );
}
