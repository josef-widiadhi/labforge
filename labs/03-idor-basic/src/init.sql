CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  owner VARCHAR(100),
  balance NUMERIC(12,2),
  account_number VARCHAR(20),
  iban VARCHAR(34)
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  from_account INT,
  to_account INT,
  amount NUMERIC(12,2),
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  account_id INT,
  filename VARCHAR(200),
  content TEXT
);

INSERT INTO accounts VALUES
(1, 'Alice Smith', 52000.00, 'ACC-0001', 'GB29NWBK60161331926819'),
(2, 'Bob Jones', 850.50, 'ACC-0002', 'GB29NWBK60161331926820'),
(3, 'Admin Corp', 9999999.99, 'ACC-0003', 'GB29NWBK60161331926821');

INSERT INTO transactions VALUES
(1, 1, 2, 500.00, 'Rent payment', NOW()),
(2, 2, 1, 100.00, 'Refund', NOW()),
(3, 3, 1, 50000.00, 'Salary - confidential', NOW());

INSERT INTO documents VALUES
(1, 1, 'alice_tax_return_2023.pdf', 'TAX SENSITIVE DATA: income=52000 deductions=8000'),
(2, 2, 'bob_contract.pdf', 'Employment contract - salary 28000/yr probation ends Jan 2024'),
(3, 3, 'admin_financials.pdf', 'CONFIDENTIAL: Q4 revenue $12M, acquisition target: CompanyX');
