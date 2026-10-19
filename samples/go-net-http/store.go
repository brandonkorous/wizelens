package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"time"

	wizelens "github.com/brandonkorous/wizelens/go"
	"modernc.org/sqlite"
)

type store struct{ db *sql.DB }

type order struct {
	ID       int    `json:"id"`
	Customer string `json:"customer"`
	SKU      string `json:"sku"`
	Items    int    `json:"items"`
	Stock    int    `json:"stock"`
}

const schema = `
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, sku TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stock (sku TEXT PRIMARY KEY, quantity INTEGER NOT NULL);`

func init() {
	// sleep_ms(n) waits n ms, so the sample can show slow queries.
	sqlite.MustRegisterScalarFunction("sleep_ms", 1, func(_ *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
		time.Sleep(time.Duration(args[0].(int64)) * time.Millisecond)
		return int64(0), nil
	})
}

func openStore() (*store, error) {
	db, err := wizelens.OpenDB("sqlite", "file:inventory.db?_pragma=busy_timeout(5000)", "sqlite")
	if err != nil {
		return nil, err
	}
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, schema); err != nil {
		return nil, err
	}
	var n int
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM orders").Scan(&n)
	if n == 0 {
		seed(ctx, db)
	}
	return &store{db: db}, nil
}

func seed(ctx context.Context, db *sql.DB) {
	skus := []string{"KB-1", "MS-2", "MN-3", "HS-4", "WC-5", "DK-6"}
	_, _ = db.ExecContext(ctx, "INSERT INTO customers (id, name) VALUES (1, 'Ada'), (2, 'Grace')")
	for i, sku := range skus {
		_, _ = db.ExecContext(ctx, "INSERT INTO stock (sku, quantity) VALUES (?, ?)", sku, 10+i*7)
		res, _ := db.ExecContext(ctx, "INSERT INTO orders (customer_id, sku) VALUES (?, ?)", 1+i%2, sku)
		id, _ := res.LastInsertId()
		_, _ = db.ExecContext(ctx, "INSERT INTO items (order_id, name) VALUES (?, ?), (?, ?)", id, sku+" box", id, sku+" cable")
	}
}

// ordersWithItems runs one query per order on purpose: the N+1 pattern WizeLens finds.
func (s *store) ordersWithItems(ctx context.Context) ([]order, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, customer_id, sku FROM orders ORDER BY id LIMIT 6")
	if err != nil {
		return nil, err
	}
	var list []order
	var customers []int
	for rows.Next() {
		var o order
		var c int
		_ = rows.Scan(&o.ID, &c, &o.SKU)
		list, customers = append(list, o), append(customers, c)
	}
	rows.Close()
	for i := range list {
		_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM items WHERE order_id = ?", list[i].ID).Scan(&list[i].Items)
		// The same customer query with the same id twice in a row: a duplicate query.
		_ = s.db.QueryRowContext(ctx, "SELECT name FROM customers WHERE id = ?", customers[0]).Scan(&list[i].Customer)
	}
	return list, nil
}

func (s *store) stock(ctx context.Context, sku string) (int, error) {
	var qty int
	err := s.db.QueryRowContext(ctx, "SELECT quantity FROM stock WHERE sku = ?", sku).Scan(&qty)
	return qty, err
}

func (s *store) insertOrder(ctx context.Context, customer int, sku string) (int64, error) {
	res, err := s.db.ExecContext(ctx, "INSERT INTO orders (customer_id, sku) VALUES (?, ?)", customer, sku)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *store) slow(ctx context.Context, ms int) error {
	_, err := s.db.ExecContext(ctx, "SELECT sleep_ms(?) FROM stock LIMIT 1", ms)
	return err
}
