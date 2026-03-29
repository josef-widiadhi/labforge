# Lab 21 — Fully Hardened Reference Implementation ✅

**Port:** `8021`  
**Stack:** Node.js + PostgreSQL + Redis  
**Difficulty:** Reference / Study Material

> This lab demonstrates **what secure looks like**. Study this alongside the vulnerable labs to understand the defensive patterns that prevent each class of vulnerability.

---

## ✅ Security Hardening Applied — Complete Reference

### 1. 🔐 Authentication & Session Management

| Hardening | Implementation |
|-----------|---------------|
| **bcrypt password hashing** | `bcrypt.hash(password, 12)` — 12 rounds, never store plaintext |
| **Timing-safe comparison** | Always call `bcrypt.compare()` even when user not found (prevents timing attacks) |
| **Short-lived JWT tokens** | `expiresIn: '15m'` — limits blast radius of stolen tokens |
| **JWT algorithm whitelist** | `algorithms: ['HS256']` — never allows `none` algorithm |
| **Strong JWT secret** | 256-bit random from environment vault, never hardcoded |
| **JWT claims: no role in token** | Role always fetched from DB — token can't be forged for privilege escalation |
| **Unique `jti` per token** | Enables token revocation via Redis blacklist |
| **Token revocation on logout** | `revoked_token:{jti}` stored in Redis until expiry |
| **Account lockout** | 5 failed attempts → 15-minute lockout, tracked in DB |
| **Login audit trail** | Every success, failure, and blocked attempt logged |

### 2. 🛡️ Authorization (No IDOR)

| Hardening | Implementation |
|-----------|---------------|
| **Ownership enforced in DB query** | `WHERE id = $1 AND owner_id = $2` — can't access others' resources |
| **Role checked from DB** | `requireRole()` uses `req.user.role` from DB, not JWT |
| **403 not 404 on access denied** | Prevents confirming whether a resource exists |
| **UUID resource IDs** | No sequential integers — non-guessable IDs |
| **Row-level security** | `ENABLE ROW LEVEL SECURITY` on documents table |

### 3. 💉 Injection Prevention

| Hardening | Implementation |
|-----------|---------------|
| **Parameterized queries** | Every DB call uses `$1, $2` placeholders — never string concatenation |
| **Input validation** | `express-validator` validates and sanitizes all inputs |
| **Input length limits** | Max lengths on all fields prevent buffer overflow and DoS |
| **`express.json({ limit: '10kb' })`** | Prevents giant payload DoS |
| **No raw SQL execution** | No endpoint accepts raw SQL strings |

### 4. 🔒 Mass Assignment Prevention

| Hardening | Implementation |
|-----------|---------------|
| **Explicit field allowlists** | `const { title, content, is_confidential } = req.body` — only named fields accepted |
| **Never spread `req.body`** | Role, credits, isAdmin can never be set via API |
| **Sensitive fields hardcoded** | `owner_id = req.user.id` — never from user input |

### 5. 🌐 HTTP Security Headers (Helmet)

| Header | Value | Prevents |
|--------|-------|----------|
| `Content-Security-Policy` | Strict `'self'` directives | XSS, data injection |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Downgrade attacks |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing attacks |
| `X-XSS-Protection` | `1; mode=block` | Reflected XSS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Info leakage via Referer |
| `Permissions-Policy` | Restrictive | Feature abuse |
| `X-Powered-By` | Removed | Tech stack fingerprinting |

### 6. 🚦 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | 15 minutes per IP |
| All `/api/` routes | 100 requests | 1 minute per IP |

### 7. 🌍 CORS — Strict Origin Allowlist

```javascript
// ✅ SECURE: Explicit allowlist
const ALLOWED_ORIGINS = ['https://app.company.com', 'https://admin.company.com'];

// ✅ Never reflect arbitrary origins
// ✅ Never trust null origin
// ✅ Allowlist combined with credentials: true
```

### 8. 🐳 Docker / Container Hardening

| Hardening | Implementation |
|-----------|---------------|
| **Non-root user** | `USER 1001:1001` — container never runs as root |
| **Read-only filesystem** | `read_only: true` in compose — can't write to container |
| **`/tmp` noexec tmpfs** | Can't execute scripts written to /tmp |
| **All capabilities dropped** | `cap_drop: ALL` — no raw socket, chown, etc. |
| **`no-new-privileges`** | `security_opt: no-new-privileges:true` |
| **DB not port-exposed** | No `ports:` on DB service — only accessible via Docker network |
| **Internal network** | Backend network has `internal: true` — no external routing |
| **Separated networks** | API on both `frontend`+`backend`; DB only on `backend` |
| **Resource limits** | `cpus: 0.5`, `memory: 256M` — prevents DoS resource exhaustion |
| **Multi-stage Docker build** | Only production artifacts in final image — no dev tools |

### 9. 🗄️ Database Security

| Hardening | Implementation |
|-----------|---------------|
| **Passwords hashed with bcrypt** | `password_hash` column — never plaintext |
| **Least-privilege DB user** | App user has only SELECT/INSERT/UPDATE on its tables |
| **UUID primary keys** | `gen_random_uuid()` — non-sequential, non-guessable |
| **Row-level security** | PostgreSQL RLS enabled on `documents` table |
| **Audit log table** | All sensitive actions recorded in `audit_log` |
| **Indexed lookups** | Prevents timing attacks via slow queries |
| **SSL in production** | `ssl: { rejectUnauthorized: true }` |

### 10. 🔑 Redis Security

| Hardening | Implementation |
|-----------|---------------|
| **`requirepass` set** | Redis requires authentication |
| **Dangerous commands disabled** | `FLUSHALL`, `CONFIG`, `DEBUG`, `KEYS` renamed/disabled |
| **Not exposed to host** | No `ports:` mapping — Docker internal only |
| **Used for token blacklist** | Revoked JWTs stored with TTL matching token expiry |

### 11. 📊 Audit Logging

Every sensitive action is logged with:
- Timestamp
- User ID
- Action type
- Resource type & ID
- IP address
- User agent
- Status (success / failure / blocked)
- Additional context in JSONB

### 12. 🚫 Information Disclosure Prevention

| Hardening | Implementation |
|-----------|---------------|
| **Generic error messages** | `"Internal server error"` — no stack traces |
| **No SQL errors to client** | `console.error(err)` server-side only |
| **Same response for wrong user/pass** | Prevents username enumeration |
| **Health check minimal** | `{ status: 'ok' }` only — no versions, hostnames |
| **No Swagger in production** | Not mounted when `NODE_ENV === 'production'` |
| **Sensitive fields excluded from responses** | `password_hash` never returned |
| **`X-Powered-By` removed** | Prevents Express fingerprinting |

---

## 🧪 Testing the Hardening

Try all the attacks from the vulnerable labs — they should all fail:

```bash
docker compose up -d

# ❌ SQLi attempt — parameterized queries block it
curl "http://localhost:8021/api/documents?id=' OR 1=1--"

# ❌ JWT none algorithm — rejected
python3 -c "
import base64, json
h = base64.urlsafe_b64encode(b'{\"alg\":\"none\",\"typ\":\"JWT\"}').rstrip(b'=').decode()
p = base64.urlsafe_b64encode(b'{\"sub\":\"11111111-1111-1111-1111-111111111111\"}').rstrip(b'=').decode()
print(f'{h}.{p}.')
" | xargs -I{} curl http://localhost:8021/api/documents -H "Authorization: Bearer {}"
# Returns: {"error":"Authentication failed"}

# ❌ IDOR attempt — access Alice's document as Bob
# (First login as bob to get a real token, then try Alice's document UUID)
TOKEN=$(curl -s -X POST http://localhost:8021/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"TestPass!2024"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
curl http://localhost:8021/api/documents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa \
  -H "Authorization: Bearer $TOKEN"
# Returns: {"error":"Access denied"}

# ❌ Rate limit — brute force blocked after 5 attempts
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:8021/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrongpassword"}' | python3 -m json.tool
done
# 6th+ attempt returns: {"error":"Too many login attempts..."}

# ❌ Mass assignment — role field ignored
curl -X POST http://localhost:8021/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"test","content":"test","is_confidential":false,"owner_id":"11111111-1111-1111-1111-111111111111","role":"admin"}'
# Returns: document owned by the authenticated user, role/owner_id ignored

# ✅ Check security headers
curl -I http://localhost:8021/health
# Shows: X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.
```

---

## 📚 Further Reading

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
