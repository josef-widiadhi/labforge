CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100),
  email VARCHAR(200),
  api_key VARCHAR(64),
  balance NUMERIC(12,2)
);
INSERT INTO users (username, email, api_key, balance) VALUES
('alice', 'alice@bank.com', 'key-alice-secret-abc123', 50000.00),
('bob', 'bob@bank.com', 'key-bob-secret-xyz789', 12000.00),
('admin', 'admin@bank.com', 'key-admin-master-000', 999999.99);
