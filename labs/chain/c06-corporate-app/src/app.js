// C06 — Full Pentest: Corporate Web App
// Open-ended scenario. Find and exploit all 7 vulnerabilities:
//   1. SQLi on /api/search
//   2. IDOR on /api/users/:id
//   3. Broken Auth (JWT weak secret)
//   4. CORS misconfiguration
//   5. Mass Assignment on /api/profile
//   6. Info Disclosure via /api-docs and /debug
//   7. Weak credentials (admin:admin123)
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const pool = new Pool({ host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME, port:5432 });
const SECRET = 'corp2024';

// ── VULN 4: CORS — reflects Origin with credentials allowed ──────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);          // 🔥 reflects any origin
  res.setHeader('Access-Control-Allow-Credentials', 'true');     // 🔥 + credentials
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── VULN 6: Info disclosure — verbose headers ─────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Express/4.18 Node/20 — CorporateApp v1.2.3');
  res.setHeader('X-Internal-Build', 'prod-server-01 build-2024-01-15');
  next();
});

// ── VULN 6: Swagger left on in production ────────────────────────────────────
const swaggerDoc = {
  openapi:'3.0.0', info:{title:'AcmeCorp Internal API',version:'1.2.3', description:'INTERNAL USE ONLY'},
  paths:{
    '/api/auth/login':    {post:{summary:'Login — try admin:admin123'}},
    '/api/search':        {get:{summary:'Search users — SQLi here',parameters:[{in:'query',name:'q'}]}},
    '/api/users/{id}':    {get:{summary:'User profile — IDOR, no ownership check'}},
    '/api/profile':       {put:{summary:'Update profile — mass assignment vuln'}},
    '/api/orders':        {get:{summary:'All orders — no filtering by user'}},
    '/api/admin/config':  {get:{summary:'Server config — admin only, JWT bypassable'}},
    '/debug':             {get:{summary:'Debug info — accidentally left on'}},
  }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// ── VULN 6: Debug endpoint with env vars ─────────────────────────────────────
app.get('/debug', (req, res) => {
  res.json({
    warning: '🔥 VULN 6: Debug endpoint should be disabled in production',
    env: { DB_HOST: process.env.DB_HOST, DB_USER: process.env.DB_USER, NODE_ENV: process.env.NODE_ENV||'production' },
    jwt_secret_hint: 'corp + year',
    flags_location: 'GET /api/admin/config after auth bypass',
  });
});

// ── VULN 7: Weak credentials ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  // 🔥 VULN 1 also here: SQLi
  try {
    const r = await pool.query(`SELECT * FROM corp_users WHERE username='${username}' AND password='${password}'`);
    if (!r.rows.length) return res.status(401).json({ error:'Invalid', hint:'Try common passwords...' });
    const u = r.rows[0];
    const token = jwt.sign({ id:u.id, username:u.username, role:u.role }, SECRET, { expiresIn:'2h' });
    res.json({ token, role:u.role, flags_found:0 });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

function authMw(req,res,next) {
  const t = req.headers.authorization?.split(' ')[1];
  if (!t) return res.status(401).json({ error:'Token required' });
  try { req.user = jwt.verify(t, SECRET, { algorithms:['HS256','none'] }); next(); }
  catch(e) { res.status(401).json({ error:e.message }); }
}

// ── VULN 1: SQLi ─────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  try {
    const r = await pool.query(`SELECT id,username,email,department FROM corp_users WHERE username LIKE '%${q||''}%'`);
    res.json({ results:r.rows, vuln:'🔥 SQLi here — try UNION SELECT' });
  } catch(e) { res.status(500).json({ error:e.message, query:`...WHERE username LIKE '%${q}%'` }); }
});

// ── VULN 2: IDOR ─────────────────────────────────────────────────────────────
app.get('/api/users/:id', authMw, async (req, res) => {
  const r = await pool.query('SELECT * FROM corp_users WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error:'Not found' });
  res.json({ user:r.rows[0], vuln:'🔥 IDOR — no ownership check, try IDs 1-10' });
});

// ── VULN 5: Mass Assignment ───────────────────────────────────────────────────
app.put('/api/profile', authMw, async (req, res) => {
  const fields = Object.keys(req.body);
  const values = Object.values(req.body);
  const set = fields.map((f,i)=>`${f}=$${i+1}`).join(', ');
  try {
    await pool.query(`UPDATE corp_users SET ${set} WHERE id=$${fields.length+1}`, [...values, req.user.id]);
    const r = await pool.query('SELECT * FROM corp_users WHERE id=$1', [req.user.id]);
    res.json({ updated:r.rows[0], vuln:'🔥 Mass assignment — try {"role":"admin"}' });
  } catch(e) { res.status(400).json({ error:e.message }); }
});

// ── VULN 3 (JWT) + VULN 2 (IDOR): Orders dump ─────────────────────────────────
app.get('/api/orders', authMw, async (req, res) => {
  const r = await pool.query('SELECT o.*,u.email,u.address,u.card_last4 FROM corp_orders o JOIN corp_users u ON o.user_id=u.id');
  res.json({ orders:r.rows, vuln:'🔥 All orders returned — no per-user filter' });
});

// ── Admin — JWT bypass with weak secret ──────────────────────────────────────
app.get('/api/admin/config', authMw, async (req, res) => {
  const current = await pool.query('SELECT * FROM corp_users WHERE id=$1', [req.user.id]);
  if (current.rows[0]?.role !== 'admin') return res.status(403).json({ error:'Admin only', hint:'Forge JWT with role:admin — secret is corp+year format' });
  res.json({
    flags: {
      flag1: 'FLAG{sqli_found}',
      flag2: 'FLAG{idor_exploited}',
      flag3: 'FLAG{jwt_bypassed}',
      flag4: 'FLAG{cors_exploited}',
      flag5: 'FLAG{mass_assignment}',
      flag6: 'FLAG{info_disclosure}',
      flag7: 'FLAG{weak_credentials}',
    },
    server_config: { db_host: process.env.DB_HOST, secret_key: SECRET, env: 'production' },
    message: '🏆 All 7 vulnerabilities found! Document them in your pentest report.',
  });
});

app.get('/', (req, res) => {
  res.json({
    lab: 'C06 — Full Pentest: Corporate App',
    objective: 'Find all 7 hidden vulnerabilities and document each with proof of concept',
    hints: ['Check /api-docs', 'Check /debug', 'Try common credentials', 'Every endpoint has a vuln'],
  });
});

app.listen(3000, () => console.log('[C06] Corporate pentest lab on :3000'));
