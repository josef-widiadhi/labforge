CREATE TABLE uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(300),
  original_name VARCHAR(300),
  mimetype VARCHAR(100),
  uploaded_at TIMESTAMP DEFAULT NOW()
);
