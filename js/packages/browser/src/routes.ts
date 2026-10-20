type HistoryMethod = "pushState" | "replaceState";

/** Call `onChange` when the path changes through the History API or the back and forward buttons. */
export function watchRoutes(onChange: () => void): () => void {
  if (typeof history === "undefined" || typeof location === "undefined") return () => {};
  let last = location.pathname;
  const check = () => {
    if (location.pathname === last) return;
    last = location.pathname;
    onChange();
  };
  const wrap = (name: HistoryMethod) => {
    const original = history[name];
    history[name] = function (this: History, ...args: Parameters<History[HistoryMethod]>) {
      const result = original.apply(this, args);
      check();
      return result;
    };
    return () => {
      history[name] = original;
    };
  };
  const undo = [wrap("pushState"), wrap("replaceState")];
  addEventListener("popstate", check);
  return () => {
    undo.forEach((u) => u());
    removeEventListener("popstate", check);
  };
}
