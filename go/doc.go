// Package wizelens sets up OpenTelemetry for WizeLens in Go services: OTLP to a WizeLens hub or the cloud, sampling that
// keeps every trace with an error or a slow span, logs with their trace, and the detail the contrib instrumentation
// leaves out: SQL parameters, request and response bodies, and request headers.
//
//	shutdown, err := wizelens.Start(ctx, wizelens.WithServiceName("inventory"))
//	defer shutdown(context.Background())
//
//	db, err := wizelens.OpenDB("sqlite", "file:app.db", "sqlite")
//	client := &http.Client{Transport: wizelens.Transport(nil)}
//	log := wizelens.Logger("inventory", slog.Default().Handler())
//	http.ListenAndServe(":8080", wizelens.Handler(mux, "inventory"))
//
// Settings come from WIZELENS_* environment variables; see https://wizelens.com/docs/go/.
package wizelens
