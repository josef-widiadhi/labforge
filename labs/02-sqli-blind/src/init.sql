CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100),
  password VARCHAR(255),
  email VARCHAR(200),
  is_admin TINYINT(1) DEFAULT 0,
  api_key VARCHAR(64)
);

INSERT INTO users (username, password, email, is_admin, api_key) VALUES
('admin', 'md5hashofpassword', 'admin@shop.com', 1, 'sk-admin-8f3a2b1c9d4e5f6a'),
('alice', 'alicehash123', 'alice@shop.com', 0, 'sk-alice-1a2b3c4d5e6f7a8b'),
('bob', 'bobhash456', 'bob@shop.com', 0, 'sk-bob-9z8y7x6w5v4u3t2s');

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  total DECIMAL(10,2),
  status VARCHAR(50),
  card_last4 VARCHAR(4)
);

INSERT INTO orders VALUES
(1, 1, 999.99, 'completed', '4242'),
(2, 2, 49.99, 'pending', '1234'),
(3, 3, 29.99, 'completed', '5678');
