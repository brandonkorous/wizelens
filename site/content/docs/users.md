---
title: Users
description: See who uses your app, who runs into failures and slow requests, and everything one signed-in user did.
---

The **Users** page lists the signed-in users of your app by their requests, failures, and latency. Each user has a page with
everything they did in the time range. It runs in your app, on the hub, and in the cloud.

## Send the user

WizeLens reads the user's id from `enduser.id` and a display name from `user.full_name`.

| Stack | How |
|---|---|
| Node, Next.js | `wizelens.setUser(user.id, { name: user.name })` inside the request |
| .NET | The id comes from `HttpContext.User` (`Identity.Name`) on its own. For a name, set `user.full_name` on the request's activity. |
| React | `<WizeLensUser id={user.id} name={user.name} />`, or the `user` and `userName` props of `WizeLensProvider` |
| Vue, Angular, Svelte, plain JS | `lens.setUser(user.id, { name: user.name })`, or the `user` and `userName` options |
| Java, Python, Go | Set `enduser.id`, and `user.full_name` (or `user.name`), on the server span |

A request whose server span has no user takes it from a browser span of the same trace. So a front end that names the
user only in the browser still fills the Users page, also when it calls an API in another project.

The name is optional. Leave it out to keep only ids, or add `user.full_name` to the project's redacted keys
(**Thresholds and hidden keys → More hidden keys**, in **Settings** on the hub and **Organization** on the cloud) to drop names on the server.

## The Users page

| Column | What it shows |
|---|---|
| User | The name, with the id under it; or the id alone |
| Requests | Requests in the time range |
| Failed | Requests that failed |
| Error Rate | The share that failed |
| Average | Average duration |
| p95 | p95 duration |
| Last seen | When the user last made a request |

**Find a user by id…** narrows the list. A user's [tags](/docs/tags/) show as chips. Click a user to open their page.

## One user

The page shows the name and id, their requests, failed requests, and error groups, and:

- **Requests**, **Error Rate**, **Average**, and **p95** cards.
- **Requests Over Time.**
- **Errors They Hit:** each error group and how many times. Click one to open the error.
- **Slowest Requests** and **Newest Requests:** time, request, status, and duration. Click one to open its trace.
- Links to their **Requests**, **Errors**, and **Logs**, each filtered to this user, and **Tag this**.

## Users everywhere

- **Requests**, **Errors**, and **Logs** filter by user. The user shows as a chip; remove it to see everyone again.
- An error group shows **Users Affected**: how many signed-in users it touched, and the top ones. Insights and endpoints
  count the users they touched too.
- Search with `user:42` for requests and spans, or `@enduser.id:42` for any span. See [Search](/docs/search/).
- **Tag this** on a user page makes a tag for that user's data.
