package com.wizelens.samples.orders;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.IntStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@RestController
public class OrdersController {
  private static final Logger log = LoggerFactory.getLogger(OrdersController.class);
  private final JdbcTemplate db;
  private final RestClient downstream;

  public OrdersController(JdbcTemplate db, RestClient downstream) {
    this.db = db;
    this.downstream = downstream;
  }

  record NewOrder(int customer, String sku) {}

  /** One query per order (an N+1), the same customer query twice (a duplicate), and one stock call per order (N+1 HTTP). */
  @GetMapping("/orders")
  public List<Map<String, Object>> orders() {
    List<Map<String, Object>> orders = db.queryForList("SELECT id, customer_id, sku FROM orders ORDER BY id LIMIT 6");
    Object firstCustomer = orders.isEmpty() ? 1 : orders.get(0).get("CUSTOMER_ID");
    for (Map<String, Object> o : orders) {
      o.put("items", db.queryForObject("SELECT COUNT(*) FROM items WHERE order_id = ?", Integer.class, o.get("ID")));
      o.put("customer", db.queryForObject("SELECT name FROM customers WHERE id = ?", String.class, firstCustomer));
      o.put("stock", stockOf((String) o.get("SKU")));
    }
    log.info("listed {} orders", orders.size());
    return orders;
  }

  private int stockOf(String sku) {
    try {
      Map<?, ?> body = downstream.get().uri(u -> u.path("/stock").queryParam("sku", sku).build()).retrieve().body(Map.class);
      return body == null ? -1 : ((Number) body.get("quantity")).intValue();
    } catch (RestClientException e) {
      log.warn("stock call failed for {}: {}", sku, e.getMessage());
      return -1;
    }
  }

  @PostMapping("/orders")
  public ResponseEntity<Map<String, Object>> create(@RequestBody NewOrder order) {
    db.update("INSERT INTO orders (customer_id, sku) VALUES (?, ?)", order.customer(), order.sku());
    Integer id = db.queryForObject("SELECT MAX(id) FROM orders", Integer.class);
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id, "customer", order.customer(), "sku", order.sku()));
  }

  @GetMapping("/stock")
  public Map<String, Object> stock(@RequestParam String sku) {
    return Map.of("sku", sku, "quantity", 10 + sku.length());
  }

  /** One slow query, then three at the same time: WizeLens shows them as one database wait. */
  @GetMapping("/report")
  public Map<String, String> report() {
    db.queryForList("SELECT SLEEP_MS(150) FROM customers LIMIT 1");
    CompletableFuture<?>[] parallel = IntStream.range(0, 3)
        .mapToObj(i -> CompletableFuture.runAsync(() -> db.queryForList("SELECT SLEEP_MS(?) FROM customers LIMIT 1", 120)))
        .toArray(CompletableFuture[]::new);
    CompletableFuture.allOf(parallel).join();
    return Map.of("report", "done");
  }

  @GetMapping("/fail")
  public Map<String, String> fail() {
    log.error("payment provider timed out");
    throw new IllegalStateException("payment provider timed out");
  }
}
