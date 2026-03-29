CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  url TEXT,
  last_response TEXT
);
INSERT INTO webhooks VALUES
(1, 'payment-notify', 'https://payment.example.com/hook', NULL),
(2, 'slack-alerts', 'https://hooks.slack.com/xxx', NULL);
