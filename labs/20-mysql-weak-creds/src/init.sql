CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100),
  password VARCHAR(200),
  email VARCHAR(200),
  credit_card VARCHAR(20),
  ssn VARCHAR(11),
  role VARCHAR(50) DEFAULT 'user'
);
CREATE TABLE secrets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  value TEXT
);
INSERT INTO users (username, password, email, credit_card, ssn, role) VALUES
('admin', 'admin', 'admin@corp.com', '4111111111111111', '123-45-6789', 'admin'),
('alice', 'password', 'alice@corp.com', '4222222222222222', '987-65-4321', 'user'),
('bob', '123456', 'bob@corp.com', '4333333333333333', '111-22-3333', 'user');
INSERT INTO secrets (name, value) VALUES
('aws_access_key', 'AKIAIOSFODNN7EXAMPLE'),
('aws_secret', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
('stripe_live_key', 'sk_live_FAKEKEYFORLAB'),
('db_root_password', 'root');
