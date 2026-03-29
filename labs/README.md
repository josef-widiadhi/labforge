# 🔐 Pentest Lab — 20 Vulnerable + 1 Hardened Docker Environments

> **⚠️ LEGAL DISCLAIMER:** This lab is for **educational purposes only**. All environments are intentionally vulnerable and must only be run in isolated, local environments. Never deploy these to public networks. Use only against systems you own or have explicit written permission to test.

---

## 📦 Lab Index

| # | Name | Vulnerability | Databases | Swagger |
|---|------|--------------|-----------|---------|
| 01 | [sqli-basic](./01-sqli-basic/) | SQL Injection (Error-based) | PostgreSQL | ❌ |
| 02 | [sqli-blind](./02-sqli-blind/) | Blind SQL Injection | MySQL | ❌ |
| 03 | [idor-basic](./03-idor-basic/) | IDOR (Integer ID) | PostgreSQL | ❌ |
| 04 | [idor-api-swagger](./04-idor-api-swagger/) | IDOR + API Swagger Exposure | PostgreSQL | ✅ |
| 05 | [xss-stored](./05-xss-stored/) | Stored XSS | MySQL | ❌ |
| 06 | [broken-auth-jwt](./06-broken-auth-jwt/) | Broken Auth (JWT None Algorithm) | PostgreSQL | ✅ |
| 07 | [broken-auth-session](./07-broken-auth-session/) | Broken Auth (Predictable Sessions) | Redis | ❌ |
| 08 | [ssrf-basic](./08-ssrf-basic/) | SSRF | PostgreSQL | ❌ |
| 09 | [rce-via-upload](./09-rce-via-upload/) | RCE via File Upload | MySQL | ❌ |
| 10 | [path-traversal](./10-path-traversal/) | Path Traversal / LFI | ❌ | ❌ |
| 11 | [xxe-injection](./11-xxe-injection/) | XXE Injection | PostgreSQL | ✅ |
| 12 | [nosql-injection-redis](./12-nosql-injection-redis/) | NoSQL Injection | Redis | ❌ |
| 13 | [idor-uuid-bypass](./13-idor-uuid-bypass/) | IDOR UUID Bypass | PostgreSQL | ✅ |
| 14 | [mass-assignment](./14-mass-assignment/) | Mass Assignment | MySQL | ✅ |
| 15 | [rate-limit-bruteforce](./15-rate-limit-bruteforce/) | No Rate Limiting / Brute Force | Redis + PostgreSQL | ❌ |
| 16 | [api-swagger-exposure](./16-api-swagger-exposure/) | Swagger/OpenAPI Info Disclosure | MySQL | ✅ |
| 17 | [graphql-introspection](./17-graphql-introspection/) | GraphQL Introspection + Injection | PostgreSQL | ❌ |
| 18 | [cors-misconfigured](./18-cors-misconfigured/) | CORS Misconfiguration | PostgreSQL | ✅ |
| 19 | [redis-unauth](./19-redis-unauth/) | Unauthenticated Redis Exposure | Redis | ❌ |
| 20 | [mysql-weak-creds](./20-mysql-weak-creds/) | Weak DB Credentials + Exposure | MySQL | ❌ |
| 21 | [hardened](./21-hardened/) | ✅ FULLY HARDENED REFERENCE | PostgreSQL + Redis | ✅ |

---

## 🛠️ Tools You'll Need

### Pentest Tools Used Across Labs
| Tool | Purpose | Install |
|------|---------|---------|
| `sqlmap` | Automated SQL injection | `pip install sqlmap` |
| `burp suite` | Proxy / request manipulation | [portswigger.net](https://portswigger.net) |
| `ffuf` | Fuzzing / directory brute force | `go install github.com/ffuf/ffuf/v2@latest` |
| `hydra` | Credential brute force | `apt install hydra` |
| `nuclei` | Vulnerability scanner templates | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` |
| `jwt_tool` | JWT attacks | `pip install jwt_tool` |
| `curl` / `httpie` | Manual HTTP testing | built-in / `pip install httpie` |
| `nmap` | Port scanning | `apt install nmap` |
| `redis-cli` | Redis direct access | `apt install redis-tools` |
| `mysql` client | MySQL direct access | `apt install mysql-client` |
| `postman` | API testing GUI | [postman.com](https://postman.com) |
| `dalfox` | XSS scanner | `go install github.com/hahwul/dalfox/v2@latest` |
| `ysoserial` | Java deserialization | [github](https://github.com/frohoff/ysoserial) |
| `ghauri` | Blind SQLi | `pip install ghauri` |

---

## 🚀 Quick Start

```bash
# Clone / enter the lab
cd pentest-lab

# Start any individual lab
cd 01-sqli-basic
docker compose up -d

# Stop and clean up
docker compose down -v
```

Each lab runs on a **unique port** so you can run multiple simultaneously.

---

## 🧠 Learning Path (Recommended Order)

1. **Beginner:** Labs 01, 03, 05, 10, 15, 19, 20
2. **Intermediate:** Labs 02, 04, 06, 07, 08, 09, 12, 13, 14
3. **Advanced:** Labs 11, 16, 17, 18
4. **Defense:** Lab 21 (Hardened — study what good looks like)

---

## ⚖️ Ethics

- Run only on `localhost` / isolated Docker networks
- Do not use techniques learned here on systems without authorization
- These labs simulate real-world CVEs and OWASP Top 10 vulnerabilities for **defensive awareness**
