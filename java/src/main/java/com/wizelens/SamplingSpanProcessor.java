package com.wizelens;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.ReadWriteSpan;
import io.opentelemetry.sdk.trace.ReadableSpan;
import io.opentelemetry.sdk.trace.SpanProcessor;

/** Runs the WizeLens sampler in front of an exporting processor: spans of a trace outside the rate wait for its local root. */
public final class SamplingSpanProcessor implements SpanProcessor {
  private static final AttributeKey<Long> HTTP_STATUS = AttributeKey.longKey("http.response.status_code");
  private static final AttributeKey<Long> OLD_HTTP_STATUS = AttributeKey.longKey("http.status_code");
  private static final AttributeKey<Boolean> EXPECTED = AttributeKey.booleanKey("wizelens.expected");
  private static final AttributeKey<String> EXPECTED_TEXT = AttributeKey.stringKey("wizelens.expected");
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
    if (keepErrors && span.toSpanData().getStatus().getStatusCode() == StatusCode.ERROR && !answered4xx(span) && !expectedAnswer(span)) return true;
    return keepSlowMs != null && span.getLatencyNanos() / 1e6 >= keepSlowMs;
  }

  /** A 4xx answer is not a failure, even with an error status. */
  private static boolean answered4xx(ReadableSpan span) {
    Long code = span.getAttribute(HTTP_STATUS);
    if (code == null) code = span.getAttribute(OLD_HTTP_STATUS);
    return code != null && code >= 400 && code < 500;
  }

  /** The app set wizelens.expected (a deliberate 503), so an error status alone is not a failure. */
  private static boolean expectedAnswer(ReadableSpan span) {
    if (Boolean.TRUE.equals(span.getAttribute(EXPECTED))) return true;
    String text = span.getAttribute(EXPECTED_TEXT);
    if (text == null) return false;
    String v = text.trim().toLowerCase(java.util.Locale.ROOT);
    return !v.isEmpty() && !v.equals("0") && !v.equals("false") && !v.equals("no");
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
