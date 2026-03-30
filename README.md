
> Phase 3.1 adds a **Teaching Mode toggle** in the UI and an **Ollama diagnostics modal** so you can flip classroom menus on/off and inspect why the LLM bridge is unavailable.

> Default in this patch: `LABFORGE_CLASSROOM=true` so the teaching menus stay visible while evaluating the build.

### Phase 3 Control Tower
LabForge now supports **true per-run lab instances**. Deploying a lab spawns a dedicated Docker Compose project with a generated project name and an allocated host port, instead of assuming one shared lab container per template.

# ⚡ LabForge

> **Educational use only.** Lab containers are intentionally vulnerable. Run them only on isolated local environments you control.

LabForge is a **self-hosted mini lab forge** for pentesters.

Its core job is simple:
- browse challenge templates
- deploy vulnerable Docker targets
- attack them safely on your own machine or lab network
- read the lab README / hints / cheatsheet
- stop, reset, and clean them up

Because you are also an educator, teaching features still exist, but they should live as **optional inside menus**, not as the whole soul of the product.

---

## Product Shape

### Core LabForge
For any pentester learner:
- **Lab Manager** to browse labs
- **Deploy** to start and stop targets
- **Student View** to open the target beside a README side panel
- **Lab Builder** to create new labs
- **Cheatsheets** for hints / solve guidance / intended path
- **AI Advisor** and **LLM Manager** for content generation and assistance

### Optional Teaching Layer
For instructor workflows:
- Attack Monitor
- Session Replay
- later: grading, classroom, exam shell capture

---

## What Changed In This Pack

### 1. Student View workbench
A new **Student View** page was added to the web UI.

It gives the learner a split-screen cockpit:
- left: the running target
- right: the lab `README.md`

This keeps the learner from bouncing between too many tabs.

### 2. README API
The backend now exposes:
- `GET /api/labs/:id/readme`

So the SPA can load each lab README directly from the lab folder.

### 3. Stronger stop cleanup
The stop path was tightened to reduce Docker debris:
- compose execution normalized through one helper
- stop now uses `down -v --remove-orphans`
- lingering containers are force-removed if compose leaves stragglers behind
- added `POST /api/labs/:id/cleanup`

This is a **near-term cleanup fix**, not yet the full control tower redesign.

---

## Current Lab Catalog

### Beginner Labs 01–20
- SQLi
- Blind SQLi
- IDOR
- Swagger exposure
- Stored XSS
- Broken JWT auth
- Broken session auth
- SSRF
- RCE upload
- Path traversal / LFI
- XXE
- NoSQL injection
- UUID IDOR
- Mass assignment
- Bruteforce / no rate limiting
- API disclosure
- GraphQL introspection
- CORS misconfiguration
- Redis unauth
- MySQL weak creds

### Lab 21
- Hardened reference app

### Chain Labs C01–C06
- multi-stage attack paths like recon -> SQLi -> auth bypass
- SSRF -> internal API -> RCE
- XSS -> CSRF -> takeover
- mass assignment -> IDOR -> exfiltration

---

## Quick Start

```bash
# start the platform UI/API
./labforge.sh start

# open the UI
http://localhost:3000

# deploy one lab
./labforge.sh start lab01

# stop one lab
./labforge.sh stop lab01

# stop everything
./labforge.sh stop all
```

In the UI:
1. open **Lab Manager** or **Deploy**
2. deploy a lab
3. open **Student View**
4. attack the target while reading the README side panel

---

## Architecture Today

```text
Browser -> LabForge UI
           -> Node/Express API
              -> docker compose per lab
              -> Ollama proxy
              -> lab README loader
```

Important note:
- current architecture still thinks mostly in **template start/stop**
- future architecture should move to **template -> instance** lifecycle

That is the real control tower direction.

---

## Control Tower Direction

The long-term redesign should introduce:
- true instance controller
- dynamic project names
- dynamic host ports
- per-user isolated runs
- TTL cleanup / janitor
- AI summarizer and grader
- optional classroom plugin

See:
- `CONTROL_TOWER_BLUEPRINT.md`
- `ideas.md`
- `changelog.md`

---

## AI Direction

Today AI is present, but still underused.

Target direction:
- generate new lab templates
- generate README
- generate cheatsheet
- suggest pentest tools
- summarize attack attempts
- grade sessions
- explain remediation

---

## Notes

This package includes **incremental improvements**, not a full control tower rewrite.

What is already improved:
- learner-side README viewing
- easier student workbench flow
- stronger stop cleanup
- clearer product framing

What still needs a bigger refactor:
- instance lifecycle manager
- AI grading/summarization workflow
- full janitor reconciliation
- feature-flagged classroom mode


## Phase 2 notes

- Default UI is now **solo pentester first**: Catalog, My Instances, Builder, Workbench, AI Forge.
- Teaching tools are hidden unless `LABFORGE_CLASSROOM=true`.
- Ollama detection now probes multiple candidate URLs before declaring offline.
- Use the **Janitor** button or `POST /api/system/janitor` to clean dead lab debris.

## Phase 4: Classroom Sessions

When `LABFORGE_CLASSROOM=true`, LabForge exposes a **Classroom** page where an instructor can create a student-bound session link. Each session opens a dedicated workbench page with:

- target app iframe / launch link
- README side panel
- controlled web CLI sandbox
- score/event feed for debriefing

Student links are available at `/classroom/session/<token>`. The current CLI is intentionally controlled rather than a full unrestricted shell.
