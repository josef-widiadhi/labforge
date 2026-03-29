CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100),
  email VARCHAR(200),
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id),
  title VARCHAR(200),
  content TEXT,
  is_confidential BOOLEAN DEFAULT false
);

-- UUIDs are fixed for lab reproducibility
INSERT INTO users (id, username, email, role) VALUES
('11111111-1111-1111-1111-111111111111', 'admin', 'admin@corp.com', 'admin'),
('22222222-2222-2222-2222-222222222222', 'alice', 'alice@corp.com', 'user'),
('33333333-3333-3333-3333-333333333333', 'bob', 'bob@corp.com', 'user');

INSERT INTO reports (id, owner_id, title, content, is_confidential) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Q4 Financial Report', 'Revenue: $12M. Acquisition target identified: CompanyX.', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Alice Personal Report', 'My personal notes and salary data: $95k.', true),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'Bob Project Plan', 'Project X timeline and budget.', false);
