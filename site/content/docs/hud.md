---
title: The HUD
description: A small card in the corner of every page that shows the latest request as you work.
---

The HUD comes with [`@wizeworks/lens-react`](/docs/react/). It shows the latest request: **Total**, **Server**,
**Database**, and **Render** time, one bar that splits them, and the SQL, fetch, and insight counts.

## One color tells you the state

| Color | Means |
|---|---|
| Blue | Information |
| Green | Fast, no issues |
| Amber | It worked, but there is something to improve |
| Orange | Slow, or a 4xx answer |
| Red | It failed |
| Gray | No data |

Requests at or over `slowMs` (default 500 ms) show as orange.

## Look closer

- **Hover** a number for a quick look. Database shows each query's time, the slowest, and the average. Server splits its own
  code, its own queries, and calls to other services.
- **Click** for a small panel: the split, the first rows of the timeline, the top insights, and this page's Web Vitals.
- **Every "view all" link** and every count opens the full dashboard in a new tab, right on that request.

## Stay out of the way

- Minimize it to the aperture mark. Its center dot keeps the health color.
- Pin a request, or follow the newest one live.
- It remembers its state across page refreshes.

Turn it off with `hud={false}` on `WizeLensProvider`.
