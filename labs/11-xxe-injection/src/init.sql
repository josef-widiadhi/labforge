CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  customer VARCHAR(200),
  amount NUMERIC(10,2),
  status VARCHAR(50),
  xml_data TEXT
);
INSERT INTO invoices (customer, amount, status) VALUES
('Alice Corp', 5000.00, 'paid'),
('Bob Ltd', 12000.00, 'pending');
