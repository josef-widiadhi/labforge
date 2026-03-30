## 2026-03-30 - Phase 4 Classroom Session Workbench
- Added classroom session launcher with per-student workbench URLs.
- Added student session page with target iframe, README side panel, and controlled web CLI.
- Added lightweight classroom session storage and CLI scoring/event feed.
- Teaching mode now includes a Classroom page for creating and copying learner links.


## 2026-03-30 — Phase 3.1: Teaching Toggle + Ollama Diagnostics
- Added a visible Teaching Mode toggle in the top bar and sidebar footer so classroom menus can be shown or hidden without rebuilding.
- Added an Ollama diagnostics modal that shows probe URLs tried, the resolved endpoint, model list, and error hints.
- Improved `/api/config` payload with environment-level Ollama context for easier troubleshooting.

## 2026-03-30 — Phase 3: True Instance Controller
- Added a real per-run instance controller using generated Docker Compose project names and dynamic host port overrides.
- Added `/api/instances` plus create, destroy, reset, stream, and logs endpoints for instance-aware lifecycle control.
- Updated the Workbench and My Instances views to point at spawned instance ports instead of fixed template ports.
- Enabled classroom mode by default with `LABFORGE_CLASSROOM=true`.
- Updated monitor flow to target live instances, not ambiguous shared template containers.

# Changelog

## 2026-03-30
- Added a **Student View** workbench to the LabForge SPA with split layout: target surface on the left and a live lab `README.md` side panel on the right.
- Added backend endpoint `GET /api/labs/:id/readme` so LabForge can load per-lab README content directly from each lab folder.
- Added quick **Student View** launch buttons from lab cards, deploy lists, and the lab detail modal.
- Hardened stop behavior in `labforge-app/server.js`:
  - normalized compose execution through one helper,
  - switched stop to `down -v --remove-orphans`,
  - added force-removal pass for lingering compose containers.
- Added `POST /api/labs/:id/cleanup` as a focused cleanup endpoint for a specific lab.
- Added implementation blueprint documentation for the Control Tower direction and cleanup strategy.
- Reframed product direction in docs so **core LabForge = mini lab deployer/creator for pentesters**, while teaching features remain optional menus.

## 2026-03-30 · Phase 2
- simplified nav into Core LabForge + AI Forge + optional Teaching Mode
- added feature flag `LABFORGE_CLASSROOM=false` to hide monitoring/replay by default
- added stronger Ollama connectivity probe with fallback URLs and `/api/config` + `/api/ollama/status`
- added janitor endpoint `/api/system/janitor` for dead container/network/volume cleanup
- adjusted terminology toward personal mini-lab workflow: Catalog, My Instances, Workbench
