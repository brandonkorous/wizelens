CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, sku VARCHAR(20) NOT NULL);
CREATE TABLE IF NOT EXISTS items (id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, name VARCHAR(100) NOT NULL);
-- SLEEP_MS(n) waits n ms, so the sample can show slow queries.
CREATE ALIAS IF NOT EXISTS SLEEP_MS FOR 'com.wizelens.samples.orders.SqlFunctions.sleepMs';
