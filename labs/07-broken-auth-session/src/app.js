const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

let redis;
(async () => {
  redis = createClient({ socket: { host: process.env.REDIS_HOST, port: 6379 } });
  await redis.connect();
  // Seed some sessions
  await redis.set('sess-1001', JSON.stringify({ userId: 1, username: 'admin', role: 'admin' }), { EX: 86400 });
  await redis.set('sess-1002', JSON.stringify({ userId: 2, username: 'alice', role: 'user' }), { EX: 86400 });
  await redis.set('sess-1003', JSON.stringify({ userId: 3, username: 'bob', role: 'user' }), { EX: 86400 });
  console.log('Redis connected, sessions seeded');
})();

const USERS = {
  admin: { password: 'admin123', userId: 1, role: 'admin' },
  alice: { password: 'alice123', userId: 2, role: 'user' },
  bob:   { password: 'bob123',   userId: 3, role: 'user' },
};

// 🔥 VULNERABILITY: Predictable session token format: sess-{sequential_number}
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];
  if (!user || user.password !== password)
    return res.status(401).json({ error: 'Invalid credentials' });

  // Generate predictable session ID — sequential counter
  const counter = await redis.incr('session_counter');
  const sessionId = `sess-${1000 + counter}`;  // sess-1001, sess-1002 ...

  await redis.set(sessionId, JSON.stringify({
    userId: user.userId, username, role: user.role
  }), { EX: 86400 });

  res.json({ session_id: sessionId, message: 'Logged in' });
});

const sessionAuth = async (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(401).json({ error: 'Missing session' });
  const data = await redis.get(sessionId);
  if (!data) return res.status(403).json({ error: 'Invalid session' });
  req.user = JSON.parse(data);
  next();
};

app.get('/profile', sessionAuth, (req, res) => {
  res.json({ user: req.user, session: req.headers['x-session-id'] });
});

app.get('/admin/data', sessionAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ secret: 'Admin secret data', users: Object.keys(USERS) });
});

// 🔥 VULNERABILITY: Session fixation — server accepts client-supplied session ID
app.post('/set-session', async (req, res) => {
  const { session_id, username } = req.body;
  const user = USERS[username] || { userId: 99, role: 'user' };
  await redis.set(session_id, JSON.stringify({ userId: user.userId, username, role: user.role }), { EX: 3600 });
  res.json({ message: 'Session fixed', session_id });
});

app.get('/', (req, res) => res.json({
  lab: '07 - Broken Auth: Predictable Sessions + Session Fixation',
  endpoints: [
    'POST /login  body:{username,password} → returns session_id',
    'GET /profile  X-Session-Id: sess-XXXX',
    'GET /admin/data  X-Session-Id: sess-XXXX',
    'POST /set-session  body:{session_id,username}  ← session fixation'
  ],
  hint: 'Sessions are sequential: sess-1001, sess-1002... Try enumerating them!'
}));

app.listen(3000, () => console.log('Lab 07 running on :3000'));
