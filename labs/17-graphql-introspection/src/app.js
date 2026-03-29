const express = require('express');
const { Pool } = require('pg');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');

const app = express();
app.use(express.json());

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });

// 🔥 VULNERABILITY: Schema exposes sensitive fields (password, secret_token, card_number)
const schema = buildSchema(`
  type User {
    id: Int
    username: String
    email: String
    password: String
    role: String
    secret_token: String
    orders: [Order]
  }
  type Order {
    id: Int
    user_id: Int
    amount: Float
    status: String
    card_number: String
  }
  type Query {
    user(id: Int): User
    users: [User]
    order(id: Int): Order
    orders(user_id: Int): [Order]
    searchUser(username: String): User
  }
  type Mutation {
    updateUser(id: Int, username: String, email: String, role: String, password: String): User
    deleteUser(id: Int): Boolean
  }
`);

// 🔥 VULNERABILITY: No auth, no field-level permissions, introspection enabled
const root = {
  user: async ({ id }) => {
    const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0];
  },
  // 🔥 Returns ALL users including passwords and tokens
  users: async () => {
    const r = await pool.query('SELECT * FROM users');
    return r.rows;
  },
  order: async ({ id }) => {
    const r = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return r.rows[0];
  },
  orders: async ({ user_id }) => {
    const r = await pool.query('SELECT * FROM orders WHERE user_id = $1', [user_id]);
    return r.rows;
  },
  // 🔥 VULNERABILITY: GraphQL injection via searchUser
  searchUser: async ({ username }) => {
    // Raw SQL injection in GraphQL resolver
    const r = await pool.query(`SELECT * FROM users WHERE username = '${username}'`);
    return r.rows[0];
  },
  updateUser: async ({ id, ...fields }) => {
    // 🔥 Mass assignment via GraphQL — can set role='admin'
    const cols = Object.keys(fields).filter(k => fields[k] !== undefined);
    if (cols.length === 0) return null;
    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const vals = [id, ...cols.map(c => fields[c])];
    const r = await pool.query(`UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`, vals);
    return r.rows[0];
  },
  deleteUser: async ({ id }) => {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return true;
  }
};

// 🔥 VULNERABILITY: graphiql=true in production, introspection not disabled
app.use('/graphql', graphqlHTTP({
  schema,
  rootValue: root,
  graphiql: true,  // ← Interactive IDE exposed to anyone
  // introspection: false  ← This is NOT set, so schema is fully inspectable
}));

app.get('/', (req, res) => res.json({
  lab: '17 - GraphQL Introspection + Injection',
  graphql_endpoint: 'http://localhost:8017/graphql',
  graphiql_ui: 'http://localhost:8017/graphql (GET request)',
  hints: [
    '1. Open GraphiQL UI and run introspection query',
    '2. Query { users { password secret_token } }',
    '3. Inject in searchUser: username = \' OR \'1\'=\'1',
    '4. mutation { updateUser(id:2, role:"admin") { role } }'
  ]
}));

app.listen(3000, () => console.log('Lab 17 running on :3000'));
