CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE,
  email VARCHAR(200),
  password VARCHAR(200),
  role VARCHAR(50) DEFAULT 'user',
  is_verified TINYINT(1) DEFAULT 0,
  credits INT DEFAULT 0,
  is_banned TINYINT(1) DEFAULT 0
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200),
  price DECIMAL(10,2),
  discount_pct INT DEFAULT 0,
  internal_sku VARCHAR(50)
);

INSERT INTO users (username, email, password, role, is_verified, credits) VALUES
('admin', 'admin@shop.com', 'admin123', 'admin', 1, 999999),
('alice', 'alice@shop.com', 'alice123', 'user', 0, 100),
('bob', 'bob@shop.com', 'bob123', 'user', 1, 50);

INSERT INTO products (name, price, discount_pct, internal_sku) VALUES
('Laptop', 1299.99, 0, 'SKU-LAP-001'),
('Mouse', 29.99, 10, 'SKU-MOU-002'),
('Monitor', 399.99, 0, 'SKU-MON-003');
