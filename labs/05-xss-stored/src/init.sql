CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100),
  session_token VARCHAR(64),
  is_admin TINYINT(1) DEFAULT 0
);

CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT,
  title VARCHAR(300),
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT,
  author VARCHAR(100),
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  bio TEXT,
  website VARCHAR(300)
);

INSERT INTO users VALUES
(1, 'admin', 'sess-admin-abc123', 1),
(2, 'alice', 'sess-alice-xyz789', 0),
(3, 'bob', 'sess-bob-def456', 0);

INSERT INTO posts VALUES
(1, 1, 'Welcome to our Blog!', 'This is the first post.', NOW()),
(2, 2, 'My thoughts on security', 'Security matters a lot these days.', NOW());

INSERT INTO profiles VALUES
(1, 1, 'I am the admin.', 'https://admin.internal'),
(2, 2, 'Developer and writer.', 'https://alice.dev');
