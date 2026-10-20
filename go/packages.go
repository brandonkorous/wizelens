package wizelens

import (
	"bytes"
	"encoding/json"
	"net/http"
	"runtime/debug"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/resource"
)

const packageRetries = 5

var packageRetryDelay = time.Minute

// Package is one module the binary was built with, as the hub's known-vulnerability check reads it.
type Package struct {
	Ecosystem string `json:"ecosystem"`
	Name      string `json:"name"`
	Version   string `json:"version"`
}

// ListPackages returns the modules of the build info: the main module's dependencies, with replacements applied.
func ListPackages(info *debug.BuildInfo) []Package {
	if info == nil {
		return nil
	}
	out := make([]Package, 0, len(info.Deps))
	for _, d := range info.Deps {
		m := d
		if d.Replace != nil {
			m = d.Replace
		}
		if m.Path != "" && m.Version != "" && m.Version != "(devel)" {
			out = append(out, Package{Ecosystem: "Go", Name: m.Path, Version: m.Version})
		}
	}
	return out
}

// packageSender is the HubSender of a report, from the OpenTelemetry resource.
func packageSender(s Settings, res *resource.Resource) map[string]string {
	out := map[string]string{"service": "unknown_service", "runtime": "otlp go"}
	if v, ok := res.Set().Value(attribute.Key("service.name")); ok && v.AsString() != "" {
		out["service"] = v.AsString()
	}
	if v, ok := res.Set().Value(attribute.Key("service.version")); ok && v.AsString() != "" {
		out["release"] = v.AsString()
	}
	if s.Project != "" {
		out["project"] = s.Project
	}
	return out
}

func postPackages(s Settings, body []byte) bool {
	req, err := http.NewRequest(http.MethodPost, s.Hub+"/_wizelens/api/packages", bytes.NewReader(body))
	if err != nil {
		return true
	}
	req.Header.Set("Content-Type", "application/json")
	if s.Token != "" {
		req.Header.Set("Authorization", "Bearer "+s.Token)
	}
	res, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return false
	}
	res.Body.Close()
	return res.StatusCode < 500 && res.StatusCode != http.StatusTooManyRequests
}

// reportPackages sends the build's modules once, retrying a few times while the hub cannot be reached.
func reportPackages(s Settings, res *resource.Resource) {
	info, _ := debug.ReadBuildInfo()
	body, err := json.Marshal(map[string]any{"sender": packageSender(s, res), "packages": ListPackages(info)})
	if err != nil {
		return
	}
	for i := 0; i < packageRetries && !postPackages(s, body); i++ {
		time.Sleep(packageRetryDelay)
	}
}
