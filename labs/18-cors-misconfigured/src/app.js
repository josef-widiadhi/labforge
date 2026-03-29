const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });

// 🔥 VULNERABILITY 1: Wildcard CORS with credentials
// This combination is actually blocked by browsers but many misconfigured APIs
// reflect the Origin header allowing any domain + credentials
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    // 🔥 Reflects any Origin back — allows any domain to make credentialed requests
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const swaggerDoc = {
  openapi: '3.0.0',
  info: { title: 'Banking API', version: '1.0.0' },
  paths: {
    '/account': { get: { summary: 'Get your account details (requires cookie auth)' } },
    '/transfer': { post: { summary: 'Transfer money between accounts' } },
    '/api-key': { get: { summary: 'Get your API key' } }
  }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// Cookie-based auth (vulnerable to CSRF + CORS combo)
const cookieAuth = (req, res, next) => {
  const session = req.headers['x-session'] || req.cookies?.session;
  const userId = parseInt(req.headers['x-user-id'] || '1');
  req.userId = userId;
  next();
};

app.get('/account', cookieAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  res.json(result.rows[0]);
});

app.post('/transfer', cookieAuth, async (req, res) => {
  const { to_user_id, amount } = req.body;
  // 🔥 No CSRF protection + permissive CORS = cross-origin funds transfer
  await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.userId]);
  await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, to_user_id]);
  res.json({ message: `Transferred $${amount}`, from: req.userId, to: to_user_id });
});

app.get('/api-key', cookieAuth, async (req, res) => {
  const result = await pool.query('SELECT api_key FROM users WHERE id = $1', [req.userId]);
  res.json({ api_key: result.rows[0]?.api_key });
});

// 🔥 VULNERABILITY 2: Null origin also allowed (allows file:// and sandboxed iframes)
app.get('/admin/data', (req, res) => {
  const origin = req.headers.origin;
  if (origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.json({ secret: 'Admin internal data', db_password: 'admin_db_pass_123' });
});

app.get('/', (req, res) => res.json({
  lab: '18 - CORS Misconfiguration',
  swagger: 'http://localhost:8018/api-docs',
  vulnerabilities: [
    '1. Origin reflection: any site can make credentialed cross-origin requests',
    '2. null origin allowed: file:// and sandboxed iframes can access /admin/data',
    '3. No CSRF token on /transfer'
  ],
  exploit_html: 'Create evil.html that fetches http://localhost:8018/account with credentials'
}));

app.listen(3000, () => console.log('Lab 18 running on :3000'));
