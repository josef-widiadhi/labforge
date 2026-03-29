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

// 🔥 VULNERABILITY: Swagger exposes hidden/internal endpoints, test credentials,
// environment details, and internal infrastructure info
const swaggerDoc = {
  openapi: '3.0.0',
  info: {
    title: 'Company Internal API',
    version: '2.3.1',
    description: `
## ⚠️ Internal Use Only

**Production Server:** api.company.internal:8080
**Staging Server:** api-staging.company.internal:8081
**DB:** mysql-prod.company.internal:3306 (user: admin / pass: admin)

### Test Credentials (DO NOT COMMIT)
- Admin: admin@company.com / Admin@2024!
- Test user: test@company.com / test123

### Changelog
- v2.3.1: Fixed the SQL injection in /admin/search
- v2.3.0: Added /internal/debug endpoint (disabled in prod... maybe)
    `,
    contact: { name: 'DevOps Team', email: 'devops@company.internal' }
  },
  servers: [
    { url: 'http://localhost:8016', description: 'Development' },
    { url: 'http://api.company.internal:8080', description: 'Production' },
    { url: 'http://api-staging.company.internal:8081', description: 'Staging' }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          password_hash: { type: 'string', description: 'bcrypt hash — exposed in schema definition' },
          ssn: { type: 'string' },
          internal_notes: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/admin/api-keys': {
      get: { summary: 'List all API keys with secrets', tags: ['Admin'], security: [{ ApiKeyAuth: [] }] }
    },
    '/admin/config': {
      get: { summary: 'View internal configuration', tags: ['Admin'] }
    },
    '/internal/debug': {
      get: { summary: 'Debug endpoint — returns env vars', tags: ['Internal'], description: 'Should be disabled in prod but is it?' }
    },
    '/internal/sql': {
      post: { summary: 'Raw SQL execution (dev only!)', tags: ['Internal'] }
    },
    '/health': {
      get: { summary: 'Health check — leaks versions', tags: ['Public'] }
    }
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
app.get('/swagger.json', (req, res) => res.json(swaggerDoc));
// 🔥 Also exposed at common alternative paths
app.get('/openapi.json', (req, res) => res.json(swaggerDoc));
app.get('/v2/api-docs', (req, res) => res.json(swaggerDoc));

// 🔥 "Admin" endpoints with no real auth
app.get('/admin/api-keys', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM api_keys');
  res.json(rows); // Returns actual API key secrets
});

app.get('/admin/config', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM internal_config');
  res.json(rows);
});

// 🔥 Debug endpoint left on
app.get('/internal/debug', (req, res) => {
  res.json({ env: process.env, cwd: process.cwd(), memory: process.memoryUsage() });
});

// 🔥 Raw SQL execution endpoint
app.post('/internal/sql', async (req, res) => {
  const { query } = req.body;
  try {
    const [rows] = await db.query(query);
    res.json({ result: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.3.1',
    node_version: process.version,
    db_host: process.env.DB_HOST,
    db_user: process.env.DB_USER,
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => res.json({
  lab: '16 - API Swagger/OpenAPI Excessive Exposure',
  swagger_ui: 'http://localhost:8016/api-docs',
  also_try: ['/swagger.json', '/openapi.json', '/v2/api-docs', '/health', '/internal/debug']
}));

app.listen(3000, () => console.log('Lab 16 running on :3000'));
