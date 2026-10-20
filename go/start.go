package wizelens

import (
	"context"
	"errors"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

type options struct {
	settings     Settings
	serviceName  string
	spanExporter sdktrace.SpanExporter
	logExporter  sdklog.Exporter
	sync         bool
	sampler      *TraceSampler
}

// Option changes what Start sets up.
type Option func(*options)

// WithServiceName names the service when OTEL_SERVICE_NAME is not set.
func WithServiceName(name string) Option { return func(o *options) { o.serviceName = name } }

// WithSettings replaces the settings read from the environment.
func WithSettings(s Settings) Option { return func(o *options) { o.settings = s } }

// WithExporters sends spans and logs to these exporters instead of OTLP (tests, or another backend). Either may be nil.
func WithExporters(spans sdktrace.SpanExporter, logs sdklog.Exporter) Option {
	return func(o *options) { o.spanExporter, o.logExporter, o.sync = spans, logs, true }
}

// Start sets up OpenTelemetry for WizeLens and makes it global. Call the returned function before the process exits.
func Start(ctx context.Context, opts ...Option) (func(context.Context) error, error) {
	o := options{settings: SettingsFromEnv()}
	for _, opt := range opts {
		opt(&o)
	}
	if !o.settings.Enabled {
		return func(context.Context) error { return nil }, nil
	}
	o.sampler = NewTraceSampler(o.settings.SampleRate)
	res, err := buildResource(ctx, o)
	if err != nil {
		return nil, err
	}
	tp, err := tracerProvider(ctx, o, res)
	if err != nil {
		return nil, err
	}
	lp, err := loggerProvider(ctx, o, res)
	if err != nil {
		return nil, err
	}
	otel.SetTracerProvider(tp)
	global.SetLoggerProvider(lp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	setActive(o.settings)
	if o.settings.ReportPackages {
		go reportPackages(o.settings, res)
	}
	return func(ctx context.Context) error { return errors.Join(tp.Shutdown(ctx), lp.Shutdown(ctx)) }, nil
}

func buildResource(ctx context.Context, o options) (*resource.Resource, error) {
	var base []attribute.KeyValue
	if o.serviceName != "" {
		base = append(base, attribute.String("service.name", o.serviceName))
	}
	if o.settings.Project != "" {
		base = append(base, attribute.String("wizelens.project", o.settings.Project))
	}
	detected, err := resource.New(ctx, resource.WithFromEnv(), resource.WithTelemetrySDK(), resource.WithHost())
	if err != nil {
		return nil, err
	}
	return resource.Merge(resource.NewSchemaless(base...), detected)
}

func unset(names ...string) bool {
	for _, n := range names {
		if os.Getenv(n) != "" {
			return false
		}
	}
	return true
}

func tracerProvider(ctx context.Context, o options, res *resource.Resource) (*sdktrace.TracerProvider, error) {
	exp := o.spanExporter
	if exp == nil {
		var hopts []otlptracehttp.Option
		if unset("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") {
			hopts = append(hopts, otlptracehttp.WithEndpointURL(o.settings.Hub+"/v1/traces"))
		}
		if o.settings.Token != "" && unset("OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_TRACES_HEADERS") {
			hopts = append(hopts, otlptracehttp.WithHeaders(map[string]string{"Authorization": "Bearer " + o.settings.Token}))
		}
		var err error
		if exp, err = otlptracehttp.New(ctx, hopts...); err != nil {
			return nil, err
		}
	}
	inner := sdktrace.NewBatchSpanProcessor(exp)
	if o.sync {
		inner = sdktrace.NewSimpleSpanProcessor(exp)
	}
	s := o.settings
	proc := &SamplingSpanProcessor{Inner: inner, Sampler: o.sampler, KeepErrors: s.KeepErrors, KeepSlowMs: s.KeepSlowMs}
	return sdktrace.NewTracerProvider(sdktrace.WithResource(res), sdktrace.WithSpanProcessor(proc)), nil
}

func loggerProvider(ctx context.Context, o options, res *resource.Resource) (*sdklog.LoggerProvider, error) {
	exp := o.logExporter
	if exp == nil && !o.sync {
		var lopts []otlploghttp.Option
		if unset("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT") {
			lopts = append(lopts, otlploghttp.WithEndpointURL(o.settings.Hub+"/v1/logs"))
		}
		if o.settings.Token != "" && unset("OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_LOGS_HEADERS") {
			lopts = append(lopts, otlploghttp.WithHeaders(map[string]string{"Authorization": "Bearer " + o.settings.Token}))
		}
		var err error
		if exp, err = otlploghttp.New(ctx, lopts...); err != nil {
			return nil, err
		}
	}
	if exp == nil {
		return sdklog.NewLoggerProvider(sdklog.WithResource(res)), nil
	}
	var inner sdklog.Processor = sdklog.NewBatchProcessor(exp)
	if o.sync {
		inner = sdklog.NewSimpleProcessor(exp)
	}
	proc := &SamplingLogProcessor{Inner: inner, Sampler: o.sampler, KeepErrors: o.settings.KeepErrors}
	return sdklog.NewLoggerProvider(sdklog.WithResource(res), sdklog.WithProcessor(proc)), nil
}
