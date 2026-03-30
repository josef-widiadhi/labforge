const express  = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { execSync, spawn } = require('child_process');
const path     = require('path');
const fs       = require('fs');
const net      = require('net');
const crypto   = require('crypto');
const { initialState, execute } = require('./fake_shell');

const app  = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const PORT = process.env.PORT || 4000;
const LABS_ROOT    = process.env.LABS_ROOT    || '/labs';
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://host.docker.internal:11434';
const OLLAMA_FALLBACKS = (process.env.OLLAMA_URL_FALLBACKS || 'http://host.docker.internal:11434,http://172.17.0.1:11434,http://localhost:11434').split(',').map(s => s.trim()).filter(Boolean);
const FEATURE_CLASSROOM = String(process.env.LABFORGE_CLASSROOM || 'true').toLowerCase() === 'true';
const STATE_DIR = process.env.LABFORGE_STATE_DIR || '/tmp/labforge-state';
const INSTANCES_FILE = path.join(STATE_DIR, 'instances.json');
const CLASSROOM_FILE = path.join(STATE_DIR, 'classroom_sessions.json');
const INSTANCE_PREFIX = 'lf';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

fs.mkdirSync(STATE_DIR, { recursive: true });
if (!fs.existsSync(INSTANCES_FILE)) fs.writeFileSync(INSTANCES_FILE, '[]');
if (!fs.existsSync(CLASSROOM_FILE)) fs.writeFileSync(CLASSROOM_FILE, '[]');

function loadInstances() {
  try {
    return JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveInstances(instances) {
  fs.writeFileSync(INSTANCES_FILE, JSON.stringify(instances, null, 2));
}

function loadClassroomSessions() {
  try { return JSON.parse(fs.readFileSync(CLASSROOM_FILE, 'utf8')); } catch { return []; }
}
function saveClassroomSessions(items) {
  fs.writeFileSync(CLASSROOM_FILE, JSON.stringify(items, null, 2));
}
function getLabReadme(templateId) {
  const dir = labDir(templateId);
  if (!dir) return '';
  const readmePath = path.join(dir, 'README.md');
  try { return fs.readFileSync(readmePath, 'utf8'); } catch { return ''; }
}
function findSessionByToken(token) {
  return loadClassroomSessions().find(s => s.token === token);
}
function persistSession(session) {
  const items = loadClassroomSessions();
  const idx = items.findIndex(s => s.id === session.id);
  if (idx >= 0) items[idx] = session; else items.push(session);
  saveClassroomSessions(items);
  return session;
}
async function ensureInstanceForSession(templateId, ownerId) {
  const existing = refreshInstances().filter(i => i.templateId === templateId && i.ownerType === 'student' && i.ownerId === ownerId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if (existing && existing.status === 'running') return existing;
  const result = await createInstanceFromTemplate(templateId, { ownerType: 'student', ownerId });
  if (!result.ok) throw new Error(result.body?.error || 'Failed to create student instance');
  return result.body.instance;
}

const wsClients = { students: new Map(), instructors: new Set() };

function wsSend(ws, payload) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload)); } catch {}
}

function shellPromptFromSession(session) {
  return `${session.shellState?.user || 'student'}@labforge-cli:${session.shellState?.cwd || '/home/student'}$`;
}

function classroomLiveSummary(session) {
  const history = session.history || [];
  return {
    id: session.id,
    token: session.token,
    studentId: session.studentId,
    studentName: session.studentName,
    templateId: session.templateId,
    targetUrl: session.targetUrl,
    score: session.shellState?.score || session.cli?.score || 0,
    commands: history.length,
    lastCommand: history.length ? history[history.length - 1].command : null,
    updatedAt: session.updatedAt || session.createdAt,
  };
}

function broadcastInstructorSnapshot() {
  const sessions = loadClassroomSessions().map(classroomLiveSummary).sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
  for (const ws of wsClients.instructors) wsSend(ws, { type: 'live', sessions });
}

function runSessionCommand(session, command, transport = 'http') {
  session.shellState = session.shellState || initialState(session);
  const beforeCwd = session.shellState.cwd || '/home/student';
  const result = execute(command || '', session.shellState);
  const nowIso = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    seq: (session.history?.length || 0) + 1,
    at: nowIso,
    command: String(command || ''),
    output: result.output,
    cwd: beforeCwd,
    prompt: result.prompt,
    scoreAfter: result.score,
    points: (result.events || []).reduce((sum, ev) => sum + (ev.points || 0), 0),
    tags: (result.events || []).map(ev => ev.tag),
    transport,
  };
  session.history = [...(session.history || []), entry].slice(-800);
  session.events = [...(session.events || []), ...(result.events || []).map(ev => ({ ...ev, at: nowIso, command: entry.command, seq: entry.seq }))].slice(-250);
  session.cli = { prompt: result.prompt, score: result.score };
  session.updatedAt = nowIso;
  persistSession(session);
  broadcastInstructorSnapshot();
  return { result, entry, session };
}

function heuristicGrade(session) {
  const found = new Set(session.shellState?.found || []);
  const history = session.history || [];
  const commands = history.length;
  const score = session.shellState?.score || 0;
  const buckets = {
    recon: ['nmap', 'ffuf', 'recon-api', 'find'],
    secrets: ['secrets', 'grep-secrets', 'admin-dir'],
    exploit: ['idor', 'sqli', 'jwt', 'jwt-tool'],
  };
  const recon = buckets.recon.filter(x => found.has(x)).length;
  const secrets = buckets.secrets.filter(x => found.has(x)).length;
  const exploit = buckets.exploit.filter(x => found.has(x)).length;
  const efficiency = Math.max(40, Math.min(100, 100 - Math.max(0, commands - 10) * 3));
  const total = Math.max(0, Math.min(100, Math.round((score * 0.55) + recon * 10 + secrets * 12 + exploit * 15 + efficiency * 0.15)));
  return {
    total,
    rubric: {
      recon: Math.min(100, recon * 30 + (found.has('recon-api') ? 15 : 0)),
      secrets: Math.min(100, secrets * 35),
      exploitation: Math.min(100, exploit * 28),
      efficiency,
    },
    summary: `The learner executed ${commands} command(s), reached ${score} in-session points, and collected ${found.size} unique finding tags. Recon depth ${recon}/4, secret discovery ${secrets}/3, exploitation depth ${exploit}/4.`,
  };
}

async function gradeSessionWithAI(session) {
  const heuristic = heuristicGrade(session);
  const history = (session.history || []).slice(-20)
    .map(h => `${h.seq}. ${h.command}\n${String(h.output || '').slice(0, 220)}`)
    .join('\n\n');
  const base = {
    generatedAt: new Date().toISOString(),
    heuristic,
    aiUsed: false,
    model: null,
    summary: heuristic.summary,
  };
  try {
    const probe = await probeOllama();
    if (!probe.available || !probe.url || !(probe.models || []).length) return base;
    const model = probe.models[0].name || probe.models[0].model;
    const prompt = `You are grading a pentest training session from LabForge. Provide concise educator feedback in 4 parts: Overall verdict, Strengths, Weaknesses, Next step. Keep it under 180 words.\n\nTemplate: ${session.templateId}\nStudent: ${session.studentName}\nHeuristic score: ${heuristic.total}/100\nFindings: ${(session.shellState?.found || []).join(', ') || 'none'}\nCommand count: ${(session.history || []).length}\nRecent history:\n${history || '(no commands yet)'}`;
    const d = await fetchJson(`${probe.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: 'You are a precise pentesting instructor.' }, { role: 'user', content: prompt }] }),
      timeout: 120000,
    });
    return {
      ...base,
      aiUsed: true,
      model,
      summary: d?.message?.content || heuristic.summary,
    };
  } catch (e) {
    return { ...base, error: e.message || 'AI summary unavailable' };
  }
}

// ── Lab directory resolver ────────────────────────────────────────────────────
function labDir(id) {
  if (/^C\d+$/i.test(id)) {
    const num = id.replace(/^C/i,'').padStart(2,'0');
    const chainDir = path.join(LABS_ROOT, 'chain');
    if (fs.existsSync(chainDir)) {
      const match = fs.readdirSync(chainDir).find(d => d.startsWith(`c${num}`));
      if (match) return path.join(chainDir, match);
    }
    return path.join(chainDir, `c${num}`);
  }
  const num = id.toString().padStart(2,'0');
  if (!fs.existsSync(LABS_ROOT)) return null;
  const match = fs.readdirSync(LABS_ROOT).find(d => d.startsWith(num+'-') && !d.startsWith('chain'));
  return match ? path.join(LABS_ROOT, match) : null;
}

function escapeShell(value) {
  return `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`;
}

function composeBin() {
  try {
    execSync('docker compose version', { stdio: 'ignore', timeout: 4000 });
    return 'docker compose';
  } catch {
    return 'docker-compose';
  }
}

function composeFile(dir) {
  return path.join(dir, 'docker-compose.yml');
}

function runCmd(cmd, opts = {}) {
  return execSync(cmd, { timeout: 90000, ...opts }).toString();
}

function composeArgs(projectName, files, args) {
  const fileArgs = files.map(f => `-f ${escapeShell(f)}`).join(' ');
  return `${composeBin()} -p ${escapeShell(projectName)} ${fileArgs} ${args}`;
}

function runComposeProject(projectName, dir, files, args, opts = {}) {
  const cmd = composeArgs(projectName, files, args);
  try {
    const out = runCmd(cmd, { cwd: dir, ...opts });
    return { success: true, output: out };
  } catch (e) {
    return { success: false, output: e.stdout?.toString() || e.stderr?.toString() || e.message };
  }
}

function overrideFilePath(instanceId) {
  return path.join(STATE_DIR, `compose.override.${instanceId}.yml`);
}

function generateProjectName(templateId) {
  const slug = String(templateId).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${INSTANCE_PREFIX}_${slug}_${crypto.randomBytes(3).toString('hex')}`;
}

function findExposedPort(baseComposeFile) {
  try {
    const raw = fs.readFileSync(baseComposeFile, 'utf8');
    const match = raw.match(/ports:\s*(?:\n\s*-\s*|\[\s*")([0-9]{2,5}):3000/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function writeOverrideFile(instanceId, hostPort) {
  const file = overrideFilePath(instanceId);
  const yml = `services:\n  api:\n    ports:\n      - \"${hostPort}:3000\"\n`;
  fs.writeFileSync(file, yml, 'utf8');
  return file;
}

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function allocatePort(preferred) {
  if (preferred && await isPortFree(preferred)) return preferred;
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(err => err ? reject(err) : resolve(port));
    });
  });
}

function getProjectContainers(projectName) {
  try {
    const out = runCmd(`docker ps -a --filter label=com.docker.compose.project=${projectName} --format "{{.ID}}"`, { timeout: 10000 }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function listProjectContainersDetailed(projectName) {
  try {
    const out = runCmd(`docker ps -a --filter label=com.docker.compose.project=${projectName} --format "{{json .}}"`, { timeout: 10000 }).trim();
    return out ? out.split('\n').map(l => JSON.parse(l)) : [];
  } catch {
    return [];
  }
}

function getInstanceStatus(instance) {
  const containers = listProjectContainersDetailed(instance.projectName);
  if (!containers.length) return 'stopped';
  return containers.some(c => /Up/i.test(c.Status || '')) ? 'running' : 'stopped';
}

function refreshInstances() {
  const instances = loadInstances().map(inst => ({ ...inst, status: getInstanceStatus(inst), updatedAt: new Date().toISOString() }));
  saveInstances(instances);
  return instances;
}

function findTemplateInstances(templateId, instances = loadInstances()) {
  return instances.filter(i => i.templateId === String(templateId));
}

function summarizeLabStates(instances) {
  const result = {};
  for (let i = 1; i <= 21; i++) result[String(i).padStart(2, '0')] = 'stopped';
  for (let i = 1; i <= 6; i++) result['C' + String(i).padStart(2, '0')] = 'stopped';
  for (const inst of instances) {
    const count = findTemplateInstances(inst.templateId, instances).filter(x => x.status === 'running').length;
    result[inst.templateId] = count > 0 ? 'running' : result[inst.templateId];
  }
  return result;
}

function removeInstanceRecord(instanceId) {
  const instances = loadInstances().filter(i => i.id !== instanceId);
  saveInstances(instances);
}

function destroyInstance(instance, { removeRecord = true } = {}) {
  const files = [instance.baseComposeFile, instance.overrideFile].filter(f => f && fs.existsSync(f));
  const down = runComposeProject(instance.projectName, instance.dir, files, 'down -v --remove-orphans');
  const lingering = getProjectContainers(instance.projectName);
  for (const id of lingering) {
    try { runCmd(`docker rm -f ${id}`, { timeout: 10000 }); } catch {}
  }
  try { if (instance.overrideFile && fs.existsSync(instance.overrideFile)) fs.unlinkSync(instance.overrideFile); } catch {}
  if (removeRecord) removeInstanceRecord(instance.id);
  return { success: down.success, output: down.output, removed: lingering };
}

function getPrimaryContainerNameFromProject(projectName) {
  try {
    const out = runCmd(`docker ps --filter label=com.docker.compose.project=${projectName} --format "{{.Names}}|{{.Label \"com.docker.compose.service\"}}"`, { timeout: 8000 }).trim();
    const rows = out ? out.split('\n') : [];
    const preferred = rows.find(r => /\|(api|app|web)$/i.test(r));
    const picked = preferred || rows.find(r => !/\|(db|redis|mysql|postgres)$/i.test(r)) || rows[0];
    return picked ? picked.split('|')[0] : null;
  } catch {
    return null;
  }
}

function resolveMonitorTarget(type, id) {
  const instances = refreshInstances();
  if (type === 'instance') {
    return instances.find(i => i.id === id) || null;
  }
  const matches = instances.filter(i => i.templateId === id && i.status === 'running').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return matches[0] || null;
}

async function fetchJson(url, options = {}) {
  const timeout = options.timeout || 4000;
  const signal = AbortSignal.timeout(timeout);
  const res = await fetch(url, { ...options, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function probeOllama() {
  const candidates = [OLLAMA_URL, ...OLLAMA_FALLBACKS].filter(Boolean);
  const tried = [];
  for (const base of [...new Set(candidates)]) {
    tried.push(base);
    try {
      const data = await fetchJson(`${base}/api/tags`, { timeout: 3500 });
      return { available: true, url: base, models: data.models || [], tried };
    } catch (e) {}
    try {
      const version = await fetchJson(`${base}/api/version`, { timeout: 2500 });
      return { available: true, url: base, models: [], version: version.version, tried };
    } catch (e) {}
  }
  return { available: false, url: null, models: [], tried, error: 'No reachable Ollama endpoint from LabForge container', hint: 'Check whether the LabForge container can reach host.docker.internal:11434 or your chosen OLLAMA_URL.' };
}

// ════════════════════════════════════════════════════════════
// TEMPLATE/LAB STATUS
// ════════════════════════════════════════════════════════════
app.get('/api/labs/status', (req, res) => {
  const instances = refreshInstances();
  res.json(summarizeLabStates(instances));
});

// ════════════════════════════════════════════════════════════
// TRUE INSTANCE CONTROLLER
// ════════════════════════════════════════════════════════════
async function createInstanceFromTemplate(templateId, payload = {}) {
  const dir = labDir(templateId);
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, status: 404, body: { error: 'Lab template not found', id: templateId } };
  }
  const baseComposeFile = composeFile(dir);
  const preferredPort = findExposedPort(baseComposeFile);
  try {
    const hostPort = await allocatePort(preferredPort);
    const instanceId = crypto.randomUUID();
    const projectName = generateProjectName(templateId);
    const overrideFile = writeOverrideFile(instanceId, hostPort);
    const files = [baseComposeFile, overrideFile];
    const up = runComposeProject(projectName, dir, files, 'up -d --build');
    if (!up.success) {
      try { fs.unlinkSync(overrideFile); } catch {}
      return { ok: false, status: 500, body: { success: false, error: 'Failed to start instance', output: up.output } };
    }
    const instance = {
      id: instanceId,
      templateId,
      dir,
      baseComposeFile,
      overrideFile,
      projectName,
      hostPort,
      ownerType: payload.ownerType || 'solo',
      ownerId: payload.ownerId || 'local-user',
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const instances = loadInstances();
    instances.push(instance);
    saveInstances(instances);
    return { ok: true, status: 200, body: { success: true, instance, output: up.output } };
  } catch (e) {
    return { ok: false, status: 500, body: { success: false, error: e.message } };
  }
}

app.get('/api/instances', (req, res) => {
  const instances = refreshInstances();
  res.json({ instances });
});

app.post('/api/templates/:id/instances', async (req, res) => {
  const result = await createInstanceFromTemplate(req.params.id, req.body || {});
  res.status(result.status).json(result.body);
});

app.post('/api/instances/:id/stop', (req, res) => {
  const instances = loadInstances();
  const instance = instances.find(i => i.id === req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  const result = runComposeProject(instance.projectName, instance.dir, [instance.baseComposeFile, instance.overrideFile].filter(f => fs.existsSync(f)), 'stop');
  saveInstances(instances.map(i => i.id === instance.id ? { ...i, status: 'stopped', updatedAt: new Date().toISOString() } : i));
  res.json({ success: result.success, instanceId: instance.id, output: result.output });
});

app.post('/api/instances/:id/reset', async (req, res) => {
  const instances = loadInstances();
  const instance = instances.find(i => i.id === req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  destroyInstance(instance, { removeRecord: true });
  const result = await createInstanceFromTemplate(instance.templateId, { ownerType: instance.ownerType, ownerId: instance.ownerId });
  res.status(result.status).json(result.body);
});

app.delete('/api/instances/:id', (req, res) => {
  const instances = loadInstances();
  const instance = instances.find(i => i.id === req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  const result = destroyInstance(instance, { removeRecord: true });
  res.json({ success: result.success, instanceId: instance.id, output: result.output, removed: result.removed });
});

// Compatibility bridge for existing template-centric UI
app.post('/api/labs/:id/start', async (req, res) => {
  const result = await createInstanceFromTemplate(req.params.id, req.body || {});
  res.status(result.status).json(result.body);
});

app.post('/api/labs/:id/stop', (req, res) => {
  const instances = refreshInstances().filter(i => i.templateId === req.params.id);
  if (!instances.length) return res.json({ success: true, output: 'No instances found for this template.' });
  const outputs = instances.map(i => destroyInstance(i, { removeRecord: true }));
  res.json({ success: outputs.every(o => o.success), destroyed: instances.length, output: outputs.map(o => o.output).join('\n') });
});

// ════════════════════════════════════════════════════════════
// LOGS / STREAM — template or instance aware
// ════════════════════════════════════════════════════════════
app.get('/api/labs/:id/logs', (req, res) => {
  const target = resolveMonitorTarget('template', req.params.id);
  if (!target) return res.status(404).json({ error: 'No running instance for template', id: req.params.id });
  const cname = getPrimaryContainerNameFromProject(target.projectName);
  if (!cname) return res.status(404).json({ error: 'Container not found', id: req.params.id });
  const lines = Number(req.query.lines || 60);
  try {
    const out = runCmd(`docker logs --tail=${lines} ${escapeShell(cname)} 2>&1`, { timeout: 8000 }).toString();
    res.json({ id: req.params.id, instanceId: target.id, logs: out });
  } catch (e) {
    res.json({ id: req.params.id, instanceId: target.id, logs: e.message });
  }
});

app.get('/api/instances/:id/logs', (req, res) => {
  const target = resolveMonitorTarget('instance', req.params.id);
  if (!target) return res.status(404).json({ error: 'Instance not found', id: req.params.id });
  const cname = getPrimaryContainerNameFromProject(target.projectName);
  if (!cname) return res.status(404).json({ error: 'Container not found', id: req.params.id });
  const lines = Number(req.query.lines || 60);
  try {
    const out = runCmd(`docker logs --tail=${lines} ${escapeShell(cname)} 2>&1`, { timeout: 8000 }).toString();
    res.json({ id: req.params.id, instanceId: target.id, logs: out });
  } catch (e) {
    res.json({ id: req.params.id, instanceId: target.id, logs: e.message });
  }
});

function streamLogsForTarget(req, res, target) {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${String(data).replace(/\n/g,' ')}\n\n`); } catch {}
  };

  if (!target) {
    send('error', 'No running instance found.');
    return res.end();
  }
  const cname = getPrimaryContainerNameFromProject(target.projectName);
  if (!cname) {
    send('error', `No running container for ${target.projectName}.`);
    return res.end();
  }

  send('connected', `Streaming ${cname} (${target.templateId}) on project ${target.projectName}`);
  const proc = spawn('docker', ['logs', '-f', '--tail=80', '--timestamps', cname], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const flush = chunk => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) send('log', line);
    }
  };
  proc.stdout.on('data', flush);
  proc.stderr.on('data', flush);
  proc.on('error', err => send('error', `Spawn error: ${err.message}`));
  proc.on('close', code => { send('log', `[container exited — code ${code}]`); res.end(); });
  req.on('close', () => { try { proc.kill('SIGTERM'); } catch {} res.end(); });
}

app.get('/api/labs/:id/stream', (req, res) => streamLogsForTarget(req, res, resolveMonitorTarget('template', req.params.id)));
app.get('/api/instances/:id/stream', (req, res) => streamLogsForTarget(req, res, resolveMonitorTarget('instance', req.params.id)));

// ════════════════════════════════════════════════════════════
// DOCKER INFO / CONFIG / OLLAMA
// ════════════════════════════════════════════════════════════
app.get('/api/docker/info', (req, res) => {
  try {
    const raw  = execSync('docker info --format "{{json .}}" 2>/dev/null', { timeout: 5000 }).toString();
    const info = JSON.parse(raw);
    res.json({ available: true, version: info.ServerVersion, containers: info.Containers, running: info.ContainersRunning });
  } catch {
    res.json({ available: false });
  }
});

app.get('/api/config', async (req, res) => {
  const ollama = await probeOllama();
  res.json({
    features: { classroom: FEATURE_CLASSROOM },
    ollama,
    instance_controller: true,
    env: {
      ollama_url: OLLAMA_URL,
      ollama_fallbacks: OLLAMA_FALLBACKS,
      classroom_enabled: FEATURE_CLASSROOM,
    },
  });
});

app.get('/api/ollama/status', async (req, res) => res.json(await probeOllama()));
app.get('/api/ollama/models', async (req, res) => res.json(await probeOllama()));

app.post('/api/ollama/chat', async (req, res) => {
  try {
    const probe = await probeOllama();
    if (!probe.available || !probe.url) return res.status(503).json({ error: 'Ollama unavailable', detail: probe.error || 'No reachable endpoint', tried: probe.tried });
    const d = await fetchJson(`${probe.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      timeout: 120000,
    });
    res.json(d);
  } catch (e) {
    res.status(503).json({ error: 'Ollama unavailable', detail: e.message });
  }
});

app.delete('/api/ollama/models', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const probe = await probeOllama();
    if (!probe.available || !probe.url) return res.status(503).json({ error: 'Ollama unavailable', detail: probe.error || 'No reachable endpoint', tried: probe.tried });
    await fetchJson(`${probe.url}/api/delete`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }), timeout: 30000,
    });
    res.json({ deleted: true, name, url: probe.url });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// LAB README
// ════════════════════════════════════════════════════════════
app.get('/api/labs/:id/readme', (req, res) => {
  const dir = labDir(req.params.id);
  if (!dir) return res.status(404).json({ error: 'Lab not found', id: req.params.id });
  const file = path.join(dir, 'README.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'README missing', id: req.params.id });
  try {
    res.json({ id: req.params.id, readme: fs.readFileSync(file, 'utf8') });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read README', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// JANITOR / CLEANUP
// ════════════════════════════════════════════════════════════
app.post('/api/labs/:id/cleanup', (req, res) => {
  const instances = refreshInstances().filter(i => i.templateId === req.params.id);
  const outputs = instances.map(i => destroyInstance(i, { removeRecord: true }));
  res.json({ success: outputs.every(o => o.success), cleaned: instances.length, output: outputs.map(o => o.output).join('\n') });
});

app.post('/api/system/janitor', (req, res) => {
  const report = { containers: [], networks: [], volumes: [], instancesRemoved: [] };
  const knownProjects = new Set(loadInstances().map(i => i.projectName));
  try {
    const all = runCmd(`docker ps -a --filter label=com.docker.compose.project --format "{{.ID}}|{{.Label \"com.docker.compose.project\"}}"`, { timeout: 12000 }).trim().split('\n').filter(Boolean);
    for (const row of all) {
      const [id, project] = row.split('|');
      if (project && project.startsWith(`${INSTANCE_PREFIX}_`) && !knownProjects.has(project)) {
        try { runCmd(`docker rm -f ${id}`, { timeout: 10000 }); report.containers.push(id); } catch {}
      }
    }
  } catch {}
  for (const inst of loadInstances()) {
    if (getProjectContainers(inst.projectName).length === 0) {
      report.instancesRemoved.push(inst.id);
      try { if (inst.overrideFile && fs.existsSync(inst.overrideFile)) fs.unlinkSync(inst.overrideFile); } catch {}
    }
  }
  if (report.instancesRemoved.length) {
    saveInstances(loadInstances().filter(i => !report.instancesRemoved.includes(i.id)));
  }
  res.json({ success: true, report });
});


// ════════════════════════════════════════════════════════════
// CLASSROOM SESSIONS + WEB CLI
// ════════════════════════════════════════════════════════════
app.get('/api/classroom/sessions', (req, res) => {
  const sessions = loadClassroomSessions().map(s => {
    const instance = s.instanceId ? refreshInstances().find(i => i.id === s.instanceId) : null;
    const targetUrl = instance ? `http://localhost:${instance.hostPort}` : s.targetUrl;
    return {
      ...s,
      targetUrl,
      instanceStatus: instance?.status || 'missing',
      commandCount: (s.history || []).length,
      score: s.shellState?.score || s.cli?.score || 0,
      lastCommand: (s.history || []).length ? s.history[s.history.length - 1].command : null,
      grade: s.grade || null,
    };
  }).sort((a,b)=> new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ sessions });
});

app.get('/api/classroom/live', (req, res) => {
  res.json({ sessions: loadClassroomSessions().map(classroomLiveSummary) });
});

app.post('/api/classroom/sessions', async (req, res) => {
  try {
    const templateId = String(req.body?.templateId || '').trim();
    const studentName = String(req.body?.studentName || 'Student').trim();
    const studentId = String(req.body?.studentId || studentName.toLowerCase().replace(/[^a-z0-9]+/g,'-') || 'student').trim();
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });
    const instance = await ensureInstanceForSession(templateId, studentId);
    const token = crypto.randomBytes(8).toString('hex');
    const nowIso = new Date().toISOString();
    const session = persistSession({
      id: crypto.randomUUID(), token, templateId, studentName, studentId,
      instanceId: instance.id, targetUrl: `http://localhost:${instance.hostPort}`,
      readme: getLabReadme(templateId), createdAt: nowIso, updatedAt: nowIso,
      events: [], history: [], grade: null,
      cli: { prompt: 'student@labforge-cli:/home/student$', score: 0 },
      shellState: initialState({ templateId, targetUrl: `http://localhost:${instance.hostPort}` }),
    });
    broadcastInstructorSnapshot();
    res.json({ success: true, session, launchUrl: `/classroom/session/${token}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/classroom/sessions/:token', (req, res) => {
  const session = findSessionByToken(req.params.token);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const instance = session.instanceId ? refreshInstances().find(i => i.id === session.instanceId) : null;
  const targetUrl = instance ? `http://localhost:${instance.hostPort}` : session.targetUrl;
  res.json({
    ...session,
    targetUrl,
    instanceStatus: instance?.status || 'missing',
    cli: { prompt: shellPromptFromSession(session), score: session.shellState?.score || 0 },
    commandCount: (session.history || []).length,
  });
});

app.get('/api/classroom/sessions/:token/replay', (req, res) => {
  const session = findSessionByToken(req.params.token);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    session: {
      token: session.token,
      studentName: session.studentName,
      templateId: session.templateId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt || session.createdAt,
      score: session.shellState?.score || 0,
      targetUrl: session.targetUrl,
    },
    timeline: session.history || [],
    events: session.events || [],
    grade: session.grade || null,
  });
});

app.post('/api/classroom/sessions/:token/command', (req, res) => {
  const session = findSessionByToken(req.params.token);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { result, entry } = runSessionCommand(session, req.body?.command || '', 'http');
  res.json({ output: result.output, events: result.events, cli: session.cli, entry });
});

app.post('/api/classroom/sessions/:token/grade', async (req, res) => {
  const session = findSessionByToken(req.params.token);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const grade = await gradeSessionWithAI(session);
  session.grade = grade;
  session.updatedAt = new Date().toISOString();
  persistSession(session);
  res.json({ success: true, grade, session: classroomLiveSummary(session) });
});

app.get('/classroom/session/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student_session.html'));
});

app.get('/classroom/replay/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'classroom_replay.html'));
});

// ════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LabForge API', labs_root: LABS_ROOT, time: new Date().toISOString(), instance_controller: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

wss.on('connection', (ws, req) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { ws.close(); return; }
  const role = u.searchParams.get('role') || 'student';
  const token = u.searchParams.get('token');

  if (role === 'instructor') {
    wsClients.instructors.add(ws);
    wsSend(ws, { type: 'live', sessions: loadClassroomSessions().map(classroomLiveSummary) });
    ws.on('close', () => wsClients.instructors.delete(ws));
    return;
  }

  if (!token) { wsSend(ws, { type: 'error', error: 'Missing token' }); ws.close(); return; }
  const session = findSessionByToken(token);
  if (!session) { wsSend(ws, { type: 'error', error: 'Session not found' }); ws.close(); return; }
  wsClients.students.set(token, ws);
  wsSend(ws, {
    type: 'ready',
    prompt: shellPromptFromSession(session),
    score: session.shellState?.score || 0,
    targetUrl: session.targetUrl,
    history: session.history || [],
  });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw || '{}'));
      if (msg.type === 'command') {
        const liveSession = findSessionByToken(token);
        if (!liveSession) return wsSend(ws, { type: 'error', error: 'Session expired' });
        const { result, entry, session: updated } = runSessionCommand(liveSession, msg.command || '', 'ws');
        wsSend(ws, { type: 'output', output: result.output, prompt: updated.cli.prompt, score: updated.cli.score, events: result.events, entry });
      } else if (msg.type === 'refresh') {
        const liveSession = findSessionByToken(token);
        if (liveSession) wsSend(ws, { type: 'ready', prompt: shellPromptFromSession(liveSession), score: liveSession.shellState?.score || 0, targetUrl: liveSession.targetUrl, history: liveSession.history || [] });
      } else if (msg.type === 'ping') {
        wsSend(ws, { type: 'pong', at: new Date().toISOString() });
      }
    } catch (e) {
      wsSend(ws, { type: 'error', error: e.message || 'Bad websocket payload' });
    }
  });
  ws.on('close', () => { if (wsClients.students.get(token) === ws) wsClients.students.delete(token); });
});

server.listen(PORT, () => console.log(`[LabForge] API running on :${PORT}  labs=${LABS_ROOT}  ollama=${OLLAMA_URL}  classroom=${FEATURE_CLASSROOM}`));
