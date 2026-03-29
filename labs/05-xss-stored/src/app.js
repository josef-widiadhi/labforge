const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let db;
(async () => {
  for (let i = 0; i < 10; i++) {
    try {
      db = await mysql.createConnection({
        host: process.env.DB_HOST, user: process.env.DB_USER,
        password: process.env.DB_PASS, database: process.env.DB_NAME,
      });
      break;
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
})();

// 🔥 VULNERABILITY: Raw HTML output with no sanitization
// XSS payloads stored in DB are served directly to all viewers

// Get post + comments — renders unsanitized HTML
app.get('/posts/:id', async (req, res) => {
  const [posts] = await db.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  const [comments] = await db.query('SELECT * FROM comments WHERE post_id = ?', [req.params.id]);
  
  if (!posts.length) return res.status(404).send('<h1>Not found</h1>');

  // 🔥 VULNERABILITY: Unsanitized content injected directly into HTML response
  const post = posts[0];
  const commentHtml = comments.map(c => `
    <div class="comment">
      <strong>${c.author}</strong>: ${c.body}
    </div>
  `).join('');

  res.setHeader('Content-Type', 'text/html');
  // 🔥 Also missing Content-Security-Policy header
  res.send(`
    <html>
    <head><title>${post.title}</title></head>
    <body>
      <h1>${post.title}</h1>
      <p>${post.content}</p>
      <hr>
      <h3>Comments</h3>
      ${commentHtml}
      <form action="/posts/${post.id}/comments" method="POST">
        <input name="author" placeholder="Your name">
        <textarea name="body" placeholder="Your comment"></textarea>
        <button type="submit">Post</button>
      </form>
      <p>Your session: ${req.headers.cookie || 'none'}</p>
    </body>
    </html>
  `);
});

// 🔥 VULNERABILITY: Comment body stored raw without sanitization
app.post('/posts/:id/comments', async (req, res) => {
  const { author, body } = req.body;
  // No sanitization, no output encoding, no CSP
  await db.query('INSERT INTO comments (post_id, author, body) VALUES (?, ?, ?)',
    [req.params.id, author, body]);
  res.redirect(`/posts/${req.params.id}`);
});

// 🔥 VULNERABILITY: Profile bio also injectable (second injection point)
app.put('/profile/:userId', async (req, res) => {
  const { bio, website } = req.body;
  await db.query('UPDATE profiles SET bio = ?, website = ? WHERE user_id = ?',
    [bio, website, req.params.userId]);
  res.json({ message: 'Profile updated' });
});

app.get('/profile/:userId', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM profiles WHERE user_id = ?', [req.params.userId]);
  if (!rows.length) return res.status(404).send('Not found');
  const p = rows[0];
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html><body>
    <h2>User Profile</h2>
    <p>Bio: ${p.bio}</p>
    <p>Website: <a href="${p.website}">${p.website}</a></p>
    </body></html>
  `);
});

// JSON API also returns raw (for SPA injection)
app.get('/api/comments/:postId', async (req, res) => {
  const [comments] = await db.query('SELECT * FROM comments WHERE post_id = ?', [req.params.postId]);
  res.json(comments);
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html><body>
    <h1>Lab 05 - Stored XSS</h1>
    <ul>
      <li><a href="/posts/1">View Post 1</a></li>
      <li><a href="/posts/2">View Post 2</a></li>
      <li><a href="/profile/1">View Profile 1</a></li>
    </ul>
    </body></html>
  `);
});

app.listen(3000, () => console.log('Lab 05 running on :3000'));
