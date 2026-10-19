import { beforeEach, expect, it, vi } from "vitest";
import { createRecorder } from "./recorder.js";
import { getSessionId } from "./session.js";
import { storage, stubPage } from "./test-env.js";

beforeEach(stubPage);

it("keeps one session id per tab", () => {
  storage.clear();
  const first = getSessionId();
  expect(first).toMatch(/[0-9a-f-]{32,36}/);
  expect(getSessionId()).toBe(first);
  expect(createRecorder().sessionId).toBe(first);
  storage.clear();
  expect(getSessionId()).not.toBe(first);
});

it("works when storage is blocked", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked });
  expect(getSessionId()).toBeTruthy();
});
