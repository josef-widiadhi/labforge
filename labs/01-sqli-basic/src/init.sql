CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100),
  password VARCHAR(100),
  email VARCHAR(200),
  role VARCHAR(50) DEFAULT 'user',
  secret_notes TEXT
);

INSERT INTO users (username, password, email, role, secret_notes) VALUES
('admin', 'SuperSecret123!', 'admin@corp.com', 'admin', 'AWS_KEY=AKIA...REDACTED'),
('alice', 'alice_pass', 'alice@corp.com', 'user', 'Personal note: salary is $120k'),
('bob', 'bob123', 'bob@corp.com', 'user', 'Draft contract in /var/secrets/bob.pdf');

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  price NUMERIC(10,2),
  internal_cost NUMERIC(10,2)
);

INSERT INTO products (name, price, internal_cost) VALUES
('Widget A', 29.99, 3.50),
('Widget B', 49.99, 8.00),
('Secret Product', 9999.99, 0.01);
