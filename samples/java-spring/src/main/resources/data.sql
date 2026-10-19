INSERT INTO customers (id, name) VALUES (1, 'Ada'), (2, 'Grace');
INSERT INTO orders (customer_id, sku) VALUES (1, 'KB-1'), (2, 'MS-2'), (1, 'MN-3'), (2, 'HS-4'), (1, 'WC-5'), (2, 'DK-6');
INSERT INTO items (order_id, name) VALUES (1, 'KB-1 box'), (1, 'KB-1 cable'), (2, 'MS-2 box'), (2, 'MS-2 cable'),
  (3, 'MN-3 box'), (3, 'MN-3 cable'), (4, 'HS-4 box'), (4, 'HS-4 cable'), (5, 'WC-5 box'), (5, 'WC-5 cable'),
  (6, 'DK-6 box'), (6, 'DK-6 cable');
