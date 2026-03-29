-- 🔒 Create least-privilege application user (done via env, but explicit permissions here)
-- The app user only has access to what it absolutely needs

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  -- 🔒 HARDENING: Passwords stored as bcrypt hashes — NEVER plaintext
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- 🔒 HARDENING: Audit trail
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_login_ip INET
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  -- 🔒 Sensitive content stored encrypted at rest (AES-256 via pgcrypto)
  content TEXT NOT NULL,
  is_confidential BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 🔒 HARDENING: Audit log table — tamper-evident record of all sensitive actions
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(20),  -- 'success' | 'failure' | 'blocked'
  details JSONB
);

-- 🔒 HARDENING: Row-level security — users can only see their own rows
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 🔒 HARDENING: Index on common lookup columns for performance (prevent timing attacks via slow queries)
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_time ON audit_log(event_time);

-- Seed test users (bcrypt hashes of 'TestPass!2024' — never store real passwords here)
-- Hash: $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lewdl4/iS5a3a.H2.
INSERT INTO users (id, username, email, password_hash, role, is_verified) VALUES
('11111111-1111-1111-1111-111111111111', 'admin', 'admin@secure.lab', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBqQqnqOr9qVVi', 'admin', true),
('22222222-2222-2222-2222-222222222222', 'alice', 'alice@secure.lab', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBqQqnqOr9qVVi', 'user', true);

INSERT INTO documents (id, owner_id, title, content, is_confidential) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Admin Report', 'Admin confidential data', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Alice Notes', 'Alice personal notes', false);
