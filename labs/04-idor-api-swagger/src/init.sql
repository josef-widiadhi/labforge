CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(200),
  department VARCHAR(100),
  salary NUMERIC(10,2),
  ssn VARCHAR(11),
  manager_id INT
);

CREATE TABLE payslips (
  id SERIAL PRIMARY KEY,
  employee_id INT,
  month VARCHAR(7),
  gross NUMERIC(10,2),
  net NUMERIC(10,2),
  deductions JSONB
);

CREATE TABLE performance_reviews (
  id SERIAL PRIMARY KEY,
  employee_id INT,
  reviewer_id INT,
  score INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO employees VALUES
(1, 'Alice Manager', 'alice@company.com', 'Engineering', 120000, '123-45-6789', NULL),
(2, 'Bob Dev', 'bob@company.com', 'Engineering', 75000, '987-65-4321', 1),
(3, 'Carol HR', 'carol@company.com', 'HR', 85000, '111-22-3333', 1),
(4, 'Dave CEO', 'dave@company.com', 'Executive', 450000, '444-55-6666', NULL);

INSERT INTO payslips VALUES
(1, 1, '2024-01', 10000.00, 7200.00, '{"tax": 2800}'),
(2, 2, '2024-01', 6250.00, 4500.00, '{"tax": 1750}'),
(3, 3, '2024-01', 7083.33, 5100.00, '{"tax": 1983}'),
(4, 4, '2024-01', 37500.00, 25000.00, '{"tax": 12500}');

INSERT INTO performance_reviews VALUES
(1, 2, 1, 3, 'Needs improvement. Attitude issues noted. Put on PIP.', NOW()),
(2, 3, 1, 5, 'Excellent performer. Promoted next quarter.', NOW()),
(3, 4, 1, 4, 'Good work on the acquisition deal.', NOW());
