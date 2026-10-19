package wizelens

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"strings"
	"time"

	"github.com/XSAM/otelsql"
	"go.opentelemetry.io/otel/attribute"
)

// OpenDB opens a database whose queries are traced (otelsql), with their parameters when WIZELENS_CAPTURE_SQL_PARAMETERS
// is on (the default). system is the db.system.name value, such as "postgresql", "mysql", or "sqlite".
func OpenDB(driverName, dsn string, system string, opts ...otelsql.Option) (*sql.DB, error) {
	return otelsql.Open(driverName, dsn, append(DBOptions(system), opts...)...)
}

// DBOptions are the otelsql options OpenDB uses, for otelsql.Open, otelsql.OpenDB, or otelsql.Register.
func DBOptions(system string) []otelsql.Option {
	return []otelsql.Option{
		otelsql.WithAttributes(attribute.String("db.system.name", system)),
		// One span per query: no prepare, rows, reset, or connect spans that would count the query twice.
		otelsql.WithSpanOptions(otelsql.SpanOptions{OmitConnPrepare: true, OmitRows: true, OmitConnResetSession: true, OmitConnectorConnect: true}),
		otelsql.WithSpanNameFormatter(spanName),
		otelsql.WithAttributesGetter(parameterAttributes),
	}
}

// spanName is the statement's first word ("SELECT"), like the other agents, or the method when there is no statement.
func spanName(_ context.Context, method otelsql.Method, query string) string {
	if fields := strings.Fields(query); len(fields) > 0 {
		return strings.ToUpper(fields[0])
	}
	return string(method)
}

func parameterAttributes(_ context.Context, _ otelsql.Method, _ string, args []driver.NamedValue) []attribute.KeyValue {
	s := current()
	if !s.Enabled || !s.CaptureSQLParameters || len(args) == 0 {
		return nil
	}
	if text := ParamsJSON(args, s); text != "" {
		return []attribute.KeyValue{attribute.String(AttrDBParameters, text)}
	}
	return nil
}

// ParamsJSON is the wizelens.db.parameters text: an array by position, or an object when every parameter has a name.
func ParamsJSON(args []driver.NamedValue, s Settings) string {
	named := map[string]any{}
	list := make([]any, 0, len(args))
	for _, a := range args {
		list = append(list, plain(a.Value))
		if a.Name == "" {
			named = nil
		} else if named != nil {
			named[a.Name] = plain(a.Value)
			if s.IsSensitive(a.Name) {
				named[a.Name] = Redacted
			}
		}
	}
	var v any = list
	if named != nil {
		v = named
	}
	out, err := marshal(v)
	if err != nil {
		return ""
	}
	return out
}

func plain(v any) any {
	switch t := v.(type) {
	case nil, bool, int64, float64, string:
		return t
	case []byte:
		return fmt.Sprintf("<%d bytes>", len(t))
	case time.Time:
		return t.Format(time.RFC3339Nano)
	default:
		return fmt.Sprint(t)
	}
}
