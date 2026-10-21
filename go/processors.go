package wizelens

import (
	"context"
	"strings"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// SamplingSpanProcessor runs the sampler in front of an exporting processor: spans of a trace outside the rate wait for its local root.
type SamplingSpanProcessor struct {
	Inner      sdktrace.SpanProcessor
	Sampler    *TraceSampler
	KeepErrors bool
	KeepSlowMs *float64
}

// OnStart passes the span on.
func (p *SamplingSpanProcessor) OnStart(parent context.Context, s sdktrace.ReadWriteSpan) {
	p.Inner.OnStart(parent, s)
}

// OnEnd sends the span on now, later, or never, depending on its trace.
func (p *SamplingSpanProcessor) OnEnd(s sdktrace.ReadOnlySpan) {
	parent := s.Parent()
	root := !parent.IsValid() || parent.IsRemote()
	p.Sampler.Offer(s.SpanContext().TraceID().String(), p.important(s), root, func() { p.Inner.OnEnd(s) })
}

func (p *SamplingSpanProcessor) important(s sdktrace.ReadOnlySpan) bool {
	if p.KeepErrors && s.Status().Code == codes.Error && !answered4xx(s) && !expectedAnswer(s) {
		return true
	}
	ms := float64(s.EndTime().Sub(s.StartTime()).Microseconds()) / 1000
	return p.KeepSlowMs != nil && ms >= *p.KeepSlowMs
}

// answered4xx: a 4xx answer is not a failure, even with an error status.
func answered4xx(s sdktrace.ReadOnlySpan) bool {
	for _, a := range s.Attributes() {
		if a.Key == "http.response.status_code" || a.Key == "http.status_code" {
			c := a.Value.AsInt64()
			return c >= 400 && c < 500
		}
	}
	return false
}

// expectedAnswer: the app set wizelens.expected (a deliberate 503), so an error status alone is not a failure.
func expectedAnswer(s sdktrace.ReadOnlySpan) bool {
	for _, a := range s.Attributes() {
		if a.Key != "wizelens.expected" {
			continue
		}
		switch a.Value.Type() {
		case attribute.BOOL:
			return a.Value.AsBool()
		case attribute.STRING:
			v := strings.ToLower(strings.TrimSpace(a.Value.AsString()))
			return v != "" && v != "0" && v != "false" && v != "no"
		}
	}
	return false
}

// Shutdown shuts the inner processor down.
func (p *SamplingSpanProcessor) Shutdown(ctx context.Context) error { return p.Inner.Shutdown(ctx) }

// ForceFlush flushes the inner processor.
func (p *SamplingSpanProcessor) ForceFlush(ctx context.Context) error { return p.Inner.ForceFlush(ctx) }

// SamplingLogProcessor makes log records follow their trace: kept, held, or dropped with it. An error record keeps the trace.
type SamplingLogProcessor struct {
	Inner      sdklog.Processor
	Sampler    *TraceSampler
	KeepErrors bool
}

// Enabled asks the inner processor.
func (p *SamplingLogProcessor) Enabled(ctx context.Context, param sdklog.EnabledParameters) bool {
	return p.Inner.Enabled(ctx, param)
}

// OnEmit sends the record on now, later, or never, depending on its trace.
func (p *SamplingLogProcessor) OnEmit(ctx context.Context, r *sdklog.Record) error {
	if !r.TraceID().IsValid() {
		return p.Inner.OnEmit(ctx, r)
	}
	important := p.KeepErrors && r.Severity() >= otellog.SeverityError
	held := r.Clone()
	var err error
	p.Sampler.Offer(r.TraceID().String(), important, false, func() { err = p.Inner.OnEmit(context.WithoutCancel(ctx), &held) })
	return err
}

// Shutdown shuts the inner processor down.
func (p *SamplingLogProcessor) Shutdown(ctx context.Context) error { return p.Inner.Shutdown(ctx) }

// ForceFlush flushes the inner processor.
func (p *SamplingLogProcessor) ForceFlush(ctx context.Context) error { return p.Inner.ForceFlush(ctx) }
