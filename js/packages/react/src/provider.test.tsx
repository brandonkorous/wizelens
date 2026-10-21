import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { register, registered, type RegisteredInstance } from "@wizeworks/lens-browser";
import { WizeLensProvider, type WizeLensProviderProps } from "./WizeLensProvider.js";
import { huds, resetHuds, stubPage, stubServer } from "./test-hud.js";
import { type TestRoot, testRoot } from "./test-root.js";

vi.mock("@wizeworks/lens-browser", async (load) => ({
  ...(await load<typeof import("@wizeworks/lens-browser")>()),
  mountHud: (await import("./test-hud.js")).fakeMountHud,
}));

const QUIET = { capturePages: false, captureConsole: false, resolveFrames: false } as const;
let urls: string[];
let root: TestRoot;

beforeEach(() => {
  stubPage();
  urls = stubServer();
  resetHuds();
  root = testRoot();
});
afterEach(async () => {
  await root.unmount();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("wizelens.browser")];
  vi.unstubAllGlobals();
});

const settle = () => new Promise((r) => setTimeout(r, 5));
const show = (props: WizeLensProviderProps = {}) => root.render(<WizeLensProvider {...QUIET} {...props} />);
const inject = (): RegisteredInstance & { stop: ReturnType<typeof vi.fn> } => {
  const entry = { source: "inject" as const, stop: vi.fn(async () => {}) };
  register(entry);
  return entry;
};

it("renders only its children on the server: no HUD and no registration", () => {
  expect(renderToString(<WizeLensProvider {...QUIET}>hello</WizeLensProvider>)).toBe("hello");
  expect(huds.mounts).toHaveLength(0);
  expect(registered()).toBeNull();
});

it("mounts the HUD by default, registers as the page's app instance, and reads traces back", async () => {
  await show({ slowMs: 700 });
  expect([...huds.live]).toMatchObject([{ slowMs: 700 }]);
  expect(registered()?.source).toBe("app");
  await settle();
  expect(urls.filter((u) => u.includes("/api/traces?session="))).toHaveLength(1);
});

it("mounts nothing and reads nothing with hud={false}, and still registers", async () => {
  await show({ hud: false });
  await settle();
  expect(huds.mounts).toHaveLength(0);
  expect(urls.filter((u) => u.includes("/api/"))).toEqual([]);
  expect(registered()?.source).toBe("app");
});

it("does nothing at all with enabled={false}", async () => {
  await show({ enabled: false });
  expect(huds.mounts).toHaveLength(0);
  expect(registered()).toBeNull();
});

it("leaves one HUD and one registration after StrictMode's double mount, and none after unmount", async () => {
  await root.render(
    <StrictMode>
      <WizeLensProvider {...QUIET} />
    </StrictMode>,
  );
  expect(huds.mounts).toHaveLength(2);
  expect(huds.live.size).toBe(1);
  expect(registered()?.source).toBe("app");
  await root.unmount();
  expect(huds.live.size).toBe(0);
  expect(registered()).toBeNull();
});

it("stops a script a server injected and takes its place", async () => {
  const injected = inject();
  await show();
  expect(injected.stop).toHaveBeenCalledTimes(1);
  expect(registered()?.source).toBe("app");
  expect(registered()).not.toBe(injected);
});

it("keeps an app instance that already runs in the registry", async () => {
  const app: RegisteredInstance = { source: "app", stop: vi.fn(async () => {}) };
  register(app);
  await show();
  expect(registered()).toBe(app);
  await root.unmount();
  expect(registered()).toBe(app);
  expect(app.stop).not.toHaveBeenCalled();
});

it("takes its HUD away, uninstalls, and leaves the registry when stopped through it", async () => {
  const before = globalThis.fetch;
  await show();
  expect(globalThis.fetch).not.toBe(before);
  const entry = registered()!;
  await entry.stop();
  await root.render(<WizeLensProvider {...QUIET} />);
  expect(huds.live.size).toBe(0);
  expect(globalThis.fetch).toBe(before);
  expect(registered()).toBeNull();
});
