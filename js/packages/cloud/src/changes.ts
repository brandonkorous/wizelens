// New data per project, for open dashboards: settling announces each project it wrote, at most every `GAP_MS`.

const GAP_MS = 2_000;

type Listener = () => void;

/** Who listens to which project, and the last time each project was announced. */
export class Changes {
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #last = new Map<string, number>();
  readonly #pending = new Set<string>();
  readonly #any: ((projectId: string) => void)[] = [];

  /** Call `fn` when the project gets new data. Returns the function that stops it. */
  subscribe(projectId: string, fn: Listener): () => void {
    const set = this.#listeners.get(projectId) ?? new Set();
    this.#listeners.set(projectId, set.add(fn));
    return () => {
      set.delete(fn);
      if (!set.size) this.#listeners.delete(projectId);
    };
  }

  /** Call `fn` for every announced project (caches that drop the project's entries). */
  onAny(fn: (projectId: string) => void): void {
    this.#any.push(fn);
  }

  /** The project has new data. Close calls merge into one, sent `GAP_MS` after the last. */
  emit(projectId: string, now = Date.now()): void {
    const wait = (this.#last.get(projectId) ?? 0) + GAP_MS - now;
    if (wait <= 0) return this.#send(projectId, now);
    if (this.#pending.has(projectId)) return;
    this.#pending.add(projectId);
    setTimeout(() => (this.#pending.delete(projectId), this.#send(projectId, Date.now())), wait).unref();
  }

  /** How many dashboards listen to a project. */
  count(projectId: string): number {
    return this.#listeners.get(projectId)?.size ?? 0;
  }

  #send(projectId: string, now: number): void {
    this.#last.set(projectId, now);
    for (const fn of this.#any) fn(projectId);
    for (const fn of this.#listeners.get(projectId) ?? []) fn();
  }
}
