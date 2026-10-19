"""Sample Python service for WizeLens: FastAPI, SQLite, and calls to another service, traced by opentelemetry-instrument.

    pip install -r requirements.txt
    opentelemetry-bootstrap -a install
    OTEL_SERVICE_NAME=orders-python opentelemetry-instrument uvicorn app:app --port 5302
"""

import contextvars
import logging
import os
from concurrent.futures import ThreadPoolExecutor

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import store
from wizelens import WizeLensMiddleware

log = logging.getLogger("orders")
logging.basicConfig(level=logging.INFO)
DOWNSTREAM = os.environ.get("DOWNSTREAM_URL", "http://localhost:5303")

store.seed()
app = FastAPI(title="orders-python")
# Request and response bodies on the server span, when WIZELENS_CAPTURE_BODY=true.
app.add_middleware(WizeLensMiddleware)
client = httpx.Client(timeout=5)


class NewOrder(BaseModel):
    customer: int
    sku: str


def stock_of(sku: str) -> int:
    """One call per order to the inventory service: the N+1 HTTP pattern."""
    try:
        return client.get(f"{DOWNSTREAM}/stock", params={"sku": sku}).json().get("quantity", -1)
    except httpx.HTTPError as err:
        log.warning("stock call failed for %s: %s", sku, err)
        return -1


@app.get("/orders")
def orders():
    db = store.connect()
    try:
        rows = store.orders_with_items(db)
    finally:
        db.close()
    for row in rows:
        row["stock"] = stock_of(row["sku"])
    log.info("listed %d orders", len(rows))
    return rows


@app.post("/orders", status_code=201)
def create_order(body: NewOrder):
    db = store.connect()
    try:
        return {"id": store.insert_order(db, body.customer, body.sku), "customer": body.customer, "sku": body.sku}
    finally:
        db.close()


@app.get("/stock")
def stock(sku: str):
    """Asks the inventory service, so a call from the Java sample crosses three services."""
    return {"sku": sku, "quantity": stock_of(sku)}


@app.get("/report")
def report():
    """One slow query, then three at the same time: WizeLens shows them as one database wait."""
    store.slow(150)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(contextvars.copy_context().run, store.slow, 120) for _ in range(3)]
        for f in futures:
            f.result()
    return {"report": "done"}


@app.get("/fail")
def fail():
    log.error("payment provider timed out")
    raise HTTPException(status_code=502, detail="payment provider timed out")
