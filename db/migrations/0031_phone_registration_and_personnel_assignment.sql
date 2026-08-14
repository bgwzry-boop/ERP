-- Mobile-first employee identity: verified phone registration remains permissionless
-- until personnel management binds the account to an employee and assigns roles.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'legacy_account';
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_by TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone_e164_active
  ON users (phone_e164)
  WHERE phone_e164 IS NOT NULL AND phone_e164 <> '' AND enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_registration_status
  ON users (registration_status);

CREATE TABLE IF NOT EXISTS phone_verification_challenges (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  delivery_status TEXT NOT NULL DEFAULT 'sent',
  delivery_reference TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT phone_verification_purpose_check CHECK (purpose IN ('registration', 'login')),
  CONSTRAINT phone_verification_attempts_check CHECK (
    failed_attempts >= 0 AND max_attempts > 0 AND failed_attempts <= max_attempts
  )
);

CREATE INDEX IF NOT EXISTS idx_phone_verification_lookup
  ON phone_verification_challenges (phone_e164, purpose, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_verification_expiry
  ON phone_verification_challenges (expires_at)
  WHERE consumed_at IS NULL;
