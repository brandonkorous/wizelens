/** A line added to the end of matching ES modules. It runs inside the module, so it can read and replace its bindings. */
export interface EsmPatch {
  pattern: RegExp;
  code: string;
}

interface LoadResult {
  format?: string | null;
  source?: unknown;
}

function text(source: unknown): string | null {
  if (typeof source === "string") return source;
  if (source instanceof Uint8Array) return new TextDecoder().decode(source);
  return null;
}

/** The load result with every matching patch added to an ES module's source. */
export function transformSource<T extends LoadResult>(url: string, result: T, patches: readonly EsmPatch[]): T {
  if (result.format !== "module" || patches.length === 0) return result;
  const lines = patches.filter((p) => p.pattern.test(url)).map((p) => p.code);
  const source = lines.length > 0 ? text(result.source) : null;
  return source === null ? result : { ...result, source: `${source}\n;${lines.join("\n;")}\n` };
}

/** A patch that hands the module's `binding` to the auto hook `id`. With `replace`, a returned value takes its place. */
export function esmPatch(pattern: RegExp, id: string, binding: string, replace = false): EsmPatch {
  const value = `typeof ${binding} === "undefined" ? undefined : ${binding}`;
  const call = `globalThis[Symbol.for("wizeworks.wizelens.auto.esm")]?.(${JSON.stringify(id)}, ${value})`;
  // The try keeps the module running when a new version renamed the binding.
  return { pattern, code: `try { ${replace ? `${binding} = ${call} ?? ${binding}` : call}; } catch {}` };
}
