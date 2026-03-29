// C01 — Chain Lab: Recon → SQLi → JWT Forge
// Stage 1: Swagger exposes hidden /admin endpoint
// Stage 2: SQLi on /api/search dumps password hashes
// Stage 3: Weak JWT secret → forge admin token
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const app = express();
app.use(express.json());

const pool = new Pool({ host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME, port:5432 });
const JWT_SECRET = 'letmein';  // 🔥 weak secret

// STAGE 1: Swagger exposes /admin/flag endpoint (student must find this via docs)
const swaggerDoc = {
  openapi:'3.0.0', info:{title:'AcmeCorp API',version:'1.0'},
  paths:{
    '/api/search':        {get:{summary:'Search users',parameters:[{in:'query',name:'q',schema:{type:'string'}}]}},
    '/api/login':         {post:{summary:'Login',requestBody:{content:{'application/json':{schema:{example:{username:'alice',password:'pass'}}}}}}},
    '/api/admin/flag':    {get:{summary:'Get flag — ADMIN ONLY',security:[{bearerAuth:[]}]}},  // 🔥 hidden endpoint revealed by swagger
    '/api/admin/users':   {get:{summary:'All users with hashes — ADMIN ONLY'}},
  }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// STAGE 2: SQLi on search
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  try {
    // 🔥 raw concat → SQLi
    const r = await pool.query(`SELECT id,username,email FROM users WHERE username LIKE '%${q||''}%'`);
    res.json({ results: r.rows, count: r.rows.length });
  } catch(e) {
    res.status(500).json({ error: e.message });  // 🔥 error disclosure
  }
});

// Login — also injectable but not the main path
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await pool.query(`SELECT * FROM users WHERE username='${username}' AND password='${password}'`);
    if (!r.rows.length) return res.status(401).json({ error:'Invalid credentials' });
    const user = r.rows[0];
    const token = jwt.sign({ id:user.id, username:user.username, role:user.role }, JWT_SECRET, { expiresIn:'1h' });
    res.json({ token, role:user.role });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// STAGE 3: JWT auth — weak secret, accepts forged tokens
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error:'Token required', hint:'Forge a JWT with role:admin using the weak secret' });
  try {
    // 🔥 algorithms not restricted — accepts none or any
    req.user = jwt.verify(token, JWT_SECRET, { algorithms:['HS256','none'] });
    if (req.user.role !== 'admin') return res.status(403).json({ error:'Admin only', hint:'Your token role is: '+req.user.role });
    next();
  } catch(e) { res.status(401).json({ error:'Invalid token: '+e.message, hint:'Try jwt_tool or python3 -c "import base64,json;..."' }); }
}

app.get('/api/admin/flag', requireAdmin, (req, res) => {
  res.json({ flag:'FLAG{recon_sqli_jwt_chain_complete}', message:`Welcome ${req.user.username} — chain complete!`, stages_completed:3 });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const r = await pool.query('SELECT * FROM users');
  res.json({ users:r.rows, note:'Password hashes exposed — crack them!' });
});

app.get('/', (req, res) => {
  res.json({ lab:'C01 — Recon→SQLi→JWT Chain', stages:[
    'Stage 1: GET /api-docs — find the hidden admin endpoint',
    'Stage 2: GET /api/search?q= — SQLi to dump all users+hashes',
    'Stage 3: Forge JWT with role:admin (secret: try common words) → GET /api/admin/flag',
  ], tools:['burpsuite','sqlmap','jwt_tool'] });
});

app.listen(3000, () => console.log('[C01] Chain lab running on :3000'));
