import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakeElement, stubHudDom } from "../test-hud-dom.js";
import { h, morphChildren, s } from "./dom.js";

beforeEach(() => void stubHudDom());
afterEach(() => vi.unstubAllGlobals());

const root = () => new FakeElement("div") as unknown as HTMLElement;

it("builds elements with attributes, listeners, and nested children", () => {
  const onClick = vi.fn();
  const el = h("button", { class: "wl-btn", title: "Go", hidden: false, "aria-x": null, onClick }, "Run ", ["a", null, false, "", 2], s("svg", { width: 10 }));
  expect(el.getAttribute("class")).toBe("wl-btn");
  expect(el.hasAttribute("hidden")).toBe(false);
  expect(el.hasAttribute("aria-x")).toBe(false);
  expect(el.textContent).toBe("Run a2");
  expect(el.childNodes[el.childNodes.length - 1]!.nodeName).toBe("svg");
  (el as unknown as FakeElement).fire("click");
  expect(onClick).toHaveBeenCalledOnce();
});

it("patches in place: same nodes, new text and attributes, so focus and hover stay", () => {
  const parent = root();
  morphChildren(parent, [h("div", { class: "wl-card", title: "a" }, h("span", null, "one"), h("button", { type: "button" }, "x"))]);
  const card = parent.firstChild!;
  const button = card.childNodes[1]!;
  morphChildren(parent, [h("div", { class: "wl-card wl-h-critical" }, h("span", null, "two"), h("button", { type: "button" }, "x"))]);
  expect(parent.firstChild).toBe(card);
  expect(card.childNodes[1]).toBe(button);
  expect((card as HTMLElement).getAttribute("class")).toBe("wl-card wl-h-critical");
  expect((card as HTMLElement).hasAttribute("title")).toBe(false);
  expect(card.textContent).toBe("twox");
});

it("keeps keyed nodes when a sibling opens above them, and drops what is gone", () => {
  const parent = root();
  morphChildren(parent, [h("div", { key: "card" }, "card")]);
  const card = parent.firstChild;
  morphChildren(parent, [h("section", { key: "details" }, "details"), h("div", { key: "card" }, "card")]);
  expect(parent.childNodes[1]).toBe(card);
  expect(parent.childNodes[0]!.textContent).toBe("details");
  morphChildren(parent, [h("div", { key: "card" }, "card")]);
  expect(parent.childNodes).toHaveLength(1);
  expect(parent.firstChild).toBe(card);
});

it("replaces a node whose tag changed, and keeps listeners from the first build", () => {
  const parent = root();
  const first = vi.fn();
  const second = vi.fn();
  morphChildren(parent, [h("span", { class: "wl-count" }, "3 SQL"), h("button", { onClick: first })]);
  const button = parent.childNodes[1] as unknown as FakeElement;
  morphChildren(parent, [h("a", { class: "wl-count", href: "/x" }, "3 SQL"), h("button", { onClick: second })]);
  expect(parent.firstChild!.nodeName).toBe("A");
  expect(parent.childNodes[1]).toBe(button);
  button.fire("click");
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
});

it("syncs a checkbox's checked state", () => {
  const parent = root();
  morphChildren(parent, [h("input", { type: "checkbox", checked: true })]);
  const box = parent.firstChild as HTMLInputElement;
  expect(box.checked).toBe(true);
  morphChildren(parent, [h("input", { type: "checkbox", checked: false })]);
  expect(parent.firstChild).toBe(box);
  expect(box.checked).toBe(false);
});
