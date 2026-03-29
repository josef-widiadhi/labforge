// C03 — File Upload RCE + Path Traversal / LFI Combo
// Stage 1: Upload a .js webshell via /upload (no validation)
// Stage 2: Use LFI to read /etc/passwd and config files
// Stage 3: Read /app/config/secret.txt to get flag
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json());

const upload = multer({ dest: '/app/uploads/' });

// Seed challenge files on startup
const dirs = ['/app/uploads', '/app/public', '/app/config'];
dirs.forEach(d => fs.mkdirSync(d, { recursive: true }));
fs.writeFileSync('/app/config/db.conf', 'DB_HOST=db\nDB_USER=appuser\nDB_PASS=Sup3rS3cret!\nDB_NAME=appdb\n');
fs.writeFileSync('/app/config/secret.txt', 'FLAG{upload_lfi_combined}\nINTERNAL_API_KEY=sk-internal-abc123\n');
fs.writeFileSync('/app/public/welcome.txt', 'Welcome to AcmeCorp web portal.\n');

app.get('/', (req, res) => {
  res.json({
    lab: 'C03 — File Upload + LFI Chain',
    stages: [
      'Stage 1: POST /upload — upload any file, no type validation',
      'Stage 2: GET /file?path=../../etc/passwd — path traversal',
      'Stage 3: GET /file?path=../../config/secret.txt — get the flag',
    ],
    endpoints: ['/upload', '/file?path=', '/uploads/<filename>'],
  });
});

// 🔥 VULN: No MIME type or extension check
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded', hint: 'multipart form-data, field name: file' });
  const dest = path.join('/app/uploads', req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({
    success: true,
    filename: req.file.originalname,
    url: `/uploads/${req.file.originalname}`,
    size: req.file.size,
    note: '🔥 No type validation — try uploading a .js or .sh file',
  });
});

app.use('/uploads', express.static('/app/uploads'));

// 🔥 VULN: Path traversal — joins user path onto /app/public with no sanitisation
app.get('/file', (req, res) => {
  const userPath = req.query.path;
  if (!userPath) return res.status(400).json({ error: '?path= required', example: '?path=welcome.txt' });

  const fullPath = path.join('/app/public', userPath);   // 🔥 unsanitised join
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(404).json({ error: e.message, tried: fullPath });
  }
});

app.listen(3000, () => console.log('[C03] Upload+LFI lab on :3000'));
