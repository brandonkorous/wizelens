// Errors frameworks throw on purpose (not found, redirects, a 4xx answer): control flow, not exceptions. The rule lives in core.
import { isClientApiError, isNextControlFlow } from "@wizeworks/lens-core";

export { dropControlFlow, isClientApiError, isNextControlFlow } from "@wizeworks/lens-core";

/** A thrown value that is control flow: a Next.js signal, or a Better Auth 4xx. */
export function isControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown; digest?: unknown; statusCode?: unknown };
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return isNextControlFlow(str(e.name), str(e.message), str(e.digest)) || isClientApiError(e.name, e.statusCode);
}
