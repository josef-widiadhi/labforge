# LabForge Control Tower Blueprint

## Product Spine
LabForge should be a **self-hosted mini lab forge for pentesters**.

Core flow:
1. browse template
2. deploy isolated target
3. attack it
4. reveal hints / cheatsheet / README
5. stop, reset, destroy, summarize

Teaching features remain optional plugins:
- classroom monitoring
- replay
- grading
- exam mode

## Core Concepts
### 1. Template
Static blueprint of a lab:
- metadata
- docker spec
- hints
- cheatcode
- walkthrough
- optional scoring rules

### 2. Instance
A live spawned copy of a template for one learner/session:
- instance_id
- template_id
- owner_id
- compose project name
- allocated ports
- network name
- status
- created_at / expires_at / destroyed_at

## Recommended Menus
### Default menus
- Catalog
- My Instances
- Builder
- Hints
- Sessions
- AI Forge
- Settings

### Optional menus
- Classroom
- Monitor
- Replay
- Exam
- Grading

## Service Layout
### Core
- template registry
- instance controller
- session recorder
- hint engine
- AI Forge

### Optional
- classroom service
- replay service
- grading service
- exam shell capture

## API Sketch
### Templates
- `GET /api/templates`
- `GET /api/templates/:id`
- `POST /api/templates`
- `PUT /api/templates/:id`

### Instances
- `POST /api/templates/:id/instances`
- `GET /api/instances`
- `GET /api/instances/:id`
- `POST /api/instances/:id/reset`
- `POST /api/instances/:id/stop`
- `DELETE /api/instances/:id`

### Sessions
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/events`
- `POST /api/sessions/:id/summary`
- `POST /api/sessions/:id/grade`

### README / learner assets
- `GET /api/labs/:id/readme`
- `GET /api/labs/:id/cheatsheet`
- `GET /api/labs/:id/hints`

## Cleanup Strategy
The current pain point is Docker debris from partial stop paths.

### Near-term fix
- run one compose command path only
- use `down -v --remove-orphans`
- remove lingering containers explicitly if compose leaves them behind
- add focused cleanup endpoint per lab

### Long-term fix
- one project name per instance
- one destroy path per instance
- janitor worker that reconciles DB state with Docker state
- delete orphan networks/volumes with LabForge prefix

## Student View
The learner cockpit should present:
- target page / iframe / launch URL
- side panel README
- cheatsheet button
- hints ladder
- session notes

This keeps the learner in one tab instead of juggling:
- target browser tab
- README tab
- cheatsheet tab
- deploy console tab

## AI Forge Goals
AI should move from decorative helper to production workflow:
- generate labs
- select pentest tools
- write README
- write cheatsheet
- summarize attack path
- grade attempt
- explain remediation
