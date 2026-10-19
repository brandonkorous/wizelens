package com.wizelens;

import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.logs.LogRecordProcessor;
import io.opentelemetry.sdk.logs.ReadWriteLogRecord;
import io.opentelemetry.sdk.logs.data.LogRecordData;

/** Log lines follow their trace: kept, held, or dropped with it. An error line keeps the trace. */
public final class SamplingLogRecordProcessor implements LogRecordProcessor {
  private static final int ERROR_SEVERITY = 17;

  private final LogRecordProcessor inner;
  private final TraceSampler sampler;
  private final boolean keepErrors;

  public SamplingLogRecordProcessor(LogRecordProcessor inner, TraceSampler sampler, boolean keepErrors) {
    this.inner = inner;
    this.sampler = sampler;
    this.keepErrors = keepErrors;
  }

  @Override
  public void onEmit(Context context, ReadWriteLogRecord logRecord) {
    LogRecordData data = logRecord.toLogRecordData();
    SpanContext span = data.getSpanContext();
    if (!span.isValid()) {
      inner.onEmit(context, logRecord);
      return;
    }
    boolean important = keepErrors && data.getSeverity().getSeverityNumber() >= ERROR_SEVERITY;
    sampler.offer(span.getTraceId(), important, false, () -> inner.onEmit(context, logRecord));
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
