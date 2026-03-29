const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

// 🔥 VULNERABILITY: Stores files with their ORIGINAL extension, including .js/.sh
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/tmp/uploads';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // Preserves original filename — allows path traversal too
  filename: (req, file, cb) => cb(null, file.originalname)
});

// 🔥 VULNERABILITY: No file type validation whatsoever
const upload = multer({ storage });

let db;
(async () => {
  for (let i = 0; i < 10; i++) {
    try {
      db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
      break;
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
})();

// 🔥 VULNERABILITY: Accepts any file type, stores executable extensions
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  await db.query('INSERT INTO uploads (filename, original_name, mimetype) VALUES (?,?,?)',
    [req.file.filename, req.file.originalname, req.file.mimetype]);
  res.json({
    message: 'Uploaded successfully',
    filename: req.file.filename,
    path: `/files/${req.file.filename}`,
    execute_url: `/run/${req.file.filename}`
  });
});

// 🔥 VULNERABILITY: Serves uploaded files (including scripts)
app.get('/files/:filename', (req, res) => {
  const filePath = path.join('/tmp/uploads', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

// 🔥 VULNERABILITY: Actually executes uploaded files!
// Simulates a "document converter" or "script runner" feature
app.get('/run/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('/tmp/uploads', filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  // "Run" the file based on extension
  const ext = path.extname(filename).toLowerCase();
  let cmd;
  if (ext === '.sh') cmd = `bash ${filePath}`;
  else if (ext === '.js') cmd = `node ${filePath}`;
  else if (ext === '.py') cmd = `python3 ${filePath}`;
  else return res.json({ message: 'File not executable', content: fs.readFileSync(filePath, 'utf8') });

  exec(cmd, { timeout: 5000 }, (err, stdout, stderr) => {
    res.json({ output: stdout, error: stderr, exit_code: err?.code });
  });
});

// 🔥 VULNERABILITY: Image processing via ImageMagick — path traversal + shell injection
app.get('/process-image', (req, res) => {
  const { filename, width } = req.query;
  // Shell injection via filename
  exec(`convert /tmp/uploads/${filename} -resize ${width} /tmp/out.jpg 2>&1`, (err, stdout, stderr) => {
    res.json({ output: stdout + stderr });
  });
});

app.get('/', (req, res) => res.json({
  lab: '09 - RCE via File Upload',
  endpoints: [
    'POST /upload  multipart form-data: file=<file>',
    'GET /files/:filename',
    'GET /run/:filename  ← executes the file!',
    'GET /process-image?filename=x.jpg&width=100  ← shell injection'
  ]
}));

app.listen(3000, () => console.log('Lab 09 running on :3000'));
