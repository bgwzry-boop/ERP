-- V1 core migration draft: runtime imported employee accounts and seed-session revocations.
-- Runtime employee accounts reuse the production users table; seed_session_revocations stores logout / admin invalidation token jtis.

ALTER TABLE users ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_machine_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_status TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_issued_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_issued_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_revoked_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_revoked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_valid_after TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS seed_session_revocations (
  jti TEXT PRIMARY KEY,
  user_id TEXT,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_source ON users(source);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_password_status ON users(password_status);
CREATE INDEX IF NOT EXISTS idx_seed_session_revocations_user ON seed_session_revocations(user_id);
CREATE INDEX IF NOT EXISTS idx_seed_session_revocations_revoked_at ON seed_session_revocations(revoked_at);
CREATE INDEX IF NOT EXISTS idx_seed_session_revocations_expires_at ON seed_session_revocations(expires_at);
