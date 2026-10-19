package com.wizelens;

import java.util.LinkedHashMap;
import java.util.Map;

/** The OpenTelemetry agent properties WizeLens sets. A value you set yourself (-D or OTEL_*) always wins. */
public final class WizeLensDefaults {
  private WizeLensDefaults() {}

  static final String REQUEST_HEADERS = "accept,accept-encoding,accept-language,authorization,content-type,content-length,"
      + "cookie,host,origin,referer,user-agent,x-forwarded-for,x-request-id";
  static final String RESPONSE_HEADERS = "cache-control,content-type,content-length,etag,location,set-cookie";

  /** Properties for the agent's autoconfigure step. */
  public static Map<String, String> properties(WizeLensSettings s) {
    Map<String, String> p = new LinkedHashMap<>();
    if (!s.enabled()) {
      p.put("otel.sdk.disabled", "true");
      return p;
    }
    p.put("otel.exporter.otlp.endpoint", s.hub());
    p.put("otel.exporter.otlp.protocol", "http/protobuf");
    if (s.token() != null) p.put("otel.exporter.otlp.headers", "Authorization=Bearer " + s.token());
    // WizeLens samples at the end of each trace, so the head sampler keeps everything.
    p.put("otel.traces.sampler", "parentbased_always_on");
    p.put("otel.instrumentation.http.server.capture-request-headers", REQUEST_HEADERS);
    p.put("otel.instrumentation.http.server.capture-response-headers", RESPONSE_HEADERS);
    p.put("otel.instrumentation.logback-appender.experimental-log-attributes", "true");
    p.put("otel.instrumentation.logback-appender.experimental.capture-code-attributes", "true");
    p.put("otel.instrumentation.log4j-appender.experimental-log-attributes", "true");
    if (s.captureSqlParameters()) {
      // Parameters replace the agent's statement sanitizer: the text keeps its ? marks and the values go in attributes.
      p.put("otel.instrumentation.jdbc.experimental.capture-query-parameters", "true");
    }
    return p;
  }
}
