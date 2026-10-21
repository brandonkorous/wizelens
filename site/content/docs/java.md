---
title: Java
description: The OpenTelemetry Java agent with WizeLens defaults. N+1 queries, slow queries, SQL parameters, request bodies, and logs, with no code change.
---

## Start with the agent

Java apps send to WizeLens through the [OpenTelemetry Java agent](https://opentelemetry.io/docs/zero-code/java/agent/).
It traces Spring, servlets, JDBC, Hibernate, HTTP clients, Kafka, and more, with no code change.

Requires Java 17 or newer. The body filter below needs Jakarta Servlet (Spring Boot 3 or newer).

```bash
curl -LO https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar

OTEL_SERVICE_NAME=orders-api \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5960 \
java -javaagent:opentelemetry-javaagent.jar -jar app.jar
```

That is enough for traces, logs (Logback, Log4j, and `java.util.logging`), and the insights: N+1 queries, N+1 HTTP
calls, slow queries, and database waits. The agent replaces SQL values with `?`, so WizeLens cannot tell whether two
queries had the same values. It does not call them duplicates; the extension below brings them back.

## Add the WizeLens extension

The extension is one jar that the agent loads. It sets the WizeLens defaults, keeps every trace with an error or a slow
span when you sample, and turns on SQL parameters.

> **Build from the repository:** the first release of `com.wizelens:wizelens` is not on Maven Central yet, so the download
> and the dependency below do not work until it is. Until then, build the jar from the repository:
> `git clone https://github.com/brandonkorous/wizelens && mvn -f wizelens/java/pom.xml install -DskipTests`. That makes
> `wizelens/java/target/wizelens-0.1.0-alpha.1.jar` (use it as `wizelens.jar`) and puts the dependency in your local
> Maven repository. The agent alone, above, works today.

```bash
curl -L -o wizelens.jar https://repo1.maven.org/maven2/com/wizelens/wizelens/0.1.0-alpha.1/wizelens-0.1.0-alpha.1.jar

WIZELENS_HUB=http://localhost:5960 \
java -javaagent:opentelemetry-javaagent.jar -Dotel.javaagent.extensions=wizelens.jar \
     -Dotel.service.name=orders-api -jar app.jar
```

What it sets (anything you set yourself with `-D` or `OTEL_*` wins):

| Setting | Value |
|---|---|
| `otel.exporter.otlp.endpoint` | `WIZELENS_HUB`, else `http://localhost:5960` |
| `otel.exporter.otlp.protocol` | `http/protobuf` |
| `otel.exporter.otlp.headers` | `Authorization=Bearer <WIZELENS_HUB_TOKEN>` |
| `otel.traces.sampler` | `parentbased_always_on`: WizeLens samples at the end of the trace instead |
| `otel.instrumentation.jdbc.experimental.capture-query-parameters` | `true` (off with `WIZELENS_CAPTURE_SQL_PARAMETERS=false`) |
| `otel.instrumentation.http.server.capture-request-headers` | Common headers; `authorization` and `cookie` arrive redacted |
| `otel.instrumentation.http.server.capture-response-headers` | Cache and content headers, `Location`, `Set-Cookie`, and the security headers the [Security](/docs/security/) page checks: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Server`, `X-Powered-By`, and the CORS headers |
| Logback and Log4j attributes | MDC and code attributes on each log line |
| Resource | `wizelens.project` from `WIZELENS_PROJECT` |
| `otel.sdk.disabled` | `true` when `WIZELENS_ENABLED=false`, and nothing else is set |

## Request and response bodies

Agents do not keep bodies. Add the library to your app and register its servlet filter:

```xml
<dependency>
  <groupId>com.wizelens</groupId>
  <artifactId>wizelens</artifactId>
  <version>0.1.0-alpha.1</version>
</dependency>
```

```java
@Bean
FilterRegistrationBean<WizeLensBodyFilter> wizelensBodies() {
  return new FilterRegistrationBean<>(new WizeLensBodyFilter());
}
```

Then set `WIZELENS_CAPTURE_BODY=true`. The filter keeps text and JSON bodies, up to 16 KB each, on the request's server
span. JSON keys that look like secrets (`password`, `token`, ...) are redacted. The bodies show on the request's Headers
and Response tabs.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `WIZELENS_HUB` | `http://localhost:5960` | Hub or cloud address |
| `WIZELENS_HUB_TOKEN` | none | Hub token or cloud ingest key |
| `WIZELENS_PROJECT` | none | Project on a shared hub |
| `WIZELENS_SAMPLE_RATE` | `1` | Share of traces kept. See [Sampling](/docs/sampling/) |
| `WIZELENS_KEEP_SLOW_MS` | `1000` | Keep traces with a span this slow at any rate (`off` for none) |
| `WIZELENS_KEEP_ERRORS` | `true` | Keep traces with an error at any rate |
| `WIZELENS_CAPTURE_BODY` | `false` | Request and response bodies |
| `WIZELENS_CAPTURE_SQL_PARAMETERS` | `true` | SQL parameters |
| `WIZELENS_REDACT_KEYS` | none | More key fragments to redact, comma-separated |
| `WIZELENS_PACKAGES` | `true` | Send the app's package names and versions once at start, for the known-vulnerability check |
| `WIZELENS_ENABLED` | `true` | `false` turns the agent's SDK off |

Each also works as a system property: `-Dwizelens.sample.rate=0.1`.

The extension is on wherever it runs, in development and in production. With `WIZELENS_PACKAGES` on, the hub or the cloud
checks the packages against OSV and shows each vulnerable version on the [Security](/docs/security/#known-vulnerable-packages) page. Only names and versions leave the
app.

## Answers you expect

When a 5xx is on purpose, such as a 503 "come back later", set `wizelens.expected` on the request's server span. WizeLens
then leaves it out of error rates, and the sampler does not keep the trace for that status alone. Add
`io.opentelemetry:opentelemetry-api` to your app; the agent connects it to its own SDK:

```java
import io.opentelemetry.api.trace.Span;

Span.current().setAttribute("wizelens.expected", true);
```

The `X-WizeLens-Expected` response header is not read in Java apps, because the agent does not capture it. See
[Answers you expect](/docs/dashboard/#answers-you-expect).

## A runnable sample

[`samples/java-spring`](https://github.com/brandonkorous/wizelens/tree/main/samples/java-spring) is a Spring Boot service
with an H2 database. `GET /orders` shows N+1 queries, a duplicate query, and N+1 HTTP calls to the Python sample;
`GET /report` shows a slow query and a database wait; `GET /fail` shows an error with its log line.

```bash
mvn -f java install && mvn -f samples/java-spring package
WIZELENS_CAPTURE_BODY=true java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.javaagent.extensions=java/target/wizelens-0.1.0-alpha.1.jar \
  -jar samples/java-spring/target/orders-java-0.0.0.jar
```

Run the [Python](/docs/python/) and [Go](/docs/go/) samples too, and one `GET /orders` crosses all three services.
