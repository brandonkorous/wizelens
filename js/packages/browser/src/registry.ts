// One WizeLens per page, across copies of this package (an app bundle and a script a server put in the page).

/** Who started an instance: the app's own code, or a script tag a server injected into the page. */
export type InstanceSource = "app" | "inject";

export interface RegisteredInstance {
  source: InstanceSource;
  /** Stop capture and the HUD. Fetch and the other patches come off before this returns its promise. */
  stop(): Promise<void>;
}

export const REGISTRY_KEY: unique symbol = Symbol.for("wizelens.browser");

type Holder = { [REGISTRY_KEY]?: RegisteredInstance };

/** The instance running on this page, from any copy of the package. */
export function registered(): RegisteredInstance | null {
  return (globalThis as Holder)[REGISTRY_KEY] ?? null;
}

export function register(entry: RegisteredInstance): void {
  (globalThis as Holder)[REGISTRY_KEY] = entry;
}

/** Clear the registry when `entry` is still the one in it. */
export function unregister(entry: RegisteredInstance): void {
  if (registered() === entry) delete (globalThis as Holder)[REGISTRY_KEY];
}
