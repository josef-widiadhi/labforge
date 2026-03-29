// C05 — Mass Assignment → IDOR → Data Exfiltration
// Stage 1: PUT /api/users/me with {role:"admin"} → privilege escalation
// Stage 2: GET /api/users/1..N → IDOR enumerate all profiles
// Stage 3: GET /api/orders → dump all orders including card_last4
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const pool = new Pool({ host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME, port:5432 });
const SECRET = 'api_secret_2024';

app.get('/', (req, res) => {
  res.json({
    lab: 'C05 — Mass Assignment → IDOR → Data Exfil',
    stages: [
      'Stage 1: POST /api/auth/register then PUT /api/users/me {"role":"admin","is_admin":true}',
      'Stage 2: GET /api/users/1, /2, /3... — no ownership check, read all profiles',
      'Stage 3: GET /api/orders — all orders visible, includes card_last4 and address',
      'Stage 4: GET /api/admin/dump — only accessible after escalating to admin',
    ],
    hint: 'Start: POST /api/auth/register {"username":"attacker","password":"attack123"}',
  });
});

function authMw(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username+password required' });
  try {
    const r = await pool.query('INSERT INTO users (username,password,role,is_admin) VALUES ($1,$2,$3,$4) RETURNING id,username,role', [username,password,'user',false]);
    const token = jwt.sign({ id:r.rows[0].id, username, role:'user', is_admin:false }, SECRET);
    res.json({ token, user: r.rows[0] });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const r = await pool.query('SELECT * FROM users WHERE username=$1 AND password=$2', [username, password]);
  if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const u = r.rows[0];
  const token = jwt.sign({ id:u.id, username:u.username, role:u.role, is_admin:u.is_admin }, SECRET);
  res.json({ token, role: u.role });
});

// 🔥 VULN: Mass assignment — passes full body to UPDATE, no field whitelist
app.put('/api/users/me', authMw, async (req, res) => {
  const fields = Object.keys(req.body);
  const values = Object.values(req.body);
  if (!fields.length) return res.status(400).json({ error: 'No fields provided' });
  const set = fields.map((f,i) => `${f}=$${i+1}`).join(', ');
  try {
    await pool.query(`UPDATE users SET ${set} WHERE id=$${fields.length+1}`, [...values, req.user.id]);
    const r = await pool.query('SELECT id,username,email,role,is_admin,balance FROM users WHERE id=$1', [req.user.id]);
    res.json({ updated: true, user: r.rows[0], note: '🔥 Try body: {"role":"admin","is_admin":true}' });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// 🔥 VULN: IDOR — no ownership check, returns full profile including address+card
app.get('/api/users/:id', authMw, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(r.rows[0]);  // includes card_last4, address, api_key
});

// 🔥 VULN: Returns ALL orders regardless of ownership
app.get('/api/orders', authMw, async (req, res) => {
  const r = await pool.query('SELECT o.*,u.username,u.email,u.address,u.card_last4 FROM orders o JOIN users u ON o.user_id=u.id');
  res.json({ orders: r.rows, note: '🔥 All orders visible regardless of auth — includes card_last4+address' });
});

// Admin dump — only works after mass assignment escalation
app.get('/api/admin/dump', authMw, async (req, res) => {
  const current = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!current.rows[0]?.is_admin) return res.status(403).json({ error: 'Admins only', hint: 'Escalate via PUT /api/users/me {"is_admin":true}' });
  const users  = await pool.query('SELECT * FROM users');
  const orders = await pool.query('SELECT * FROM orders');
  res.json({ flag: 'FLAG{mass_assign_idor_exfil}', users: users.rows, orders: orders.rows });
});

app.listen(3000, () => console.log('[C05] Mass Assignment+IDOR lab on :3000'));
