---
title: The HUD
description: A small card in the corner of every page that shows the latest request as you work.
---

The HUD comes with [`@wizeworks/lens-react`](/docs/react/). It shows the latest request: **Total**, **Server**,
**Database**, and **Render** time, one bar that splits them, and the SQL, fetch, and insight counts.

![The HUD card after a request that ran 17 queries and 8 fetches and found 3 insights](/shots/hud-card.png)

## One color tells you the state

| Color | Means |
|---|---|
| Blue | Information |
| Green | Fast, no issues |
| Amber | It worked, but there is something to improve |
| Orange | Slow, a 4xx answer, or a 5xx you [marked as expected](/docs/dashboard/#answers-you-expect) |
| Red | It failed |
| Gray | No data |

Requests at or over `slowMs` (default 500 ms) show as orange.

## Look closer

- **Hover** a number for a quick look. Database shows each query's time, the slowest, and the average. Server splits its own
  code, its own queries, and calls to other services.
- **Click** for a small panel: the split, the first rows of the timeline, the request's errors, insights, and security
  risks (the top three of each), and this page's Web Vitals.
- **Every "view all" link** and every count opens the full dashboard in a new tab, right on that request.

![The HUD panel open on a page of the sample shop, with the timeline and two N+1 insights](/shots/hud-panel.jpg)

## Stay out of the way

- Minimize it to the aperture mark. Its center dot keeps the health color.
- Pin a request, or follow the newest one live.
- **Settings** (the gear) turns Live on or off, shows the `slowMs` in effect, the endpoint, and the session, clears
  the request list, and opens the dashboard.
- It remembers its state across page refreshes.

Turn it off with `hud={false}` on `WizeLensProvider`.
