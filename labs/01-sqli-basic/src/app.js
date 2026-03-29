const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432,
});

// VULNERABLE: Direct string interpolation — SQL Injection
app.get('/users/search', async (req, res) => {
  const { username } = req.query;
  try {
    // 🔥 VULNERABILITY: Raw string concatenation — never do this!
    const query = `SELECT id, username, email, role, secret_notes FROM users WHERE username = '${username}'`;
    console.log('Executing query:', query);
    const result = await pool.query(query);
    res.json({ users: result.rows, query_executed: query });
  } catch (err) {
    // 🔥 VULNERABILITY: Full error message exposed to client
    res.status(500).json({ error: err.message, detail: err.detail, query: err.query });
  }
});

// VULNERABLE: Login also injectable
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    const result = await pool.query(query);
    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/products', async (req, res) => {
  const { name } = req.query;
  try {
    const query = name
      ? `SELECT * FROM products WHERE name ILIKE '%${name}%'`
      : 'SELECT * FROM products';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    lab: '01 - SQL Injection (Error-Based)',
    endpoints: [
      'GET /users/search?username=alice',
      'POST /login  body: {username, password}',
      'GET /products?name=widget',
    ]
  });
});

app.listen(3000, () => console.log('Lab 01 running on :3000'));
