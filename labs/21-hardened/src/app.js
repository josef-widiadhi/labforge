'use strict';
const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');

const app = express();

// ============================================================
// 🔒 SECURITY HARDENING: HTTP Headers via Helmet
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,  // Remove X-Powered-By: Express
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// 🔒 HARDENING: Only accept JSON — no content-type sniffing
app.use(express.json({ limit: '10kb' }));  // Limit body size to prevent DoS

// ============================================================
// 🔒 SECURITY HARDENING: CORS — explicit allowlist only
// ============================================================
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(',');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// 🔒 SECURITY HARDENING: Rate Limiting
// ============================================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  // 🔒 Consistent response to prevent timing-based enumeration
  skipSuccessfulRequests: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Rate limit exceeded.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// Database & Redis Connections
// ============================================================
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432,
  // 🔒 HARDENING: Connection limits
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // 🔒 HARDENING: SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});

let redis;
(async () => {
  redis = createClient({
    socket: { host: process.env.REDIS_HOST, port: 6379 },
    password: process.env.REDIS_PASS,
  });
  redis.on('error', (err) => console.error('Redis error:', err.message));
  await redis.connect();
  console.log('Redis connected (authenticated)');
})();

// ============================================================
// 🔒 SECURITY HARDENING: Audit Logging
// ============================================================
const auditLog = async (userId, action, resourceType, resourceId, status, req, details = {}) => {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, action, resourceType, resourceId,
       req.ip, req.headers['user-agent']?.substring(0, 200), status, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
};

// ============================================================
// 🔒 SECURITY HARDENING: Input Validation Helper
// ============================================================
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

// ============================================================
// 🔒 SECURITY HARDENING: JWT Authentication Middleware
// ============================================================
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);

    // 🔒 HARDENING: Strict algorithm whitelist — no 'none' allowed
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'secure-lab',
      audience: 'secure-lab-api',
    });

    // 🔒 HARDENING: Always verify user still exists and is active in DB
    // Never trust role from JWT — always fetch from DB
    const result = await pool.query(
      'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
      [decoded.sub]
    );
    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }

    // 🔒 HARDENING: Check if token is in revocation list (Redis blacklist)
    const revoked = await redis.get(`revoked_token:${decoded.jti}`);
    if (revoked) return res.status(401).json({ error: 'Token has been revoked' });

    req.user = result.rows[0];
    req.tokenJti = decoded.jti;
    next();
  } catch (err) {
    // 🔒 HARDENING: Generic error — no detail about WHY verification failed
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// 🔒 HARDENING: Role-based access control middleware
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    auditLog(req.user.id, 'UNAUTHORIZED_ACCESS', null, null, 'blocked', req);
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// ============================================================
// AUTH ENDPOINTS
// ============================================================

// 🔒 SECURE Login
app.post('/api/auth/login',
  loginLimiter,
  body('username').isString().isLength({ min: 1, max: 50 }).trim().escape(),
  body('password').isString().isLength({ min: 1, max: 128 }),
  validate,
  async (req, res) => {
    const { username, password } = req.body;
    try {
      // 🔒 HARDENING: Parameterized query
      const result = await pool.query(
        'SELECT id, username, email, role, password_hash, failed_login_attempts, locked_until, is_active FROM users WHERE username = $1',
        [username]
      );

      // 🔒 HARDENING: Always run bcrypt.compare even if user not found (prevents timing attack)
      const user = result.rows[0];
      const dummyHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBqQqnqOr9qVVi';
      const passwordMatch = await bcrypt.compare(password, user?.password_hash || dummyHash);

      if (!user || !passwordMatch || !user.is_active) {
        // 🔒 HARDENING: Increment failed attempts if user exists
        if (user) {
          const attempts = user.failed_login_attempts + 1;
          const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await pool.query(
            'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
            [attempts, lockUntil, user.id]
          );
        }
        await auditLog(user?.id, 'LOGIN_FAILURE', 'user', user?.id, 'failure', req, { username });
        // 🔒 HARDENING: Same response for wrong user AND wrong password (no enumeration)
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // 🔒 Check account lockout
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await auditLog(user.id, 'LOGIN_BLOCKED', 'user', user.id, 'blocked', req);
        return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
      }

      // 🔒 Reset failed attempts on success
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2',
        [req.ip, user.id]
      );

      // 🔒 HARDENING: JWT with short expiry, unique jti, strict claims
      const jti = crypto.randomBytes(16).toString('hex');
      const token = jwt.sign(
        { sub: user.id, jti },
        process.env.JWT_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '15m',        // Short-lived
          issuer: 'secure-lab',
          audience: 'secure-lab-api',
          // 🔒 Role is NOT in the token — always fetched from DB
        }
      );

      await auditLog(user.id, 'LOGIN_SUCCESS', 'user', user.id, 'success', req);
      res.json({ token, expires_in: 900 });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Logout — revoke token
app.post('/api/auth/logout', authenticate, async (req, res) => {
  // 🔒 HARDENING: Add token JTI to Redis blacklist until expiry
  await redis.set(`revoked_token:${req.tokenJti}`, '1', { EX: 900 });
  await auditLog(req.user.id, 'LOGOUT', 'user', req.user.id, 'success', req);
  res.json({ message: 'Logged out successfully' });
});

// ============================================================
// DOCUMENT ENDPOINTS — with ownership checks
// ============================================================

// 🔒 SECURE: List only the authenticated user's own documents
app.get('/api/documents', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      // 🔒 HARDENING: Filter by owner_id — no IDOR possible
      // 🔒 Only return non-sensitive fields in list view
      'SELECT id, title, is_confidential, created_at FROM documents WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ documents: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🔒 SECURE: Get single document with ownership check
app.get('/api/documents/:id',
  authenticate,
  param('id').isUUID().withMessage('Invalid document ID'),
  validate,
  async (req, res) => {
    try {
      const result = await pool.query(
        // 🔒 HARDENING: WHERE clause requires BOTH id AND owner_id to match
        'SELECT * FROM documents WHERE id = $1 AND owner_id = $2',
        [req.params.id, req.user.id]
      );
      if (!result.rows.length) {
        // 🔒 HARDENING: Return 403 (not 404) — don't reveal whether resource exists
        await auditLog(req.user.id, 'DOCUMENT_ACCESS_DENIED', 'document', req.params.id, 'blocked', req);
        return res.status(403).json({ error: 'Access denied' });
      }
      await auditLog(req.user.id, 'DOCUMENT_READ', 'document', req.params.id, 'success', req);
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// 🔒 SECURE: Create document — only allowed fields accepted (no mass assignment)
app.post('/api/documents',
  authenticate,
  body('title').isString().isLength({ min: 1, max: 300 }).trim().escape(),
  body('content').isString().isLength({ min: 1, max: 50000 }),
  body('is_confidential').optional().isBoolean(),
  validate,
  async (req, res) => {
    try {
      // 🔒 HARDENING: Explicit allowlist — never spread req.body
      const { title, content, is_confidential = false } = req.body;
      const result = await pool.query(
        'INSERT INTO documents (owner_id, title, content, is_confidential) VALUES ($1, $2, $3, $4) RETURNING id, title, created_at',
        [req.user.id, title, content, is_confidential]
      );
      await auditLog(req.user.id, 'DOCUMENT_CREATED', 'document', result.rows[0].id, 'success', req);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================
// ADMIN ENDPOINTS — role-checked
// ============================================================
app.get('/api/admin/users',
  authenticate,
  requireRole('admin'),
  async (req, res) => {
    const result = await pool.query(
      // 🔒 HARDENING: Never return password_hash in response
      'SELECT id, username, email, role, is_verified, is_active, created_at, last_login_at FROM users ORDER BY created_at'
    );
    await auditLog(req.user.id, 'ADMIN_USER_LIST', 'users', null, 'success', req);
    res.json({ users: result.rows });
  }
);

app.get('/api/admin/audit-log',
  authenticate,
  requireRole('admin'),
  async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM audit_log ORDER BY event_time DESC LIMIT 200'
    );
    res.json({ logs: result.rows });
  }
);

// ============================================================
// 🔒 HARDENING: Health check — minimal info exposure
// ============================================================
app.get('/health', (req, res) => {
  // 🔒 Never expose version, DB host, env vars, etc.
  res.json({ status: 'ok' });
});

// ============================================================
// 🔒 HARDENING: Catch-all — no stack traces to clients
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  // 🔒 HARDENING: Log internally, never expose stack traces
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 🔒 HARDENING: Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

app.listen(3000, () => console.log('Lab 21 — HARDENED API running on :3000'));
