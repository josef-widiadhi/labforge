CREATE TABLE corp_users (id SERIAL PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), password VARCHAR(100), role VARCHAR(20) DEFAULT 'user', department VARCHAR(50), address TEXT, card_last4 VARCHAR(4));
CREATE TABLE corp_orders (id SERIAL PRIMARY KEY, user_id INT, product VARCHAR(100), amount DECIMAL(10,2), status VARCHAR(20) DEFAULT 'pending');
INSERT INTO corp_users VALUES (1,'admin','admin@acmecorp.com','admin123','admin','IT','1 Corp HQ','0000');
INSERT INTO corp_users VALUES (2,'alice','alice@acmecorp.com','alice2024','user','Finance','2 Finance St','4242');
INSERT INTO corp_users VALUES (3,'bob','bob@acmecorp.com','password','user','Engineering','3 Dev Lane','1234');
INSERT INTO corp_orders VALUES (1,1,'Server License',9999.00,'paid');
INSERT INTO corp_orders VALUES (2,2,'SaaS Plan',299.00,'paid');
INSERT INTO corp_orders VALUES (3,3,'Hardware',1499.00,'shipped');
