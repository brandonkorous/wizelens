import { expect, it } from "vitest";
import { roomHeight } from "./room.js";

it("makes room for the card only on a page that scrolls", () => {
  expect(roomHeight(152, 5278, 900)).toBe(168);
  expect(roomHeight(152, 900, 900)).toBe(0);
  expect(roomHeight(null, 5278, 900)).toBe(0);
});
