const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

let redis;
(async () => {
  redis = createClient({ socket: { host: process.env.REDIS_HOST, port: 6379 } });
  await redis.connect();
  // Seed data
  await redis.hSet('user:1', { username: 'admin', password: 'admin_secret', role: 'admin', email: 'admin@corp.com' });
  await redis.hSet('user:2', { username: 'alice', password: 'alice_pass', role: 'user', email: 'alice@corp.com' });
  await redis.hSet('user:3', { username: 'bob', password: 'bob_pass', role: 'user', email: 'bob@corp.com' });
  await redis.set('session:token-abc', '1');
  await redis.set('session:token-xyz', '2');
  await redis.set('api_key:sk-admin-secret', 'admin');
  await redis.set('api_key:sk-user-123', 'alice');
  await redis.set('flag', 'FLAG{redis_injection_success}');
  console.log('Redis seeded');
})();

// 🔥 VULNERABILITY: Key name constructed from user input — Redis key injection
app.get('/user/profile', async (req, res) => {
  const { id } = req.query;
  // Attacker can manipulate the key name
  // e.g. id=1 → looks up user:1 (correct)
  // id=*   → redis KEYS user:* → dumps all users
  const key = `user:${id}`;
  const data = await redis.hGetAll(key);
  res.json(Object.keys(data).length ? data : { error: 'Not found' });
});

// 🔥 VULNERABILITY: KEYS pattern scan exposed via API
app.get('/search', async (req, res) => {
  const { pattern } = req.query;
  // Never expose KEYS command to users — blocks Redis, reveals all keys
  const keys = await redis.keys(pattern || '*');
  const result = {};
  for (const key of keys.slice(0, 50)) {
    const type = await redis.type(key);
    result[key] = type === 'hash' ? await redis.hGetAll(key) : await redis.get(key);
  }
  res.json(result);
});

// 🔥 VULNERABILITY: Session lookup injectable
app.get('/validate-session', async (req, res) => {
  const { token } = req.query;
  const userId = await redis.get(`session:${token}`);
  if (!userId) return res.json({ valid: false });
  const user = await redis.hGetAll(`user:${userId}`);
  res.json({ valid: true, user });
});

// 🔥 VULNERABILITY: Lua script injection via EVAL
app.post('/execute', async (req, res) => {
  const { script, key } = req.body;
  try {
    // Never let users run EVAL
    const result = await redis.eval(script, { keys: [key] });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({
  lab: '12 - NoSQL Injection (Redis Key Injection + KEYS Scan)',
  endpoints: [
    'GET /user/profile?id=1',
    'GET /search?pattern=*',
    'GET /validate-session?token=token-abc',
    'POST /execute  body:{script:"return redis.call(\'GET\',KEYS[1])", key:"flag"}'
  ]
}));

app.listen(3000, () => console.log('Lab 12 running on :3000'));
