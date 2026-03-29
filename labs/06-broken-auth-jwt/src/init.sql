CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100),
  password VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user'
);
INSERT INTO users (username, password, role) VALUES
('admin', 'admin123', 'admin'),
('alice', 'alice123', 'user'),
('bob', 'bob123', 'user');

CREATE TABLE secrets (
  id SERIAL PRIMARY KEY,
  owner VARCHAR(100),
  content TEXT
);
INSERT INTO secrets VALUES
(1, 'admin', 'API_MASTER_KEY=sk-prod-abc123xyz'),
(2, 'alice', 'My private diary entry...'),
(3, 'bob', 'Confidential project notes');
