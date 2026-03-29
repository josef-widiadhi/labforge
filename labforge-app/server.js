const express  = require('express');
const { execSync, spawn } = require('child_process');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 4000;
const LABS_ROOT    = process.env.LABS_ROOT    || '/labs';
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://host.docker.internal:11434';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Lab directory resolver ────────────────────────────────────────────────────
function labDir(id) {
  // Chain labs: C01-C06 → labs/chain/c01-...
  if (/^C\d+$/i.test(id)) {
    const num = id.replace(/^C/i,'').padStart(2,'0');
    const chainDir = path.join(LABS_ROOT, 'chain');
    if (fs.existsSync(chainDir)) {
      const match = fs.readdirSync(chainDir).find(d => d.startsWith(`c${num}`));
      if (match) return path.join(chainDir, match);
    }
    return path.join(chainDir, `c${num}`);
  }
  // Regular labs: 01–21 → labs/01-sqli-basic/...
  const num = id.toString().padStart(2,'0');
  if (!fs.existsSync(LABS_ROOT)) return null;
  const match = fs.readdirSync(LABS_ROOT).find(d => d.startsWith(num+'-') && !d.startsWith('chain'));
  return match ? path.join(LABS_ROOT, match) : null;
}

// ── Container name resolver: find the API container (not db/redis) ────────────
function containerName(id) {
  const dir = labDir(id);
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    const out = execSync(
      `docker compose -f "${dir}/docker-compose.yml" ps --format "{{.Name}}" 2>/dev/null`,
      { timeout: 6000, cwd: dir }
    ).toString().trim().split('\n').filter(n => n && !/(-db|-redis|-db2)$/.test(n));
    return out[0] || null;
  } catch { return null; }
}

function runCompose(dir, args) {
  try {
    const out = execSync(`/usr/bin/docker-compose -f "${dir}/docker-compose.yml" ${args} 2>&1`, { timeout: 90000, cwd: dir }).toString();
    return { success: true, output: out };
  } catch (e) {
    return { success: false, output: e.stdout?.toString() || e.message };
  }
}

function getStatus(dir) {
  if (!dir || !fs.existsSync(dir)) return 'not_found';
  try {
    const raw = execSync(
      `/usr/bin/docker-compose -f "${dir}/docker-compose.yml" ps --format json 2>/dev/null`,
      { timeout: 6000, cwd: dir }
    ).toString().trim();
    if (!raw) return 'stopped';
    const containers = raw.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return containers.some(c => c.State === 'running') ? 'running' : 'stopped';
  } catch { return 'stopped'; }
}

// ════════════════════════════════════════════════════════════
// LAB STATUS — all labs
// ════════════════════════════════════════════════════════════
app.get('/api/labs/status', (req, res) => {
  const result = {};
  // 01–21
  for (let i = 1; i <= 21; i++) {
    const id = String(i).padStart(2, '0');
    result[id] = getStatus(labDir(id));
  }
  // C01–C06
  for (let i = 1; i <= 6; i++) {
    const id = 'C' + String(i).padStart(2, '0');
    result[id] = getStatus(labDir(id));
  }
  res.json(result);
});

// ════════════════════════════════════════════════════════════
// START / STOP
// ════════════════════════════════════════════════════════════
app.post('/api/labs/:id/start', (req, res) => {
  const dir = labDir(req.params.id);
  if (!dir) return res.status(404).json({ error: 'Lab not found', id: req.params.id });
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Lab directory missing', dir });
  const result = runCompose(dir, 'up -d --build');
  res.json({ id: req.params.id, ...result });
});

app.post('/api/labs/:id/stop', (req, res) => {
  const dir = labDir(req.params.id);
  if (!dir) return res.status(404).json({ error: 'Lab not found', id: req.params.id });
  const result = runCompose(dir, 'down -v');
  res.json({ id: req.params.id, ...result });
});

// ════════════════════════════════════════════════════════════
// LOGS (poll)
// ════════════════════════════════════════════════════════════
app.get('/api/labs/:id/logs', (req, res) => {
  const { id } = req.params;
  const { lines = 60 } = req.query;
  const dir = labDir(id);
  if (!dir) return res.status(404).json({ error: 'Not found' });
  try {
    const out = execSync(
      `docker compose -f "${dir}/docker-compose.yml" logs --tail=${lines} --no-color 2>&1`,
      { timeout: 8000, cwd: dir }
    ).toString();
    res.json({ id, logs: out });
  } catch (e) {
    res.json({ id, logs: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// LIVE STREAM — SSE (real docker logs -f piped to browser)
// ════════════════════════════════════════════════════════════
app.get('/api/labs/:id/stream', (req, res) => {
  const { id } = req.params;
  const dir    = labDir(id);

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${String(data).replace(/\n/g,' ')}\n\n`); } catch {}
  };

  if (!dir || !fs.existsSync(dir)) {
    send('error', `Lab ${id} directory not found. Deploy the lab first.`);
    return res.end();
  }

  // Find primary API container
  const cname = containerName(id);
  if (!cname) {
    send('error', `No running container for lab ${id}. Click ▶ Deploy first.`);
    return res.end();
  }

  send('connected', `Streaming ${cname} — attack pattern detector active`);

  // Spawn docker logs -f
  const proc = spawn('docker', ['logs', '-f', '--tail=80', '--timestamps', cname], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

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
  proc.stderr.on('data', flush);   // docker logs output goes to stderr
  proc.on('error', err => send('error', `Spawn error: ${err.message}`));
  proc.on('close', code => { send('log', `[container exited — code ${code}]`); res.end(); });

  req.on('close', () => { try { proc.kill('SIGTERM'); } catch {} res.end(); });
});

// ════════════════════════════════════════════════════════════
// DOCKER INFO
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

// ════════════════════════════════════════════════════════════
// OLLAMA PROXY — avoids CORS from browser-direct calls
// ════════════════════════════════════════════════════════════
app.get('/api/ollama/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    const d = await r.json();
    res.json({ available: true, models: d.models || [] });
  } catch (e) {
    res.json({ available: false, error: e.message });
  }
});

app.post('/api/ollama/chat', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(503).json({ error: 'Ollama unavailable', detail: e.message });
  }
});

app.delete('/api/ollama/models', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await fetch(`${OLLAMA_URL}/api/delete`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    res.json({ deleted: r.ok, name });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LabForge API', labs_root: LABS_ROOT, time: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════════
// SPA FALLBACK
// ════════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`[LabForge] API running on :${PORT}  labs=${LABS_ROOT}  ollama=${OLLAMA_URL}`));
