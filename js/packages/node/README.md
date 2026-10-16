# @wizeworks/lens-node

The Node add-on of [WizeLens](https://github.com/brandonkorous/wizelens): one trace per request with every database call, outgoing call, message, log, and error, and a dashboard at `/_wizelens`.

```ts
import express from "express";
import pg from "pg";
import { createWizeLens, instrumentPg } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ serviceName: "orders-api" });
instrumentPg(wizelens, pg);

const app = express();
app.use(wizelens.middleware);      // first
// ...your routes...
app.use(wizelens.errorMiddleware); // last
```

- **Frameworks:** Express (`wizelens.middleware`), Fastify (`wizelensFastify`), Koa (`wizelensKoa`), Hono (`wizelensHono`), or plain `node:http` (`wizelens.handler`).
- **Databases:** `instrumentPg`, `instrumentMysql2`, `instrumentBetterSqlite3`, `instrumentNodeSqlite`, `prismaExtension`, `instrumentTypeOrm`, `instrumentDrizzle`, or `wizelens.traceDb` for anything else.
- **gRPC and messaging:** `instrumentGrpc`, `instrumentAmqplib`, `instrumentKafkaJs`, `instrumentServiceBus`.
- **Outgoing `fetch`** is traced automatically. Tag requests with `wizelens.tag(key, value)` and name the user with `wizelens.setUser(id)`.

On by default in development only. See the [getting-started guide](https://github.com/brandonkorous/wizelens/blob/main/docs/GETTING-STARTED.md) and the full option list in the [README](https://github.com/brandonkorous/wizelens#configuration).

MIT licensed.
