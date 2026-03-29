const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const FILES_DIR = path.join(__dirname, 'files');
const LOGS_DIR = '/var/log';

// 🔥 VULNERABILITY: No path sanitization — allows ../../../etc/passwd
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  // Simple but broken attempt at validation — easily bypassed
  if (filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' }); 
    // Bypass: URL-encode the dots: %2e%2e%2f
  }
  const filePath = path.join(FILES_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.send(fs.readFileSync(filePath, 'utf8'));
});

// 🔥 VULNERABILITY: Template/log viewer — completely unprotected path traversal
app.get('/logs', (req, res) => {
  const { file } = req.query;
  if (!file) return res.json({ available: ['app.log', 'access.log', 'error.log'] });
  // No sanitization at all
  try {
    const content = fs.readFileSync(file, 'utf8');
    res.send(`<pre>${content}</pre>`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 VULNERABILITY: Download endpoint with path traversal
app.get('/download', (req, res) => {
  const { path: filePath } = req.query;
  const fullPath = `/app/${filePath}`;  // Prepends /app/ but traversal still works
  try {
    const content = fs.readFileSync(fullPath);
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(fullPath)}`);
    res.send(content);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// 🔥 VULNERABILITY: Config reader — meant to read from /app/config/ only
app.get('/config', (req, res) => {
  const { name } = req.query;
  const configPath = path.join('/app/config', name + '.conf');
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    res.json({ config: content });
  } catch {
    res.status(404).json({ error: 'Config not found' });
  }
});

app.get('/', (req, res) => res.json({
  lab: '10 - Path Traversal / Local File Inclusion',
  endpoints: [
    'GET /files/:filename  (naive check — bypassed with URL encoding)',
    'GET /logs?file=/var/log/app.log  (no restriction)',
    'GET /download?path=files/public.txt',
    'GET /config?name=db'
  ],
  hint: 'Try: /files/%2e%2e%2f%2e%2e%2fetc%2fpasswd or /logs?file=/etc/passwd'
}));

app.listen(3000, () => console.log('Lab 10 running on :3000'));
