type HistoryMethod = "pushState" | "replaceState";

/** Call `onChange` when the path changes through the History API or the back and forward buttons. */
export function watchRoutes(onChange: () => void): () => void {
  if (typeof history === "undefined" || typeof location === "undefined") return () => {};
  let last = location.pathname;
  let watching = true;
  const check = () => {
    if (!watching || location.pathname === last) return;
    last = location.pathname;
    onChange();
  };
  const wrap = (name: HistoryMethod) => {
    const original = history[name];
    const wrapper = function (this: History, ...args: Parameters<History[HistoryMethod]>) {
      const result = original.apply(this, args);
      check();
      return result;
    };
    history[name] = wrapper;
    return () => {
      // Leave a method alone when something else wrapped it after us (a WizeLens that took over); ours then passes through.
      if (history[name] === wrapper) history[name] = original;
    };
  };
  const undo = [wrap("pushState"), wrap("replaceState")];
  addEventListener("popstate", check);
  return () => {
    watching = false;
    undo.forEach((u) => u());
    removeEventListener("popstate", check);
  };
}
