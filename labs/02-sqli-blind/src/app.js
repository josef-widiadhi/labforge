const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

let db;
(async () => {
  // Wait for MySQL to be ready
  for (let i = 0; i < 10; i++) {
    try {
      db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
      });
      console.log('DB connected');
      break;
    } catch (e) {
      console.log('Waiting for DB...', i);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
})();

// VULNERABLE: Blind SQLi — only returns true/false, no error leakage
// Attacker must use boolean-based or time-based blind injection
app.get('/users/exists', async (req, res) => {
  const { username } = req.query;
  try {
    // 🔥 VULNERABILITY: Concatenated query, but only returns boolean
    const [rows] = await db.query(`SELECT id FROM users WHERE username = '${username}' LIMIT 1`);
    // Only reveals existence — classic blind scenario
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    // Sanitized error — no SQL detail exposed
    res.status(500).json({ error: 'Query failed' });
  }
});

// Time-based blind entry point
app.get('/orders/status', async (req, res) => {
  const { order_id } = req.query;
  try {
    // 🔥 VULNERABILITY: Injectable but only returns status string
    const [rows] = await db.query(`SELECT status FROM orders WHERE id = ${order_id}`);
    if (rows.length > 0) {
      res.json({ status: rows[0].status });
    } else {
      res.json({ status: 'not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Cookie-based injection point
app.get('/profile', async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    // 🔥 VULNERABILITY: Header injection
    const [rows] = await db.query(`SELECT username, email FROM users WHERE id = ${userId}`);
    res.json(rows[0] || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

app.get('/', (req, res) => {
  res.json({
    lab: '02 - Blind SQL Injection (Boolean + Time-Based)',
    endpoints: [
      'GET /users/exists?username=alice  → returns {exists: true/false}',
      'GET /orders/status?order_id=1',
      'GET /profile  Header: X-User-Id: 1',
    ]
  });
});

app.listen(3000, () => console.log('Lab 02 running on :3000'));
