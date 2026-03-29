const express = require('express');
const { Pool } = require('pg');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432,
});

// 🔥 VULNERABILITY: Swagger exposed in production — reveals all internal endpoints,
// parameter names, data models, and internal field names to attackers
const swaggerDoc = {
  openapi: '3.0.0',
  info: {
    title: 'HR Internal API',
    version: '1.0.0',
    description: 'Internal HR system — CONFIDENTIAL',
    // 🔥 Even leaks internal contacts and environment info
    contact: { name: 'HR Team', email: 'internal-dev@company.com' },
    'x-internal-notes': 'DB: hrdb@postgres:5432, Backup: s3://company-hr-backups'
  },
  servers: [{ url: 'http://localhost:8004', description: 'Production' }],
  paths: {
    '/employees/{id}': {
      get: {
        summary: 'Get employee by ID',
        description: 'Returns full employee record including SSN and salary',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Employee object with PII' } }
      }
    },
    '/employees/{id}/payslips': {
      get: {
        summary: 'Get payslips for employee',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'List of payslips' } }
      }
    },
    '/employees/{id}/reviews': {
      get: {
        summary: 'Get performance reviews',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Performance review notes' } }
      }
    },
    '/admin/employees': {
      get: {
        summary: 'List ALL employees (admin only)',
        description: '🔥 No auth enforcement — admin label is just cosmetic',
        responses: { 200: { description: 'All employees' } }
      }
    }
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
// 🔥 Also expose raw JSON spec — used by automated scanners
app.get('/api-docs.json', (req, res) => res.json(swaggerDoc));

const fakeAuth = (req, res, next) => {
  if (!req.headers['x-user-id']) return res.status(401).json({ error: 'Auth required' });
  req.userId = parseInt(req.headers['x-user-id']);
  next();
};

// 🔥 IDOR: No ownership check — any employee can read any employee's SSN/salary
app.get('/employees/:id', fakeAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
  res.json(result.rows[0] || { error: 'Not found' });
});

// 🔥 IDOR: Any employee can read any payslip
app.get('/employees/:id/payslips', fakeAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM payslips WHERE employee_id = $1',
    [req.params.id]
  );
  res.json(result.rows);
});

// 🔥 IDOR: Confidential performance review notes
app.get('/employees/:id/reviews', fakeAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM performance_reviews WHERE employee_id = $1',
    [req.params.id]
  );
  res.json(result.rows);
});

// 🔥 "Admin" endpoint with no actual admin check
app.get('/admin/employees', fakeAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM employees ORDER BY id');
  res.json(result.rows);
});

app.get('/', (req, res) => {
  res.json({
    lab: '04 - IDOR + Swagger Exposure',
    swagger_ui: 'http://localhost:8004/api-docs',
    swagger_json: 'http://localhost:8004/api-docs.json',
    hint: 'Check the Swagger docs first — they reveal everything!'
  });
});

app.listen(3000, () => console.log('Lab 04 running on :3000'));
