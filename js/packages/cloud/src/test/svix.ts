import { createHmac } from "node:crypto";

/** Sign a body the way Resend (Svix) does, for webhook tests. */
export function signSvix(secret: string, body: string, nowMs: number): Record<string, string> {
  const id = `msg_${nowMs}`;
  const timestamp = String(Math.floor(nowMs / 1000));
  const sig = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` };
}
