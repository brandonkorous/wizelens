// Sample Go service for WizeLens: net/http, SQLite, and calls to another service, traced with OpenTelemetry.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"

	wizelens "github.com/wizeworksllc/wizelens/go"
)

var log *slog.Logger

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	// 1. OpenTelemetry for WizeLens: OTLP to WIZELENS_HUB (default http://localhost:5960), sampling, logs.
	shutdown, err := wizelens.Start(ctx, wizelens.WithServiceName("inventory-go"))
	if err != nil {
		panic(err)
	}
	defer shutdown(context.Background())
	log = wizelens.Logger("inventory", slog.Default().Handler())

	// 2. A traced database: every query is a span, with its parameters.
	db, err := openStore()
	if err != nil {
		panic(err)
	}
	app := &app{store: db, client: &http.Client{Transport: wizelens.Transport(nil)}, downstream: env("DOWNSTREAM_URL", "http://localhost:"+port())}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /orders", app.orders)
	mux.HandleFunc("POST /orders", app.createOrder)
	mux.HandleFunc("GET /stock", app.stock)
	mux.HandleFunc("GET /report", app.report)
	mux.HandleFunc("GET /fail", app.fail)

	// 3. Server spans, request headers, and (with WIZELENS_CAPTURE_BODY=true) bodies.
	srv := &http.Server{Addr: ":" + port(), Handler: wizelens.Handler(mux, "inventory-go")}
	go func() { <-ctx.Done(); _ = srv.Shutdown(context.Background()) }()
	fmt.Println("inventory-go on http://localhost:" + port())
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func port() string { return env("PORT", "5303") }

type app struct {
	store      *store
	client     *http.Client
	downstream string
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// orders loads each order's items one by one (an N+1 query), the customer twice (a duplicate), and stock per item (N+1 HTTP).
func (a *app) orders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	list, err := a.store.ordersWithItems(ctx)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	for i := range list {
		list[i].Stock = a.stockOf(ctx, list[i].SKU)
	}
	log.InfoContext(ctx, "listed orders", "count", len(list))
	writeJSON(w, 200, list)
}

func (a *app) stockOf(ctx context.Context, sku string) int {
	req, _ := http.NewRequestWithContext(ctx, "GET", a.downstream+"/stock?sku="+url.QueryEscape(sku), nil)
	res, err := a.client.Do(req)
	if err != nil {
		log.WarnContext(ctx, "stock call failed", "sku", sku, "error", err)
		return -1
	}
	defer res.Body.Close()
	var body struct {
		Quantity int `json:"quantity"`
	}
	_ = json.NewDecoder(res.Body).Decode(&body)
	return body.Quantity
}

func (a *app) stock(w http.ResponseWriter, r *http.Request) {
	sku := r.URL.Query().Get("sku")
	qty, err := a.store.stock(r.Context(), sku)
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "unknown sku"})
		return
	}
	writeJSON(w, 200, map[string]any{"sku": sku, "quantity": qty})
}

func (a *app) createOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Customer int    `json:"customer"`
		SKU      string `json:"sku"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SKU == "" {
		writeJSON(w, 400, map[string]string{"error": "send {\"customer\": 1, \"sku\": \"KB-1\"}"})
		return
	}
	id, err := a.store.insertOrder(r.Context(), in.Customer, in.SKU)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "customer": in.Customer, "sku": in.SKU})
}

// report runs one slow query, then three at the same time: WizeLens shows them as one database wait.
func (a *app) report(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	_ = a.store.slow(ctx, 150)
	var wg sync.WaitGroup
	for range 3 {
		wg.Add(1)
		go func() { defer wg.Done(); _ = a.store.slow(ctx, 120) }()
	}
	wg.Wait()
	writeJSON(w, 200, map[string]string{"report": "done"})
}

func (a *app) fail(w http.ResponseWriter, r *http.Request) {
	log.ErrorContext(r.Context(), "payment provider timed out")
	writeJSON(w, 502, map[string]string{"error": "payment provider timed out"})
}
