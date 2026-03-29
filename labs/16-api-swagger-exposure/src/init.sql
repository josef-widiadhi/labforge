CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_name VARCHAR(200),
  api_key VARCHAR(64),
  permissions TEXT,
  is_active TINYINT(1) DEFAULT 1
);
CREATE TABLE internal_config (
  key_name VARCHAR(100) PRIMARY KEY,
  value TEXT
);
INSERT INTO api_keys (client_name, api_key, permissions) VALUES
('MobileApp-iOS', 'sk-ios-prod-abc123def456', 'read:users,read:orders'),
('AdminPanel', 'sk-admin-panel-xyz789', 'read:all,write:all,delete:all'),
('ThirdPartyIntegration', 'sk-third-zyx321', 'read:products');
INSERT INTO internal_config VALUES
('db_backup_path', 's3://company-backup/prod/'),
('admin_email', 'admin@company.internal'),
('debug_mode', 'false'),
('internal_api_base', 'http://internal-api.company.local:8080');
