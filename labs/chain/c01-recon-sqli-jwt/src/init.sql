CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), password VARCHAR(100), role VARCHAR(20) DEFAULT 'user', secret_data TEXT);
INSERT INTO users VALUES (1,'alice','alice@corp.com','password123','user','Nothing here');
INSERT INTO users VALUES (2,'bob','bob@corp.com','bobpass','user','Team lead notes');
INSERT INTO users VALUES (3,'admin','admin@corp.com','letmein','admin','FLAG_PART2: chain_complete');
