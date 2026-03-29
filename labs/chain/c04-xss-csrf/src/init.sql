CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), password VARCHAR(100), role VARCHAR(20) DEFAULT 'user', reset_token VARCHAR(64));
CREATE TABLE comments (id SERIAL PRIMARY KEY, user_id INT, content TEXT, created_at TIMESTAMP DEFAULT NOW());
INSERT INTO users VALUES (1,'admin','admin@corp.com','adminpass','admin',NULL);
INSERT INTO users VALUES (2,'student','student@corp.com','student123','user',NULL);
