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
