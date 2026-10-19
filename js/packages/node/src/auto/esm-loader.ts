// Loader hooks for Node versions without module.registerHooks. They run on the loader thread and only edit source.
import { type EsmPatch, transformSource } from "./esm-source.js";

interface LoadResult {
  format?: string | null;
  source?: unknown;
}
type NextLoad = (url: string, context: unknown) => Promise<LoadResult>;

let patches: EsmPatch[] = [];

export function initialize(data: EsmPatch[] | undefined): void {
  patches = data ?? [];
}

export async function load(url: string, context: unknown, next: NextLoad): Promise<LoadResult> {
  return transformSource(url, await next(url, context), patches);
}
