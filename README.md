# ⚡ LabForge — Pentest Teaching Platform

> **⚠️ FOR EDUCATIONAL USE ONLY.** All lab containers are intentionally vulnerable. Run in isolated local environments only. Never expose to public networks.

---

## What Is LabForge?

LabForge is a Docker-based pentest teaching platform for **teachers and students**.

| Role | What They Do |
|------|-------------|
| **Teacher / Admin** | Deploys labs, builds new scenarios, watches students attack live, replays sessions for discussion |
| **Pentester Student** | Connects to the running Docker container port and attacks it |

The teacher opens `http://localhost:3000` — the LabForge UI. Students connect to lab ports (`:8001`, `:8015`, `:9001`, etc.).

---

## Lab Catalog

### Beginner Labs (01–20) — Port :8001–8020
Your original 20 vulnerable Docker containers, unchanged:

| ID | Lab | Vulnerability |
|----|-----|--------------|
| 01 | SQLi Basic | Error-based SQL injection |
| 02 | SQLi Blind | Boolean + time-based blind SQLi |
| 03 | IDOR Basic | Integer ID object reference |
| 04 | IDOR + Swagger | IDOR with API docs exposure |
| 05 | Stored XSS | Unsanitised stored content |
| 06 | Broken Auth JWT | JWT None algorithm + weak secret |
| 07 | Broken Auth Session | Predictable sequential session IDs |
| 08 | SSRF | Webhook fetches internal URLs |
| 09 | RCE via Upload | No file type validation |
| 10 | Path Traversal | Unsanitised file path parameter |
| 11 | XXE Injection | External entity processing enabled |
| 12 | NoSQL Injection | Redis command injection |
| 13 | IDOR UUID Bypass | UUID with no ownership check |
| 14 | Mass Assignment | ORM receives unfiltered body |
| 15 | Bruteforce | No rate limiting on login + OTP |
| 16 | API Swagger Disclosure | Swagger left on in production |
| 17 | GraphQL Introspection | Schema exposed + field injection |
| 18 | CORS Misconfiguration | Reflected origin + credentials |
| 19 | Redis Unauthenticated | Redis exposed with no auth |
| 20 | MySQL Weak Credentials | admin:admin, root:root exposed |

### Hardened Reference Lab (21) — Port :8021
The same app with every vulnerability patched. Teachers use this to show students what secure code looks like.

### Chain / Combo Labs (C01–C06) — Port :9001–9006

| ID | Lab | Chain |
|----|-----|-------|
| C01 | Recon → SQLi → JWT | Swagger recon → SQLi dump → JWT forge |
| C02 | SSRF → Internal API → RCE | SSRF into internal service → cmd injection |
| C03 | Upload + LFI | File upload RCE + path traversal combo |
| C04 | XSS → CSRF → Account Takeover | Stored XSS delivers CSRF → admin takeover |
| C05 | Mass Assignment + IDOR + Exfil | Priv-esc → enumerate users → dump orders |
| C06 | Full Corporate Pentest | Open-ended: find all 7 vulnerabilities |

---

## Quick Start

```bash
# 1. Start the platform
./labforge.sh start

# Open in browser
open http://localhost:3000

# 2. Deploy a lab for students (they connect to the port)
./labforge.sh start lab01          # Lab 01 on :8001
./labforge.sh start beginner       # All 20 beginner labs
./labforge.sh start c01            # Chain lab C01 on :9001

# 3. Monitor students attacking in real time
./labforge.sh monitor lab01        # CLI stream with attack detection
# Or use the Attack Monitor in the UI → http://localhost:3000

# 4. Stop when done
./labforge.sh stop all
```

---

## Platform Features

### Lab Manager
Browse all 27 labs. View scenario, vulnerability description, allowed tools, and attack stages. One-click deploy.

### Deploy
Start/stop individual labs or groups. Share the lab port with students. See all running labs at a glance.

### Lab Builder (Teacher Tool)
Create new lab scenarios:
1. **Configure** — name, vulnerability type, difficulty, stack, database, port
2. **Select Tools** — limit which pentest tools students may use (forces focused scenarios)
3. **Generate README** — auto-generated markdown documentation
4. **Generate docker-compose.yml** — ready to deploy
5. **Generate Cheatsheet** — student reference with attack stages, tool commands, target result

### Attack Monitor (Live)
Real-time Docker log streaming via Server-Sent Events. Logs stream as they arrive — no polling. 12 attack pattern detectors flag:
- SQL Injection (error-based, UNION, blind)
- XSS payloads
- Path Traversal
- SSRF (including cloud metadata probes)
- JWT manipulation
- XXE injection
- NoSQL operators
- GraphQL introspection
- Mass Assignment patterns
- Redis attack commands
- Credential attempts

### Session Replay (Teacher Tool)
Save any monitoring session. Replay with full timeline control — step forward/backward, set speed, add annotations. Use for post-attack discussion with students.

### AI Advisor
Ollama integration for teachers:
- **Lab Creator** — design new vulnerable scenarios
- **Attack Simulation** — understand what the student should do
- **Cheatsheet Generator** — auto-generate student materials
- **Attacker Advisor** — explain TTPs from attacker's view
- **Defender Advisor** — explain fixes and detection methods

---

## Architecture

```
Teacher browser → http://localhost:3000
                         │
                   LabForge UI (SPA)
                         │
                   backend :4000
                   ├── /api/labs/status     ← Docker socket reads container state
                   ├── /api/labs/:id/start  ← docker compose up -d
                   ├── /api/labs/:id/stop   ← docker compose down
                   ├── /api/labs/:id/stream ← docker logs -f piped as SSE
                   └── /api/ollama/*        ← proxies to host Ollama

Student browser → http://HOST_IP:8001   (Lab 01)
                → http://HOST_IP:8015   (Lab 15)
                → http://HOST_IP:9001   (Chain C01)
```

---

## CLI Reference

```bash
./labforge.sh start              # Start UI only
./labforge.sh start lab01        # Deploy Lab 01
./labforge.sh start beginner     # Deploy Labs 01–20
./labforge.sh start chain        # Deploy Chain Labs C01–C06
./labforge.sh start all          # Deploy everything (~8GB RAM)
./labforge.sh stop all           # Stop everything
./labforge.sh status             # All lab states
./labforge.sh monitor lab01      # Live attack stream (terminal)
./labforge.sh logs lab15         # Last 80 log lines
./labforge.sh chat "question"    # AI Advisor from terminal
./labforge.sh build              # Pre-build all images (offline prep)
./labforge.sh clean              # Full teardown
./labforge.sh open               # Open browser
```

---

## AI Setup (Ollama)

```bash
# Run on your host machine
ollama serve

# Pull recommended models
ollama pull qwen2.5:7b-instruct    # Best for instructions
ollama pull qwen2.5-coder:7b       # Best for code generation
ollama pull llama3.1:8b            # General purpose
```

The backend proxies all Ollama calls via `host.docker.internal:11434` — no CORS issues.

---

## Ethics

- Run **only** on `localhost` or isolated local networks
- Never expose lab containers to the internet
- Use only against systems you own or have written permission to test
- These labs exist for education — understanding attacks builds better defenders
