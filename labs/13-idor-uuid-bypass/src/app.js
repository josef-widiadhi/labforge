const express = require('express');
const { Pool } = require('pg');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });

const swaggerDoc = {
  openapi: '3.0.0',
  info: { title: 'Reports API', version: '1.0.0' },
  paths: {
    '/reports/{id}': { get: { summary: 'Get report by UUID', parameters: [{ name: 'id', in: 'path', schema: { type: 'string', format: 'uuid' } }] } },
    '/users/{id}/reports': { get: { summary: 'List reports for user' } },
    '/reports': { get: { summary: 'List all reports (leaks UUIDs!)' } }
  }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

const fakeAuth = (req, res, next) => {
  // 🔥 UUID used as auth token — if you know the UUID you're "authenticated"
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Missing X-User-Id' });
  req.userId = userId;
  next();
};

// 🔥 VULNERABILITY: UUID doesn't prevent IDOR — they're leaked in list endpoint
app.get('/reports', fakeAuth, async (req, res) => {
  // Returns ALL reports including UUIDs — leaks IDs needed to exploit IDOR
  const result = await pool.query('SELECT id, owner_id, title, is_confidential FROM reports');
  res.json(result.rows);
});

// 🔥 VULNERABILITY: No ownership check despite UUID usage
app.get('/reports/:id', fakeAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
  res.json(result.rows[0] || { error: 'Not found' });
});

// 🔥 VULNERABILITY: Predictable UUID pattern (all-same-digit) — guessable in this lab
// In real world: leaked via logs, referrer headers, email links, API responses
app.get('/users/:id/reports', fakeAuth, async (req, res) => {
  // No check that req.userId === req.params.id
  const result = await pool.query(
    'SELECT * FROM reports WHERE owner_id = $1',
    [req.params.id]
  );
  res.json(result.rows);
});

// 🔥 VULNERABILITY: Debug endpoint leaks all user UUIDs
app.get('/debug/users', async (req, res) => {
  const result = await pool.query('SELECT id, username, email, role FROM users');
  res.json(result.rows);
});

app.get('/', (req, res) => res.json({
  lab: '13 - IDOR UUID Bypass',
  swagger: 'http://localhost:8013/api-docs',
  hint: 'UUIDs look secure but: 1) GET /reports leaks all IDs, 2) /debug/users leaks all user UUIDs, 3) no ownership check on /reports/:id'
}));

app.listen(3000, () => console.log('Lab 13 running on :3000'));
