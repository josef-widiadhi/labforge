// C02 internal-api — only reachable via SSRF from web container
const express = require('express');
const { execSync } = require('child_process');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'AcmeCorp Internal Admin API v0.9 — DO NOT EXPOSE',
    note: 'You found the internal API via SSRF! Now enumerate /admin/*',
    endpoints: ['/admin/ping', '/admin/env', '/admin/health']
  });
});

// 🔥 Command injection via ping endpoint
app.get('/admin/ping', (req, res) => {
  const { host } = req.query;
  if (!host) return res.json({ error:'?host= required', example:'?host=127.0.0.1' });
  try {
    // 🔥 no sanitisation — ; | ` all work
    const out = execSync(`ping -c 2 ${host} 2>&1`, { timeout:5000 }).toString();
    res.json({ command:`ping -c 2 ${host}`, output:out });
  } catch(e) {
    res.json({ error:e.message, stdout:e.stdout?.toString() });
  }
});

// 🔥 Exposes env including secrets
app.get('/admin/env', (req, res) => {
  res.json({ env:{...process.env, FLAG:'FLAG{ssrf_pivot_rce_chain}'}, note:'Secrets exposed!' });
});

app.get('/admin/health', (req, res) => {
  res.json({ status:'ok', host:require('os').hostname(), hint:'Check /admin/ping for command injection' });
});

app.listen(3001, () => console.log('[C02-internal] Internal API running :3001'));
