package wizelens

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"runtime/debug"
	"testing"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/resource"
)

func TestListPackagesAppliesReplacements(t *testing.T) {
	info := &debug.BuildInfo{Deps: []*debug.Module{
		{Path: "golang.org/x/net", Version: "v0.17.0"},
		{Path: "example.com/old", Version: "v1.0.0", Replace: &debug.Module{Path: "example.com/fork", Version: "v1.0.1"}},
		{Path: "example.com/local", Version: "(devel)"},
	}}
	got := ListPackages(info)
	want := []Package{{"Go", "golang.org/x/net", "v0.17.0"}, {"Go", "example.com/fork", "v1.0.1"}}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("packages %v", got)
	}
}

func TestReportPackagesPostsWithTheToken(t *testing.T) {
	type call struct {
		path, auth string
		body       map[string]any
	}
	calls := make(chan call, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		calls <- call{r.URL.Path, r.Header.Get("Authorization"), body}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	s := SettingsFrom(func(k string) string {
		return map[string]string{"WIZELENS_HUB": srv.URL, "WIZELENS_HUB_TOKEN": "t0k", "WIZELENS_PROJECT": "shop"}[k]
	})
	reportPackages(s, resource.NewSchemaless(attribute.String("service.name", "orders")))
	c := <-calls
	sender := c.body["sender"].(map[string]any)
	if c.path != "/_wizelens/api/packages" || c.auth != "Bearer t0k" || sender["service"] != "orders" || sender["project"] != "shop" {
		t.Fatalf("call %+v", c)
	}
	if _, ok := c.body["packages"].([]any); !ok {
		t.Fatalf("packages %v", c.body["packages"])
	}
}
