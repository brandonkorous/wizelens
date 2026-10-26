import { afterEach, expect, it } from "vitest";
import { drainReactStats, installReactHook } from "./react-hook.js";

// The hook must be in place before react-dom loads, as in a page.
installReactHook(globalThis);
const React = await import("react");
const { testRoot } = await import("./test-root.js");

afterEach(() => void drainReactStats());

const sumRenders = (s: ReturnType<typeof drainReactStats>["stats"]) => [...s.values()].reduce((t, x) => t + x.renders, 0);

it("counts only commits that rendered an app component", async () => {
  let bump = () => {};
  function Counter() {
    const [n, set] = React.useState(0);
    bump = () => set((x) => x + 1);
    void n;
    return null;
  }
  const Page = () => React.createElement(Counter);
  const root = testRoot();
  const tree = React.createElement(Page);
  await root.render(tree);
  drainReactStats();
  // The same tree again: React commits, but no component of the app renders.
  for (let i = 0; i < 5; i++) await root.render(tree);
  expect(drainReactStats().commits).toBe(0);
  for (let i = 0; i < 3; i++) await React.act(async () => bump());
  const after = drainReactStats();
  expect(after).toMatchObject({ commits: 3 });
  expect(sumRenders(after.stats)).toBe(3);
  await root.unmount();
});
