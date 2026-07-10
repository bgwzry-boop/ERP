-- Batch C: canonical attachment digest keys for retry-safe evidence uploads.

CREATE TABLE IF NOT EXISTS attachment_content_dedup_keys (
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_type, owner_id, purpose, content_digest),
  CHECK (content_digest ~ '^[0-9a-f]{64}$')
);

INSERT INTO attachment_content_dedup_keys (
  owner_type,
  owner_id,
  purpose,
  content_digest,
  attachment_id,
  created_at
)
SELECT DISTINCT ON (link.owner_type, link.owner_id, link.purpose, attachment.content_digest)
  link.owner_type,
  link.owner_id,
  link.purpose,
  attachment.content_digest,
  attachment.id,
  COALESCE(link.created_at, attachment.uploaded_at, now())
FROM attachments AS attachment
JOIN attachment_links AS link ON link.attachment_id = attachment.id
WHERE attachment.content_digest ~ '^[0-9a-f]{64}$'
ORDER BY
  link.owner_type,
  link.owner_id,
  link.purpose,
  attachment.content_digest,
  attachment.uploaded_at,
  attachment.id
ON CONFLICT (owner_type, owner_id, purpose, content_digest) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_attachment_content_dedup_attachment
  ON attachment_content_dedup_keys(attachment_id);
