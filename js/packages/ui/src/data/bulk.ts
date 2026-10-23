// Many changes sent in parts, one part after another, so a long list never hits one request's size or time limit.

/** What a run did: every result so far and, when a part failed, why and the items not sent. */
export interface PartsRun<T, R> {
  done: R[];
  error: string | null;
  left: T[];
}

/** Send `items` in parts of `size`. A failure stops the rest; the parts before it stay done. */
export async function inParts<T, R>(items: readonly T[], size: number, send: (part: T[]) => Promise<R[]>, progress?: (done: number) => void): Promise<PartsRun<T, R>> {
  const done: R[] = [];
  let sent = 0;
  for (let i = 0; i < items.length; i += size) {
    const part = items.slice(i, i + size);
    try {
      done.push(...(await send(part)));
      sent += part.length;
      progress?.(sent);
    } catch (err) {
      return { done, error: err instanceof Error ? err.message : String(err), left: items.slice(i) };
    }
  }
  return { done, error: null, left: [] };
}

/** What a one-by-one run did: the items done, and each item that failed with why. */
export interface EachRun<T> {
  done: T[];
  failed: { item: T; error: string }[];
}

/** Send `items` one at a time; a failure is noted and the rest still go. For hosts or lists with no call for many at once. */
export async function eachOne<T>(items: readonly T[], send: (item: T) => Promise<unknown>, progress?: (done: number) => void): Promise<EachRun<T>> {
  const out: EachRun<T> = { done: [], failed: [] };
  for (const item of items) {
    try {
      await send(item);
      out.done.push(item);
    } catch (err) {
      out.failed.push({ item, error: err instanceof Error ? err.message : String(err) });
    }
    progress?.(out.done.length + out.failed.length);
  }
  return out;
}

/** "Changed 4 of 5. Failed: name: why." for a one-by-one run, or null when all went. */
export function eachText<T>(run: EachRun<T>, total: number, verb: string, nameOf: (item: T) => string): string | null {
  if (!run.failed.length) return null;
  const first = run.failed.slice(0, 3).map((f) => `${nameOf(f.item)}: ${f.error}`).join(" ");
  return `${verb} ${run.done.length} of ${total}. Failed: ${first}${run.failed.length > 3 ? ` And ${run.failed.length - 3} more.` : ""}`;
}
