package wizelens

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/contrib/bridges/otelslog"
)

// Logger is a slog.Logger whose records go to WizeLens with the trace of the context they are logged with
// (use the *Context methods, such as InfoContext). Records also go to next, when it is not nil.
func Logger(name string, next slog.Handler) *slog.Logger {
	otel := otelslog.NewHandler(name)
	if next == nil {
		return slog.New(otel)
	}
	return slog.New(fanout{otel, next})
}

// fanout sends each record to two handlers.
type fanout [2]slog.Handler

func (f fanout) Enabled(ctx context.Context, l slog.Level) bool {
	return f[0].Enabled(ctx, l) || f[1].Enabled(ctx, l)
}

func (f fanout) Handle(ctx context.Context, r slog.Record) error {
	var first error
	for _, h := range f {
		if h.Enabled(ctx, r.Level) {
			if err := h.Handle(ctx, r.Clone()); err != nil && first == nil {
				first = err
			}
		}
	}
	return first
}

func (f fanout) WithAttrs(attrs []slog.Attr) slog.Handler {
	return fanout{f[0].WithAttrs(attrs), f[1].WithAttrs(attrs)}
}

func (f fanout) WithGroup(name string) slog.Handler {
	return fanout{f[0].WithGroup(name), f[1].WithGroup(name)}
}
