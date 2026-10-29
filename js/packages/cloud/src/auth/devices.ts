import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";

/** A signed-in device as the Devices page shows it: no session token, so it needs no recent sign-in. */
export interface DeviceRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `GET /wizelens/devices`: where the person is signed in. Better Auth's list carries tokens, so it wants a sign-in from the last 15 minutes; this one does not. Signing a device out still does. */
const devicesEndpoint = () =>
  createAuthEndpoint("/wizelens/devices", { method: "GET", use: [sessionMiddleware] }, async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.context.internalAdapter.listSessions(ctx.context.session.user.id);
    const rows: DeviceRow[] = sessions
      .filter((s) => new Date(s.expiresAt).getTime() > now)
      .map((s) => ({ id: s.id, userAgent: s.userAgent ?? null, ipAddress: s.ipAddress ?? null, createdAt: s.createdAt, updatedAt: s.updatedAt }));
    return ctx.json(rows);
  });

/** The Devices page's list, readable at any time while signed in. */
export function devicesPlugin(): BetterAuthPlugin {
  return { id: "wizelens-devices", endpoints: { wizelensDevices: devicesEndpoint() } } as BetterAuthPlugin;
}
