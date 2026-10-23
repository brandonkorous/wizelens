import { CopyButton } from "./Badges";

export interface OneTimeSecretsProps {
  /** CSV of the secrets, for the download and the copy button. */
  csv: string;
  saveCsv: () => void;
  saveJson: () => void;
  /** Called on any save or copy, so closing no longer warns. */
  onSaved: () => void;
}

/** New secrets are shown once: the warning, and the ways to keep them. */
export function OneTimeSecrets({ csv, saveCsv, saveJson, onSaved }: OneTimeSecretsProps) {
  const save = (fn: () => void) => () => (fn(), onSaved());
  return (
    <>
      <div className="wl-banner wl-banner-warning">
        <strong>Save these keys now. They are shown only this once.</strong> WizeLens keeps only a hash of each key, so no one can show them again. If a key is lost, rotate it.
      </div>
      <div className="wl-row-actions wl-import-save">
        <button type="button" className="wl-btn wl-btn-primary" onClick={save(saveCsv)}>Download keys (CSV)</button>
        <button type="button" className="wl-btn" onClick={save(saveJson)}>Download keys (JSON)</button>
        <span onClickCapture={onSaved}><CopyButton text={csv} label="Copy all as CSV" asLink /></span>
      </div>
    </>
  );
}

/** A plain progress bar with what is done. */
export function PartsProgress({ done, total, what }: { done: number; total: number; what: string }) {
  return (
    <div className="wl-import-progress" role="status">
      <progress max={total} value={done} />
      <span>{what} {done} of {total}. Keep this page open.</span>
    </div>
  );
}
