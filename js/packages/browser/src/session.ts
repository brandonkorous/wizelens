import { newTraceId, SESSION_STORAGE_KEY } from "@wizeworks/lens-core/internal";

/** Epoch ms with sub-ms precision. */
export const now = () => performance.timeOrigin + performance.now();

/** Read or create the per-tab session id. Storage can be blocked: then the id lasts for this page only. */
export function getSessionId(): string {
  const fresh = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : newTraceId();
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = fresh();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}
