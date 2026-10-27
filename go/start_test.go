package wizelens

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	_ "modernc.org/sqlite"
)

// memLogs keeps exported log records for the tests.
type memLogs struct{ bodies []string }

func (m *memLogs) Export(_ context.Context, rs []sdklog.Record) error {
	for _, r := range rs {
		m.bodies = append(m.bodies, r.Body().AsString())
	}
	return nil
}
func (m *memLogs) Shutdown(context.Context) error   { return nil }
func (m *memLogs) ForceFlush(context.Context) error { return nil }

func start(t *testing.T, env map[string]string) (*tracetest.InMemoryExporter, *memLogs) {
	t.Helper()
	spans, logs := tracetest.NewInMemoryExporter(), &memLogs{}
	s := SettingsFrom(func(k string) string { return env[k] })
	stop, err := Start(context.Background(), WithServiceName("test"), WithSettings(s), WithExporters(spans, logs))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stop(context.Background()) })
	return spans, logs
}

func names(e *tracetest.InMemoryExporter) []string {
	var out []string
	for _, s := range e.GetSpans() {
		out = append(out, s.Name)
	}
	sort.Strings(out)
	return out
}

func TestRateZeroKeepsOnlyErrorsAndSlowTraces(t *testing.T) {
	spans, _ := start(t, map[string]string{"WIZELENS_SAMPLE_RATE": "0", "WIZELENS_KEEP_SLOW_MS": "20"})
	tr := otel.Tracer("t")
	ctx, quiet := tr.Start(context.Background(), "quiet")
	_, child := tr.Start(ctx, "child")
	child.End()
	quiet.End()
	ctx, loud := tr.Start(context.Background(), "loud")
	_, failed := tr.Start(ctx, "failed")
	failed.SetStatus(codes.Error, "boom")
	failed.End()
	loud.End()
	_, missing := tr.Start(context.Background(), "missing")
	missing.SetAttributes(attribute.Int("http.response.status_code", 404))
	missing.SetStatus(codes.Error, "not found")
	missing.End()
	_, paused := tr.Start(context.Background(), "paused")
	paused.SetAttributes(attribute.Int("http.response.status_code", 503), attribute.Bool("wizelens.expected", true))
	paused.SetStatus(codes.Error, "come back later")
	paused.End()
	_, slow := tr.Start(context.Background(), "slow")
	time.Sleep(30 * time.Millisecond)
	slow.End()
	if got := strings.Join(names(spans), ","); got != "failed,loud,slow" {
		t.Fatalf("kept %s", got)
	}
}

func TestLogsFollowTheirTrace(t *testing.T) {
	_, logs := start(t, map[string]string{"WIZELENS_SAMPLE_RATE": "0"})
	log := Logger("test", nil)
	tr := otel.Tracer("t")
	ctx, quiet := tr.Start(context.Background(), "quiet")
	log.InfoContext(ctx, "dropped with its trace")
	quiet.End()
	ctx, loud := tr.Start(context.Background(), "loud")
	log.InfoContext(ctx, "held, then kept")
	log.ErrorContext(ctx, "an error keeps the trace")
	loud.End()
	sort.Strings(logs.bodies)
	if strings.Join(logs.bodies, "|") != "an error keeps the trace|held, then kept" {
		t.Fatalf("logs %v", logs.bodies)
	}
}

func TestHandlerPutsHeadersAndBodiesOnTheServerSpan(t *testing.T) {
	spans, _ := start(t, map[string]string{"WIZELENS_CAPTURE_BODY": "true"})
	mux := http.NewServeMux()
	mux.HandleFunc("POST /orders", func(w http.ResponseWriter, r *http.Request) {
		in, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Add("Set-Cookie", "sid=abc; Path=/; HttpOnly")
		w.Header().Add("Set-Cookie", "theme=dark; Expires=Wed, 21 Oct 2026 07:28:00 GMT")
		_, _ = w.Write([]byte(`{"ok":true,"token":"t","got":` + string(rune('0'+len(in)%10)) + `}`))
	})
	srv := httptest.NewServer(Handler(mux, "orders"))
	defer srv.Close()
	req, _ := http.NewRequest("POST", srv.URL+"/orders", strings.NewReader(`{"item":"pen","password":"p"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer x")
	res, err := (&http.Client{Transport: Transport(nil)}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	attrs := map[string]string{}
	for _, s := range spans.GetSpans() {
		if s.SpanKind.String() == "server" {
			for _, a := range s.Attributes {
				attrs[string(a.Key)] = a.Value.Emit()
			}
		}
	}
	var reqBody map[string]any
	_ = json.Unmarshal([]byte(attrs[AttrRequestBody]), &reqBody)
	if reqBody["password"] != Redacted || reqBody["item"] != "pen" {
		t.Fatalf("request body %q", attrs[AttrRequestBody])
	}
	if !strings.Contains(attrs[AttrResponseBody], `"token":"[redacted]"`) || attrs["http.request.header.authorization"] != Redacted {
		t.Fatalf("attributes %v", attrs)
	}
	cookies := "sid=[redacted]; Path=/; HttpOnly, theme=[redacted]; Expires=Wed, 21 Oct 2026 07:28:00 GMT"
	if attrs["http.response.header.set-cookie"] != cookies || attrs["http.response.header.content-type"] != "application/json" {
		t.Fatalf("response headers %v", attrs)
	}
}

func TestOpenDBPutsParametersOnQuerySpans(t *testing.T) {
	spans, _ := start(t, nil)
	db, err := OpenDB("sqlite", "file::memory:", "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, "create table orders (id integer, item text, token text)"); err != nil {
		t.Fatal(err)
	}
	for _, q := range []struct {
		sql  string
		args []any
	}{{"select * from orders where id = ? and item = ?", []any{7, "pen"}}, {"select id from orders where token = ?", []any{"live"}}} {
		rows, err := db.QueryContext(ctx, q.sql, q.args...)
		if err != nil {
			t.Fatal(err)
		}
		rows.Close()
	}
	var found []string
	for _, s := range spans.GetSpans() {
		for _, a := range s.Attributes {
			if a.Key == AttrDBParameters {
				found = append(found, s.Name+" "+a.Value.AsString())
			}
		}
	}
	if strings.Join(found, "|") != `SELECT [7,"pen"]|SELECT ["[redacted]"]` {
		t.Fatalf("found %v", found)
	}
}

func TestParamsJSONRedactsSensitiveNames(t *testing.T) {
	s := SettingsFrom(func(string) string { return "" })
	got := ParamsJSON("", []driver.NamedValue{{Name: "id", Ordinal: 1, Value: int64(1)}, {Name: "password", Ordinal: 2, Value: "x"}}, s)
	if got != `{"id":1,"password":"[redacted]"}` {
		t.Fatal(got)
	}
	if got := ParamsJSON("", []driver.NamedValue{{Ordinal: 1, Value: []byte{1, 2}}}, s); got != `["<2 bytes>"]` {
		t.Fatal(got)
	}
}
