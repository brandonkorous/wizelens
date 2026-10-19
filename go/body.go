package wizelens

import (
	"encoding/json"
	"mime"
	"strings"
	"sync"
	"sync/atomic"
)

// Attribute names the dashboard reads.
const (
	AttrRequestBody  = "wizelens.request.body"
	AttrResponseBody = "wizelens.response.body"
	AttrDBParameters = "wizelens.db.parameters"
)

var active atomic.Pointer[Settings]

func setActive(s Settings) { active.Store(&s) }

// current returns the settings Start used, or the environment's when Start was not called.
func current() Settings {
	if s := active.Load(); s != nil {
		return *s
	}
	return SettingsFromEnv()
}

// isText reports whether a content type is text or JSON, the bodies WizeLens keeps.
func isText(contentType string) bool {
	t, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	switch t {
	case "application/json", "application/xml", "application/x-www-form-urlencoded", "application/graphql":
		return true
	}
	return strings.HasPrefix(t, "text/") || strings.HasSuffix(t, "+json") || strings.HasSuffix(t, "+xml")
}

// bodyBuffer keeps the first bytes of a body and notes when there was more.
type bodyBuffer struct {
	mu        sync.Mutex
	data      []byte
	truncated bool
}

func (b *bodyBuffer) add(p []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	room := BodyLimit - len(b.data)
	if room > 0 {
		b.data = append(b.data, p[:min(room, len(p))]...)
	}
	if len(p) > room {
		b.truncated = true
	}
}

func (b *bodyBuffer) snapshot() ([]byte, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]byte(nil), b.data...), b.truncated
}

func redactValue(v any, s Settings) any {
	switch t := v.(type) {
	case map[string]any:
		for k, inner := range t {
			if s.IsSensitive(k) {
				t[k] = Redacted
			} else {
				t[k] = redactValue(inner, s)
			}
		}
	case []any:
		for i, inner := range t {
			t[i] = redactValue(inner, s)
		}
	}
	return v
}

// preview is the body as text. Complete JSON has its sensitive keys redacted.
func preview(data []byte, truncated bool, s Settings) string {
	if truncated {
		return string(data)
	}
	var v any
	if json.Unmarshal(data, &v) != nil {
		return string(data)
	}
	out, err := marshal(redactValue(v, s))
	if err != nil {
		return string(data)
	}
	return out
}

// marshal is JSON without HTML escaping, so "<" stays "<".
func marshal(v any) (string, error) {
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	return strings.TrimSuffix(b.String(), "\n"), nil
}
