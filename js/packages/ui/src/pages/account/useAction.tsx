import { type FormEvent, useCallback, useState } from "react";
import { errorText, isNotFresh, signOut } from "../../data/account";

export interface Action {
  busy: boolean;
  error: string | null;
  note: string | null;
  /** Better Auth wants a recent sign-in first. */
  stale: boolean;
  /** Run a change. Shows `done` after it works; returns false when it failed. */
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
  setNote: (note: string | null) => void;
}

/** Busy, error, and done state for one panel's changes. */
export function useAction(): Action {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      if (done) setNote(done);
      return true;
    } catch (e) {
      if (isNotFresh(e)) setStale(true);
      else setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, note, stale, run, setNote };
}

/** "For safety, sign in again first." (or `text`) with a button that signs out, so the person can sign in again. */
export function FreshNotice({ text = "For safety, sign in again first." }: { text?: string }) {
  return (
    <div className="wl-banner wl-banner-info" role="status">
      {text}{" "}
      <button type="button" className="wl-link-btn" onClick={() => void signOut()}>Sign out and sign in again</button>
    </div>
  );
}

/** The error, the "done" note, or the sign-in-again notice of an action. */
export function ActionNotes({ a }: { a: Action }) {
  return (
    <>
      {a.stale && <FreshNotice />}
      {a.error && <div className="wl-banner wl-banner-error" role="alert">{a.error}</div>}
      {a.note && <p className="wl-muted wl-small" role="status">{a.note}</p>}
    </>
  );
}

/** A form submit handler that gets the values by field name; check boxes are "on" when checked. */
export const onForm = (handle: (values: Record<string, string>, form: HTMLFormElement) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  handle(Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)])), e.currentTarget);
};
