const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });

// 🔥 VULNERABILITY: fetch() any URL provided by the user — no SSRF protection
app.post('/webhook/test', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    // No allowlist, no blocklist, no scheme restriction
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    res.json({ status: response.status, body: text, headers: Object.fromEntries(response.headers) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 VULNERABILITY: URL preview/screenshot feature — makes server-side requests
app.get('/preview', async (req, res) => {
  const { url } = req.query;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    res.send(`<html><body><h2>Preview of: ${url}</h2><pre>${text}</pre></body></html>`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 VULNERABILITY: PDF/report generator that fetches external resources
app.post('/report/generate', async (req, res) => {
  const { data_url } = req.body;
  try {
    const response = await fetch(data_url);
    const data = await response.json();
    res.json({ report: 'Generated report', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({
  lab: '08 - SSRF (Server-Side Request Forgery)',
  endpoints: [
    'POST /webhook/test  body:{url:"http://..."}',
    'GET /preview?url=http://...',
    'POST /report/generate  body:{data_url:"http://..."}',
  ],
  hint: 'Try fetching http://internal-service:8080 or http://169.254.169.254/latest/meta-data/'
}));

app.listen(3000, () => console.log('Lab 08 running on :3000'));
