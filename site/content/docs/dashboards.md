---
title: Dashboards
description: Your own pages of metric charts, with several metrics per chart, filtered and split by any attribute, drawn as lines, areas, bars, numbers, or a table.
---

A dashboard is your own page of metric charts: runtime metrics such as CPU and memory, request times, and the counters your
app sends. Dashboards run on [the local hub](/docs/hub/) and on [WizeLens Cloud](/docs/cloud/). Open **Dashboards** in the
menu and choose **New dashboard**.

## Make one

Give it a **Name** and choose **Make it**. On the cloud, tick **Share with the team** to show it to everyone in the
project; otherwise it is yours. On the hub every dashboard is shared with the project.

The list shows each dashboard, its number of charts, whether it is **Shared** or **Only you**, who made it, and when it
changed.

## Add a chart

On a dashboard, choose **Add a chart**:

| Setting | What it does |
|---|---|
| **Title (optional)** | The chart's title |
| **Draw as** | **Lines**, **Areas**, **Stacked bars**, **Numbers**, or **Table** |
| **Width** | **Half width** or **Full width** |
| **Metric 1** to **Metric 6** | The metrics to draw. **Add a metric** adds one, up to six. Names come from your data as you type. |
| **Statistic** | For each metric: Default, p50, p95, p99, or Average |
| **Split lines by** | One line per value of an attribute, such as `service.name`; or Nothing (one line per series) |
| **Filter key**, **Filter value** | Pick an attribute and a value to keep only that series |
| **Only (key=value, comma-separated)** | The filters as text, for example `service.name=api,http.route=/orders` |

**Save chart** adds it. Every chart follows the time range in the top bar.

A **Table** chart lists each series with **Now**, **Lowest**, **Highest**, and **Average**. **Numbers** shows the newest
value of up to four series, each with a small trend line.

## Change it

| Action | What it does |
|---|---|
| **Move up**, **Move down** | Change a chart's place |
| **Edit**, **Remove** | Change or remove a chart |
| **Share with the team**, **Stop sharing** | Cloud: show it to the project, or keep it to yourself |
| **Delete** | Delete the dashboard |

On the cloud, only the person who made a dashboard changes it. They, an admin, or an owner can delete a shared one.
Viewers see shared dashboards.

## Elsewhere

- **Ctrl K** finds dashboards by name.
- The **Metrics** page charts one metric at a time, split by any attribute. **Alert on this** on a metric chart opens a
  new [alert rule](/docs/alerts/) for it.
