---
title: Several services
description: Install WizeLens in each service. They find each other, and one trace covers all of them.
---

Modern apps are hard to debug because one click fans out: a front end, a gateway, a few services, and several data stores.
WizeLens follows the whole chain.

## Set up

Install WizeLens in each service, in any mix of .NET and Node. Nothing else is needed.

## How the services find each other

1. **One trace id.** The browser sends a W3C `traceparent` header. `HttpClient`, `fetch`, gRPC, and the message queue
   adapters pass it on, so every service records its part under the same trace id.
2. **Each response says where its WizeLens lives.** The `X-WizeLens-Endpoint` header tells the caller the address of the
   downstream service's dashboard API.
3. **The trace is put together when you open it.** The service you are looking at pulls the matching spans from every
   downstream service it heard about, and merges them into one timeline.

There is no collector, no agent, and no shared database. The environment menu in the top bar lists the services each one found.

## Behind a proxy

If a service sits behind a proxy, the address it reports may not be one the others can reach. Set it yourself:
`publicEndpoint` in Node. See [Configuration](/docs/configuration/).

## When you want one place

Federation only works while the services are running. To keep everything in one place, also when a service is stopped,
point them at [the local hub](/docs/hub/).
