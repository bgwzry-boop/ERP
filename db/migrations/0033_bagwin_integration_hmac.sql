-- Durable replay protection for the server-to-server Bagwin mini-program intake API.
-- Business orders continue to use the 0030 intake/draft/todo boundary.

CREATE TABLE IF NOT EXISTS bagwin_integration_request_nonces (
  key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  request_timestamp TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, nonce),
  CHECK (char_length(key_id) BETWEEN 3 AND 80),
  CHECK (nonce ~ '^[a-f0-9]{32}$'),
  CHECK (expires_at > request_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_bagwin_integration_request_nonces_expiry
  ON bagwin_integration_request_nonces(expires_at);
