package com.wizelens;

import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.ReadWriteSpan;
import io.opentelemetry.sdk.trace.ReadableSpan;
import io.opentelemetry.sdk.trace.SpanProcessor;

/** Runs the WizeLens sampler in front of an exporting processor: spans of a trace outside the rate wait for its local root. */
public final class SamplingSpanProcessor implements SpanProcessor {
  private final SpanProcessor inner;
  private final TraceSampler sampler;
  private final boolean keepErrors;
  private final Double keepSlowMs;

  public SamplingSpanProcessor(SpanProcessor inner, TraceSampler sampler, boolean keepErrors, Double keepSlowMs) {
    this.inner = inner;
    this.sampler = sampler;
    this.keepErrors = keepErrors;
    this.keepSlowMs = keepSlowMs;
  }

  @Override
  public void onStart(Context parentContext, ReadWriteSpan span) {
    if (inner.isStartRequired()) inner.onStart(parentContext, span);
  }

  @Override
  public boolean isStartRequired() {
    return inner.isStartRequired();
  }

  @Override
  public void onEnd(ReadableSpan span) {
    SpanContext parent = span.getParentSpanContext();
    boolean root = !parent.isValid() || parent.isRemote();
    sampler.offer(span.getSpanContext().getTraceId(), important(span), root, () -> inner.onEnd(span));
  }

  private boolean important(ReadableSpan span) {
    if (keepErrors && span.toSpanData().getStatus().getStatusCode() == StatusCode.ERROR) return true;
    return keepSlowMs != null && span.getLatencyNanos() / 1e6 >= keepSlowMs;
  }

  @Override
  public boolean isEndRequired() {
    return true;
  }

  @Override
  public CompletableResultCode shutdown() {
    return inner.shutdown();
  }

  @Override
  public CompletableResultCode forceFlush() {
    return inner.forceFlush();
  }
}
