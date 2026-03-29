CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100),
  email VARCHAR(200),
  password VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',
  secret_token VARCHAR(64)
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INT,
  amount NUMERIC(10,2),
  status VARCHAR(50),
  card_number VARCHAR(20)
);
INSERT INTO users (username, email, password, role, secret_token) VALUES
('admin', 'admin@shop.com', 'admin_pass', 'admin', 'tok-admin-abc123'),
('alice', 'alice@shop.com', 'alice_pass', 'user', 'tok-alice-xyz456'),
('bob', 'bob@shop.com', 'bob_pass', 'user', 'tok-bob-789def');
INSERT INTO orders VALUES
(1, 1, 5000.00, 'completed', '4111111111111111'),
(2, 2, 150.00, 'pending', '4222222222222222'),
(3, 3, 89.99, 'completed', '4333333333333333');
