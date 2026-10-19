"""A small SQLite store. The sqlite3 instrumentation traces every query; WizeLens adds the parameters."""

import os
import sqlite3
import time

PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "orders.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, sku TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, name TEXT NOT NULL);
"""


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(PATH, timeout=5, check_same_thread=False)
    # sleep_ms(n) waits n ms, so the sample can show slow queries.
    db.create_function("sleep_ms", 1, lambda ms: time.sleep(ms / 1000) or 0)
    return db


def seed() -> None:
    db = connect()
    db.cursor().executescript(SCHEMA)
    if db.cursor().execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0:
        db.cursor().execute("INSERT INTO customers (id, name) VALUES (1, 'Ada'), (2, 'Grace')")
        for i, sku in enumerate(["KB-1", "MS-2", "MN-3", "HS-4", "WC-5", "DK-6"]):
            cur = db.cursor().execute("INSERT INTO orders (customer_id, sku) VALUES (?, ?)", (1 + i % 2, sku))
            db.cursor().execute("INSERT INTO items (order_id, name) VALUES (?, ?), (?, ?)", (cur.lastrowid, f"{sku} box", cur.lastrowid, f"{sku} cable"))
        db.commit()
    db.close()


def orders_with_items(db: sqlite3.Connection) -> list:
    """One query per order on purpose: the N+1 pattern WizeLens finds. The customer query repeats too (a duplicate)."""
    rows = db.cursor().execute("SELECT id, customer_id, sku FROM orders ORDER BY id LIMIT 6").fetchall()
    first_customer = rows[0][1] if rows else 1
    out = []
    for order_id, _, sku in rows:
        items = db.cursor().execute("SELECT COUNT(*) FROM items WHERE order_id = ?", (order_id,)).fetchone()[0]
        name = db.cursor().execute("SELECT name FROM customers WHERE id = ?", (first_customer,)).fetchone()[0]
        out.append({"id": order_id, "customer": name, "sku": sku, "items": items})
    return out


def insert_order(db: sqlite3.Connection, customer: int, sku: str) -> int:
    cur = db.cursor().execute("INSERT INTO orders (customer_id, sku) VALUES (?, ?)", (customer, sku))
    db.commit()
    return cur.lastrowid


def slow(ms: int) -> None:
    db = connect()
    db.cursor().execute("SELECT sleep_ms(?) FROM orders LIMIT 1", (ms,)).fetchall()
    db.close()
