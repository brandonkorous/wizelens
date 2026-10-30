// The provider's place in lens-browser's one-instance-per-page registry.
import { type Recorder, register, registered, type RegisteredInstance, unregister } from "@wizeworks/lens-browser/internal";

/** Install `recorder` as the page's app instance: an injected one stops first, and an app instance already registered keeps its place. Returns the uninstall. */
export function claimPage(recorder: Recorder, onStop: () => void): () => void {
  const held = registered();
  // Its fetch patch and HUD come off before stop returns its promise, so they are gone before this install.
  if (held?.source === "inject") void held.stop();
  const uninstall = recorder.install();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    unregister(entry);
    uninstall();
  };
  const entry: RegisteredInstance = {
    source: "app",
    async stop() {
      release();
      onStop();
      await recorder.flush();
    },
  };
  if (held?.source !== "app") register(entry);
  return release;
}
