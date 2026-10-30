import { vi } from "vitest";

// Stands in for lens-browser's mountHud in React tests: the element itself is tested in lens-browser.
export interface MountedHud {
  recorder: unknown;
  slowMs: number | undefined;
}

export const huds = { live: new Set<MountedHud>(), mounts: [] as MountedHud[] };

export function fakeMountHud(recorder: unknown, options?: { slowMs?: number }): () => void {
  const hud: MountedHud = { recorder, slowMs: options?.slowMs };
  huds.live.add(hud);
  huds.mounts.push(hud);
  return () => void huds.live.delete(hud);
}

export function resetHuds(): void {
  huds.live.clear();
  huds.mounts.length = 0;
}

/** A WizeLens server that answers every call with an empty JSON list, and the URLs it was asked for. */
export function stubServer(): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    // api/info answers an object, so the HUD's "auto" finds the read API.
    return new Response(url.endsWith("/api/info") ? "{}" : "[]", { status: 200, headers: { "content-type": "application/json" } });
  });
  return urls;
}

/** The page globals the recorder reads. */
export function stubPage(): void {
  vi.stubGlobal("location", new URL("http://app.test/page"));
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
}
