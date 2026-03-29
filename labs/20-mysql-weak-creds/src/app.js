const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

let db;
(async () => {
  for (let i = 0; i < 15; i++) {
    try {
      db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
      break;
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
})();

app.get('/users', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users');
  res.json(rows); // 🔥 Returns passwords, credit cards, SSNs in cleartext!
});

app.get('/secrets', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM secrets');
  res.json(rows);
});

app.get('/', (req, res) => res.json({
  lab: '20 - MySQL Weak Credentials + Direct DB Exposure',
  mysql_port: 3309,
  credentials: { user: 'admin', password: 'admin', database: 'weakdb', root_password: 'root' },
  hint: 'MySQL is exposed on host port 3309. Connect directly: mysql -h 127.0.0.1 -P 3309 -u admin -padmin weakdb',
  also: 'Try root: mysql -h 127.0.0.1 -P 3309 -u root -proot'
}));

app.listen(3000, () => console.log('Lab 20 running on :3000'));
