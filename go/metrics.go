package wizelens

import (
	"context"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
)

// metricInterval is how often metrics are sent: often enough for a one-minute chart bucket.
const metricInterval = 30 * time.Second

// WithMetricReader reads metrics with this reader instead of sending them by OTLP (tests, or another backend).
func WithMetricReader(r sdkmetric.Reader) Option { return func(o *options) { o.metricReader = r } }

// meterProvider sends request times (from the otelhttp handler) and Go runtime metrics: memory, goroutines, GC goal.
func meterProvider(ctx context.Context, o options, res *resource.Resource) (*sdkmetric.MeterProvider, error) {
	reader := o.metricReader
	if reader == nil && !o.sync {
		var mopts []otlpmetrichttp.Option
		if unset("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") {
			mopts = append(mopts, otlpmetrichttp.WithEndpointURL(o.settings.Hub+"/v1/metrics"))
		}
		if o.settings.Token != "" && unset("OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_METRICS_HEADERS") {
			mopts = append(mopts, otlpmetrichttp.WithHeaders(map[string]string{"Authorization": "Bearer " + o.settings.Token}))
		}
		exp, err := otlpmetrichttp.New(ctx, mopts...)
		if err != nil {
			return nil, err
		}
		reader = sdkmetric.NewPeriodicReader(exp, sdkmetric.WithInterval(metricInterval))
	}
	if reader == nil {
		return sdkmetric.NewMeterProvider(sdkmetric.WithResource(res)), nil
	}
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithResource(res), sdkmetric.WithReader(reader))
	if err := runtime.Start(runtime.WithMeterProvider(mp)); err != nil {
		return nil, err
	}
	return mp, nil
}
