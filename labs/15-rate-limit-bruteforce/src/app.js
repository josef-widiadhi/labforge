const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });
let redis;
(async () => {
  redis = createClient({ socket: { host: process.env.REDIS_HOST, port: 6379 } });
  await redis.connect();
  console.log('Redis connected');
})();

// 🔥 VULNERABILITY 1: Login with NO rate limiting whatsoever
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
  if (result.rows.length > 0) {
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
    return res.json({ success: true, token, user: result.rows[0] });
  }
  // 🔥 Consistent response time regardless of username existence (slightly better)
  // but still no lockout, no delay, no CAPTCHA
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// 🔥 VULNERABILITY 2: PIN verification — 6-digit PIN with no rate limiting (1M combinations)
app.post('/verify-pin', async (req, res) => {
  const { username, pin } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1 AND pin = $2', [username, pin]);
  if (result.rows.length > 0) {
    return res.json({ success: true, message: 'PIN verified', user: result.rows[0] });
  }
  res.status(401).json({ success: false, message: 'Wrong PIN' });
});

// 🔥 VULNERABILITY 3: MFA code verification — 6-digit with no rate limit
app.post('/verify-mfa', async (req, res) => {
  const { username, code } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1 AND mfa_code = $2', [username, code]);
  if (result.rows.length > 0) {
    return res.json({ success: true, message: 'MFA verified!' });
  }
  res.status(401).json({ success: false });
});

// 🔥 VULNERABILITY 4: Password reset with predictable + no-rate-limited OTP
app.post('/reset-password/request', async (req, res) => {
  const { username } = req.body;
  // OTP is just a 4-digit number — only 10000 combinations, no rate limiting
  const otp = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  await redis.set(`reset:${username}`, otp, { EX: 300 });
  // In real app would send email; here we "leak" it for demo
  res.json({ message: 'OTP sent', debug_otp: otp });
});

app.post('/reset-password/verify', async (req, res) => {
  const { username, otp, new_password } = req.body;
  const stored = await redis.get(`reset:${username}`);
  if (!stored || stored !== otp) {
    return res.status(401).json({ success: false, message: 'Wrong OTP' });
  }
  await pool.query('UPDATE users SET password = $1 WHERE username = $2', [new_password, username]);
  await redis.del(`reset:${username}`);
  res.json({ success: true, message: 'Password reset!' });
});

// 🔥 VULNERABILITY 5: Account enumeration — different response for valid vs invalid username
app.post('/check-username', async (req, res) => {
  const { username } = req.body;
  const result = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  // Leaks whether user exists — enables targeted brute force
  res.json({ exists: result.rows.length > 0 });
});

app.get('/', (req, res) => res.json({
  lab: '15 - No Rate Limiting / Brute Force',
  endpoints: [
    'POST /login  body:{username,password}  ← no lockout',
    'POST /verify-pin  body:{username,pin}  ← 6-digit PIN, no lockout',
    'POST /verify-mfa  body:{username,code}  ← no lockout',
    'POST /reset-password/request  body:{username}',
    'POST /reset-password/verify  body:{username,otp,new_password}  ← 4-digit OTP',
    'POST /check-username  body:{username}  ← user enumeration'
  ]
}));

app.listen(3000, () => console.log('Lab 15 running on :3000'));
