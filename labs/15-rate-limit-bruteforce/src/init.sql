CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100),
  password VARCHAR(100),
  pin VARCHAR(6),
  role VARCHAR(50) DEFAULT 'user',
  mfa_code VARCHAR(6)
);
INSERT INTO users (username, password, pin, role, mfa_code) VALUES
('admin', 'SuperSecret!99', '123456', 'admin', '998877'),
('alice', 'alice_pass_2024', '654321', 'user', '112233'),
('bob', 'correct_horse_battery', '000000', 'user', '445566');
