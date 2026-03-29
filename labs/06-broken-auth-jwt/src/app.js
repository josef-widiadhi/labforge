const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });
const SECRET = process.env.JWT_SECRET; // 'secret123' — weak and guessable

// Login — returns JWT
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
  if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const user = result.rows[0];
  // 🔥 VULNERABILITY 1: Weak secret used for JWT signing
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '24h' });
  res.json({ token });
});

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    // 🔥 VULNERABILITY 2: Accepts 'none' algorithm — attacker can forge tokens without signature
    // jsonwebtoken v8 and below was vulnerable; we simulate by accepting alg:none manually
    const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256', 'none'] });
    req.user = decoded;
    next();
  } catch (err) {
    // 🔥 VULNERABILITY 3: Try to decode without verification as fallback
    try {
      req.user = jwt.decode(token); // decode without verify!
      if (req.user) return next();
    } catch (e) {}
    res.status(403).json({ error: 'Invalid token' });
  }
};

app.get('/secrets', verifyToken, async (req, res) => {
  // 🔥 VULNERABILITY 4: Role taken directly from JWT payload — attacker can set role=admin
  if (req.user.role !== 'admin') {
    const result = await pool.query('SELECT * FROM secrets WHERE owner = $1', [req.user.username]);
    return res.json(result.rows);
  }
  const result = await pool.query('SELECT * FROM secrets');
  res.json(result.rows);
});

app.get('/admin/users', verifyToken, async (req, res) => {
  // 🔥 Role check based on JWT claim — forgeable
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const result = await pool.query('SELECT * FROM users');
  res.json(result.rows);
});

app.get('/', (req, res) => res.json({
  lab: '06 - Broken Auth (JWT None Algorithm + Weak Secret)',
  endpoints: ['POST /login  body:{username,password}', 'GET /secrets  Bearer token', 'GET /admin/users  Bearer token'],
  hint: 'Try: 1) brute-force the JWT secret, 2) forge a token with alg:none, 3) modify role claim'
}));

app.listen(3000, () => console.log('Lab 06 running on :3000'));
