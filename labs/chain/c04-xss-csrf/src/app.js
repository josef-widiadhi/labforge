// C04 — XSS → CSRF → Account Takeover
// Stage 1: Stored XSS in comment field (no sanitisation)
// Stage 2: XSS payload delivers CSRF to change admin email
// Stage 3: Trigger password reset on new email → admin takeover
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const crypto  = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'weak_session_secret', resave: false, saveUninitialized: true }));

const pool = new Pool({ host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME, port:5432 });

app.get('/', (req, res) => {
  res.json({
    lab: 'C04 — XSS → CSRF → Account Takeover',
    stages: [
      'Stage 1: POST /comments — inject a stored XSS payload',
      'Stage 2: GET /comments — your XSS fires for every visitor including admin',
      'Stage 3: XSS delivers CSRF → POST /account/email to change admin email',
      'Stage 4: GET /account/reset?username=admin → get reset token → login as admin',
    ],
    credentials: { student: 'student / student123', admin: 'admin / adminpass' },
  });
});

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required', hint: 'POST /login' });
  next();
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const r = await pool.query('SELECT * FROM users WHERE username=$1 AND password=$2', [username, password]);
  if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = r.rows[0];
  res.json({ logged_in: true, role: r.rows[0].role });
});

// 🔥 VULN: Comments stored and returned without sanitisation → stored XSS
app.post('/comments', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  await pool.query('INSERT INTO comments (user_id, content) VALUES ($1,$2)', [req.session.user.id, content]);
  res.json({ success: true, note: '🔥 Content stored without sanitisation — XSS payload will fire for every visitor' });
});

app.get('/comments', async (req, res) => {
  const r = await pool.query('SELECT c.id, u.username, c.content, c.created_at FROM comments c JOIN users u ON c.user_id=u.id ORDER BY c.id DESC');
  res.json({ comments: r.rows, note: '🔥 content field is unsanitised — XSS fires on render' });
});

// 🔥 VULN: No CSRF token — any site can POST to this endpoint
app.post('/account/email', auth, async (req, res) => {
  const { new_email } = req.body;
  if (!new_email) return res.status(400).json({ error: 'new_email required' });
  await pool.query('UPDATE users SET email=$1 WHERE id=$2', [new_email, req.session.user.id]);
  res.json({ success: true, new_email, warning: '🔥 No CSRF token — any page can trigger this via XSS' });
});

// Password reset — no rate limit, token visible in response for demo
app.get('/account/reset', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: '?username= required' });
  const r = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
  const token = crypto.randomBytes(8).toString('hex');
  await pool.query('UPDATE users SET reset_token=$1 WHERE username=$2', [token, username]);
  res.json({ reset_token: token, hint: 'POST /account/reset with this token + new password', email: r.rows[0].email });
});

app.post('/account/reset', async (req, res) => {
  const { token, new_password } = req.body;
  const r = await pool.query('SELECT * FROM users WHERE reset_token=$1', [token]);
  if (!r.rows.length) return res.status(400).json({ error: 'Invalid token' });
  await pool.query('UPDATE users SET password=$1, reset_token=NULL WHERE reset_token=$2', [new_password, token]);
  res.json({ success: true, flag: 'FLAG{xss_csrf_account_takeover}', message: 'Admin account fully taken over!' });
});

app.listen(3000, () => console.log('[C04] XSS+CSRF lab on :3000'));
