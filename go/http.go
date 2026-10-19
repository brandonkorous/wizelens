package wizelens

import (
	"io"
	"net/http"
	"sort"
	"strings"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

const maxHeaders = 50
const maxHeaderBytes = 1024

// Handler wraps an http.Handler with otelhttp, then adds request headers and, with WIZELENS_CAPTURE_BODY, both bodies.
func Handler(h http.Handler, operation string, opts ...otelhttp.Option) http.Handler {
	return otelhttp.NewHandler(Capture(h), operation, opts...)
}

// Transport traces outgoing requests and sends the trace to the next service.
func Transport(base http.RoundTripper, opts ...otelhttp.Option) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return otelhttp.NewTransport(base, opts...)
}

// Capture adds headers and bodies to the server span already in the request context. Handler uses it inside otelhttp.
func Capture(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s := current()
		span := trace.SpanFromContext(r.Context())
		if !s.Enabled || !span.IsRecording() {
			next.ServeHTTP(w, r)
			return
		}
		if s.CaptureHeaders {
			span.SetAttributes(headerAttributes("http.request.header.", r.Header, s)...)
		}
		if !s.CaptureBody {
			next.ServeHTTP(w, r)
			return
		}
		req := &bodyBuffer{}
		if r.Body != nil {
			r.Body = &teeBody{ReadCloser: r.Body, buf: req}
		}
		cw := &captureWriter{ResponseWriter: w, buf: &bodyBuffer{}}
		defer func() {
			record(span, AttrRequestBody, req, r.Header.Get("Content-Type"), s)
			record(span, AttrResponseBody, cw.buf, w.Header().Get("Content-Type"), s)
		}()
		next.ServeHTTP(cw, r)
	})
}

func headerAttributes(prefix string, h http.Header, s Settings) []attribute.KeyValue {
	names := make([]string, 0, len(h))
	for name := range h {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]attribute.KeyValue, 0, min(len(names), maxHeaders))
	for _, name := range names[:min(len(names), maxHeaders)] {
		value := strings.Join(h.Values(name), ", ")
		if s.IsSensitive(name) {
			value = Redacted
		}
		if len(value) > maxHeaderBytes {
			value = value[:maxHeaderBytes]
		}
		out = append(out, attribute.String(prefix+strings.ToLower(name), value))
	}
	return out
}

func record(span trace.Span, key string, buf *bodyBuffer, contentType string, s Settings) {
	data, truncated := buf.snapshot()
	if len(data) == 0 || !isText(contentType) {
		return
	}
	span.SetAttributes(attribute.String(key, preview(data, truncated, s)))
	if truncated {
		span.SetAttributes(attribute.Bool(key+".truncated", true))
	}
}

type teeBody struct {
	io.ReadCloser
	buf *bodyBuffer
}

func (t *teeBody) Read(p []byte) (int, error) {
	n, err := t.ReadCloser.Read(p)
	if n > 0 {
		t.buf.add(p[:n])
	}
	return n, err
}

type captureWriter struct {
	http.ResponseWriter
	buf *bodyBuffer
}

func (c *captureWriter) Write(p []byte) (int, error) {
	c.buf.add(p)
	return c.ResponseWriter.Write(p)
}

// Flush keeps streaming responses working.
func (c *captureWriter) Flush() {
	if f, ok := c.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the real writer.
func (c *captureWriter) Unwrap() http.ResponseWriter { return c.ResponseWriter }
