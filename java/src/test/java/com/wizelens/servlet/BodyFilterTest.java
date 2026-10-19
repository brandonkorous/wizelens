package com.wizelens.servlet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.wizelens.WizeLensSettings;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.context.Scope;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import jakarta.servlet.FilterChain;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class BodyFilterTest {
  static final WizeLensSettings ON = WizeLensSettings.from(Map.of("WIZELENS_CAPTURE_BODY", "true")::get);

  SpanData run(WizeLensSettings settings, String body, FilterChain chain) throws Exception {
    InMemorySpanExporter exporter = InMemorySpanExporter.create();
    var tracer = SdkTracerProvider.builder().addSpanProcessor(SimpleSpanProcessor.create(exporter)).build().get("t");
    MockHttpServletRequest req = new MockHttpServletRequest("POST", "/orders");
    req.setContentType("application/json");
    req.setContent(body.getBytes(StandardCharsets.UTF_8));
    Span server = tracer.spanBuilder("POST /orders").startSpan();
    try (Scope ignored = server.makeCurrent()) {
      new WizeLensBodyFilter(settings).doFilter(req, new MockHttpServletResponse(), chain);
    }
    server.end();
    return exporter.getFinishedSpanItems().get(0);
  }

  static String attr(SpanData s, String key) {
    return s.getAttributes().get(AttributeKey.stringKey(key));
  }

  final FilterChain echo = (rq, rs) -> {
    String in = new String(rq.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    rs.setContentType("application/json");
    rs.getWriter().write("{\"ok\":true,\"token\":\"t\",\"got\":" + in.length() + "}");
  };

  @Test
  void putsBothBodiesOnTheServerSpan() throws Exception {
    SpanData s = run(ON, "{\"item\":\"pen\",\"password\":\"p\"}", echo);
    assertEquals("{\"item\":\"pen\",\"password\": \"[redacted]\"}", attr(s, Bodies.REQUEST_BODY));
    assertEquals("{\"ok\":true,\"token\": \"[redacted]\",\"got\":29}", attr(s, Bodies.RESPONSE_BODY));
  }

  @Test
  void cutsBigBodies() throws Exception {
    SpanData s = run(ON, "x".repeat(20_000), echo);
    assertEquals(Bodies.LIMIT, attr(s, Bodies.REQUEST_BODY).length());
    assertTrue(s.getAttributes().get(AttributeKey.booleanKey(Bodies.REQUEST_BODY + ".truncated")));
  }

  @Test
  void doesNothingWhenCaptureIsOff() throws Exception {
    SpanData s = run(WizeLensSettings.from(k -> null), "{\"item\":\"pen\"}", echo);
    assertNull(attr(s, Bodies.REQUEST_BODY));
  }

  @Test
  void onlyTextBodies() {
    assertTrue(Bodies.isText("application/json;charset=UTF-8"));
    assertTrue(Bodies.isText("application/problem+json"));
    assertFalse(Bodies.isText("image/png"));
    assertEquals("[1,2]", Bodies.redact("[1,2]", ON));
    assertEquals("{\"a\":{\"apiKey\": \"[redacted]\"}}", Bodies.redact("{\"a\":{\"apiKey\":\"k\"}}", ON));
  }
}
