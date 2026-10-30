package wizelens

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestStartSendsRequestTimesAndRuntimeMetrics(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	s := SettingsFrom(func(string) string { return "" })
	stop, err := Start(context.Background(), WithService("clinic-api"), WithSettings(s), WithExporters(tracetest.NewInMemoryExporter(), nil), WithMetricReader(reader))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stop(context.Background()) })
	mux := http.NewServeMux()
	mux.HandleFunc("GET /orders", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("[]")) })
	Handler(mux, "clinic-api").ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/orders", nil))
	var got metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &got); err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, sm := range got.ScopeMetrics {
		for _, m := range sm.Metrics {
			names[m.Name] = true
		}
	}
	for _, want := range []string{"http.server.request.duration", "go.memory.used", "go.goroutine.count"} {
		if !names[want] {
			t.Errorf("no %s in %v", want, names)
		}
	}
}
