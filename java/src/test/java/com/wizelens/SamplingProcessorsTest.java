package com.wizelens;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.opentelemetry.api.logs.Severity;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import io.opentelemetry.sdk.logs.SdkLoggerProvider;
import io.opentelemetry.sdk.logs.export.SimpleLogRecordProcessor;
import io.opentelemetry.sdk.testing.exporter.InMemoryLogRecordExporter;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class SamplingProcessorsTest {
  final InMemorySpanExporter spans = InMemorySpanExporter.create();

  Tracer tracer(TraceSampler sampler, Double keepSlowMs) {
    SamplingSpanProcessor p = new SamplingSpanProcessor(SimpleSpanProcessor.create(spans), sampler, true, keepSlowMs);
    return SdkTracerProvider.builder().addSpanProcessor(p).build().get("test");
  }

  List<String> names() {
    return spans.getFinishedSpanItems().stream().map(SpanData::getName).sorted().toList();
  }

  void trace(Tracer t, String root, StatusCode childStatus, long rootMillis) {
    Span r = t.spanBuilder(root).setStartTimestamp(1000, TimeUnit.MILLISECONDS).startSpan();
    try (Scope ignored = r.makeCurrent()) {
      t.spanBuilder("SELECT orders").startSpan().setStatus(childStatus).end();
    }
    r.end(1000 + rootMillis, TimeUnit.MILLISECONDS);
  }

  @Test
  void rateZeroDropsAQuietTrace() {
    trace(tracer(new TraceSampler(0), 1000.0), "GET /orders", StatusCode.UNSET, 5);
    assertEquals(List.of(), names());
  }

  @Test
  void rateZeroKeepsATraceWithAnError() {
    trace(tracer(new TraceSampler(0), 1000.0), "GET /orders", StatusCode.ERROR, 5);
    assertEquals(List.of("GET /orders", "SELECT orders"), names());
  }

  @Test
  void rateZeroKeepsASlowTrace() {
    trace(tracer(new TraceSampler(0), 1000.0), "GET /report", StatusCode.UNSET, 1500);
    assertEquals(List.of("GET /report", "SELECT orders"), names());
  }

  @Test
  void logsFollowTheirTrace() {
    TraceSampler sampler = new TraceSampler(0);
    Tracer t = tracer(sampler, 1000.0);
    InMemoryLogRecordExporter logs = InMemoryLogRecordExporter.create();
    var logger = SdkLoggerProvider.builder()
        .addLogRecordProcessor(new SamplingLogRecordProcessor(SimpleLogRecordProcessor.create(logs), sampler, true))
        .build().get("test");
    for (String name : List.of("quiet", "loud")) {
      Span r = t.spanBuilder(name).startSpan();
      try (Scope ignored = r.makeCurrent()) {
        logger.logRecordBuilder().setSeverity(Severity.INFO).setBody(name + " info").emit();
        if (name.equals("loud")) logger.logRecordBuilder().setSeverity(Severity.ERROR).setBody("loud error").emit();
      }
      r.end();
    }
    List<String> bodies = logs.getFinishedLogRecordItems().stream().map(l -> l.getBodyValue().asString()).sorted().toList();
    assertEquals(List.of("loud error", "loud info"), bodies);
    assertEquals(List.of("loud"), names());
  }
}
