
- [x] Add visible Teaching Mode UI toggle instead of only JS-hidden auto reveal.
- [x] Add Ollama diagnostics view so "offline" has teeth and receipts.
## Completed
- [x] Phase 3 true instance controller with generated project names and dynamic host ports.
- [x] Classroom mode enabled by default for review/demo usage.
- [x] Workbench README side panel now follows the currently selected lab instance.

# Ideas / Progress Tracker

## Core Product Direction
- [x] Reframe LabForge as **mini lab forge first**, classroom second.
- [x] Add Student View concept with in-app README side panel.
- [ ] Rename UI copy from teacher-heavy language to solo pentester-first language.
- [ ] Split optional menus behind feature flags: Classroom, Replay, Exam, Grading.

## Control Tower / Instance Controller
- [ ] Replace template-based start/stop with true **template -> instance** lifecycle.
- [ ] Generate unique per-instance compose project names.
- [ ] Support dynamic host port assignment.
- [ ] Add TTL expiry and janitor worker.
- [ ] Store instance metadata in DB.

## Cleanup / Docker Hygiene
- [x] Strengthen stop path with `--remove-orphans` and forced lingering container removal.
- [ ] Remove fixed `container_name` from deployable labs.
- [ ] Remove fixed host ports from templates and move them to runtime allocation.
- [ ] Add network/volume reconciliation job for orphan artifacts.

## AI Forge
- [ ] Turn AI lab generation into a full workflow: scenario -> compose -> README -> cheatsheet -> starter source.
- [ ] Add pentest tool selector with rationale per lab.
- [ ] Add attack summarizer from HTTP/CLI/log evidence.
- [ ] Add grading engine for solo sessions and classroom mode.
- [ ] Add remediation explainer / patch generator.

## Teaching Layer
- [ ] Monitor plugin separated from core workbench.
- [ ] Replay timeline stored in DB.
- [ ] Exam shell / CLI capture mode.
- [ ] Instructor annotations and grading dashboard.

- [x] Phase 2: declutter primary nav and push teaching tools behind feature flag
- [x] Improve Ollama status pill with fallback connectivity detection
- [x] Add janitor cleanup button for zombie lab debris
- [ ] Phase 3: instance-controller refactor (template -> instance, dynamic ports, TTL)

- [x] Phase 4: Classroom session launcher with student workbench page
- [x] Add controlled web CLI for teaching mode
- [ ] Upgrade CLI from request/response shell to websocket/xterm.js live terminal
- [ ] Add teacher-side replay timeline from classroom command history
