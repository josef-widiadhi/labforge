CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), password VARCHAR(100), role VARCHAR(20) DEFAULT 'user', is_admin BOOLEAN DEFAULT false, address TEXT, card_last4 VARCHAR(4), api_key VARCHAR(64), balance DECIMAL(10,2) DEFAULT 0);
CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INT, product VARCHAR(100), amount DECIMAL(10,2), status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW());
INSERT INTO users VALUES (1,'alice','alice@shop.com','pass123','user',false,'123 Main St','4242','key_alice_111',100.00);
INSERT INTO users VALUES (2,'bob','bob@shop.com','bobpass','user',false,'456 Oak Ave','1234','key_bob_222',50.00);
INSERT INTO users VALUES (3,'admin','admin@shop.com','adminpass','admin',true,'789 Admin Rd','0000','key_admin_secret',9999.00);
INSERT INTO orders VALUES (1,1,'Laptop',1299.99,'shipped',NOW());
INSERT INTO orders VALUES (2,2,'Phone',899.99,'delivered',NOW());
INSERT INTO orders VALUES (3,3,'Server',9999.00,'processing',NOW());
