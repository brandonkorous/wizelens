import { expect, it } from "vitest";
import { signSvix } from "../test/svix.js";
import { verifySvix } from "./svix.js";

// The test vector from Svix's manual verification guide.
const SECRET = "whsec_plJ3nmyCDGBKInavdOK15jsl";
const BODY = '{"event_type":"ping","data":{"success":true}}';
const AT = 1731705121;
const headers = { id: "msg_loFOjxBNrRLzqYUf", timestamp: String(AT), signature: "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=" };

it("accepts Svix's own test vector", () => {
  expect(verifySvix(SECRET, headers, BODY, AT * 1000)).toBe(true);
});

it("finds the good signature among several", () => {
  expect(verifySvix(SECRET, { ...headers, signature: `v1,bm90IHRoaXM= ${headers.signature}` }, BODY, AT * 1000)).toBe(true);
});

it("refuses a changed body, a wrong secret, a v2 signature, and missing headers", () => {
  expect(verifySvix(SECRET, headers, BODY.replace("true", "false"), AT * 1000)).toBe(false);
  expect(verifySvix(`whsec_${Buffer.from("another key").toString("base64")}`, headers, BODY, AT * 1000)).toBe(false);
  expect(verifySvix(SECRET, { ...headers, signature: headers.signature.replace("v1,", "v2,") }, BODY, AT * 1000)).toBe(false);
  expect(verifySvix(SECRET, { ...headers, id: undefined }, BODY, AT * 1000)).toBe(false);
});

it("refuses a signature older or newer than 5 minutes", () => {
  expect(verifySvix(SECRET, headers, BODY, (AT + 299) * 1000)).toBe(true);
  expect(verifySvix(SECRET, headers, BODY, (AT + 301) * 1000)).toBe(false);
  expect(verifySvix(SECRET, headers, BODY, (AT - 301) * 1000)).toBe(false);
});

it("signs test bodies the way the check expects", () => {
  const h = signSvix(SECRET, BODY, AT * 1000);
  expect(verifySvix(SECRET, { id: h["svix-id"], timestamp: h["svix-timestamp"], signature: h["svix-signature"] }, BODY, AT * 1000)).toBe(true);
});
