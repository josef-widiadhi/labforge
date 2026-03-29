// C02 — SSRF → Internal API → Command Injection → RCE
const express = require('express');
const { execSync } = require('child_process');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    lab: 'C02 — SSRF → Internal API → RCE',
    service: 'WebhookTester v2.1',
    stages: [
      'Stage 1: POST /api/webhook {"url":"http://internal-api:3001/"} — reach internal service via SSRF',
      'Stage 2: Enumerate /api/webhook to find internal admin endpoints',
      'Stage 3: GET internal /admin/ping?host=127.0.0.1;id — command injection → RCE',
    ]
  });
});

// 🔥 SSRF entry point — fetches any URL including internal Docker network
app.post('/api/webhook', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error:'url required', example:'{"url":"http://internal-api:3001/"}' });
  console.log(`[WEBHOOK] Fetching: ${url}`);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const text = await r.text();
    res.json({ status: r.status, body: text, url_fetched: url });
  } catch(e) {
    res.json({ error: e.message, tried: url, hint: 'Try http://internal-api:3001/' });
  }
});

// GET version for easy curl chaining
app.get('/api/webhook', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error:'?url= required' });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    res.json({ status: r.status, body: await r.text() });
  } catch(e) { res.json({ error: e.message }); }
});

app.listen(3000, () => console.log('[C02-web] SSRF entry running :3000'));
