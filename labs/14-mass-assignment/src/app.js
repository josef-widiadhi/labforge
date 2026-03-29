const express = require('express');
const mysql = require('mysql2/promise');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

let db;
(async () => {
  for (let i = 0; i < 10; i++) {
    try {
      db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
      break;
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
})();

const swaggerDoc = {
  openapi: '3.0.0',
  info: { title: 'Shop API', version: '1.0.0' },
  paths: {
    '/register': {
      post: {
        summary: 'Register new user',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string' },
                  // 🔥 VULNERABILITY: Swagger leaks that role, credits, is_verified are valid fields
                  role: { type: 'string', description: 'Internal use only' },
                  credits: { type: 'integer', description: 'Internal use only' },
                  is_verified: { type: 'integer', description: 'Internal use only' }
                }
              }
            }
          }
        }
      }
    },
    '/profile': { put: { summary: 'Update user profile — no field filtering' } },
    '/products/{id}': { put: { summary: 'Update product — exposes discount_pct and internal_sku' } }
  }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

const fakeAuth = (req, res, next) => {
  req.userId = parseInt(req.headers['x-user-id'] || '2');
  next();
};

// 🔥 VULNERABILITY: Passes entire req.body directly to DB — mass assignment
app.post('/register', async (req, res) => {
  const { username, email, password, ...rest } = req.body;
  // rest might include: role='admin', credits=999999, is_verified=1
  // All fields from body are accepted without filtering
  const fields = { username, email, password, ...rest };
  const cols = Object.keys(fields).join(', ');
  const vals = Object.values(fields);
  const placeholders = vals.map(() => '?').join(', ');
  try {
    await db.query(`INSERT INTO users (${cols}) VALUES (${placeholders})`, vals);
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    res.json({ message: 'Registered', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 VULNERABILITY: Profile update — any field in the body updates in DB
app.put('/profile', fakeAuth, async (req, res) => {
  const updates = req.body; // No allowlist — attacker can set role='admin'
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const vals = [...Object.values(updates), req.userId];
  try {
    await db.query(`UPDATE users SET ${setClause} WHERE id = ?`, vals);
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    res.json({ message: 'Updated', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 VULNERABILITY: Product update also allows mass assignment
app.put('/products/:id', fakeAuth, async (req, res) => {
  const updates = req.body; // Attacker can set discount_pct=100 or modify internal_sku
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const vals = [...Object.values(updates), req.params.id];
  try {
    await db.query(`UPDATE products SET ${setClause} WHERE id = ?`, vals);
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Updated', product: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/products', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM products');
  res.json(rows);
});

app.get('/me', fakeAuth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
  res.json(rows[0] || { error: 'Not found' });
});

app.get('/', (req, res) => res.json({
  lab: '14 - Mass Assignment',
  swagger: 'http://localhost:8014/api-docs',
  hints: [
    'POST /register with {"username":"hacker","email":"h@h.com","password":"x","role":"admin","credits":999999,"is_verified":1}',
    'PUT /profile with {"role":"admin"} (X-User-Id: 2)',
    'PUT /products/1 with {"discount_pct":100}'
  ]
}));

app.listen(3000, () => console.log('Lab 14 running on :3000'));
