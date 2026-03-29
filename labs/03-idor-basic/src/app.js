const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432,
});

// Fake auth middleware — only checks if header exists, never validates ownership
const fakeAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Missing X-User-Id header' });
  req.userId = parseInt(userId);
  next();
};

// 🔥 IDOR VULNERABILITY: Returns ANY account by ID, no ownership check
app.get('/accounts/:id', fakeAuth, async (req, res) => {
  const { id } = req.params;
  // Should check: WHERE id = $1 AND owner_id = $2
  // But doesn't — any authenticated user can access any account
  const result = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// 🔥 IDOR: Transaction history for any account
app.get('/accounts/:id/transactions', fakeAuth, async (req, res) => {
  const { id } = req.params;
  // No check that req.userId owns account id
  const result = await pool.query(
    'SELECT * FROM transactions WHERE from_account = $1 OR to_account = $1 ORDER BY created_at DESC',
    [id]
  );
  res.json(result.rows);
});

// 🔥 IDOR: Download any document by ID
app.get('/documents/:id', fakeAuth, async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]); // Returns sensitive document content
});

// 🔥 IDOR: Update any account balance (no ownership check)
app.put('/accounts/:id/balance', fakeAuth, async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  await pool.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, id]);
  res.json({ message: 'Balance updated' });
});

app.get('/', (req, res) => {
  res.json({
    lab: '03 - IDOR (Integer ID)',
    note: 'Authenticate with header: X-User-Id: 1',
    endpoints: [
      'GET /accounts/:id',
      'GET /accounts/:id/transactions',
      'GET /documents/:id',
      'PUT /accounts/:id/balance  body: {amount}',
    ]
  });
});

app.listen(3000, () => console.log('Lab 03 running on :3000'));
