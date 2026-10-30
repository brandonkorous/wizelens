import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hud } from "./Hud.js";
import { collectCommit, type ComponentStats, type FiberLike } from "./fiber-stats.js";
import { createReactRecorder as createRecorder } from "./react-capture.js";
import { huds, resetHuds, stubPage } from "./test-hud.js";
import { testRoot } from "./test-root.js";

vi.mock("@wizeworks/lens-browser", async (load) => ({
  ...(await load<typeof import("@wizeworks/lens-browser")>()),
  mountHud: (await import("./test-hud.js")).fakeMountHud,
}));

beforeEach(() => {
  stubPage();
  resetHuds();
});
afterEach(() => vi.unstubAllGlobals());

it("renders nothing on the server and mounts nothing there, so hydration matches", () => {
  expect(renderToString(<Hud recorder={createRecorder()} />)).toBe("");
  expect(huds.mounts).toHaveLength(0);
});

it("mounts the shared HUD for its recorder after mount, and takes it away on unmount", async () => {
  const recorder = createRecorder();
  const root = testRoot();
  await root.render(<Hud recorder={recorder} slowMs={900} />);
  expect([...huds.live]).toEqual([{ recorder, slowMs: 900 }]);
  await root.unmount();
  expect(huds.live.size).toBe(0);
});

it("leaves one HUD after StrictMode's double mount", async () => {
  const root = testRoot();
  await root.render(
    <StrictMode>
      <Hud recorder={createRecorder()} />
    </StrictMode>,
  );
  expect(huds.live.size).toBe(1);
  await root.unmount();
  expect(huds.live.size).toBe(0);
});

it("moves to a new slow mark or recorder, still with one HUD", async () => {
  const [a, b] = [createRecorder(), createRecorder()];
  const root = testRoot();
  await root.render(<Hud recorder={a} slowMs={500} />);
  await root.render(<Hud recorder={a} slowMs={800} />);
  await root.render(<Hud recorder={b} slowMs={800} />);
  expect([...huds.live]).toEqual([{ recorder: b, slowMs: 800 }]);
  await root.unmount();
});

it("is skipped by the render profiler", () => {
  const fiber = (type: unknown, child: FiberLike | null = null): FiberLike => ({ tag: 0, type, child, sibling: null, alternate: null, memoizedProps: {}, memoizedState: null, flags: 1 });
  const out: ComponentStats = new Map();
  collectCommit({ ...fiber(null), tag: 3, child: fiber(Hud) }, out);
  expect(out.size).toBe(0);
});
