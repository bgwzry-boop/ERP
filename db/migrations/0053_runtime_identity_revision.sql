-- Serialize identity snapshots across API processes; stale writes must roll back.
CREATE TABLE runtime_identity_revision (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO runtime_identity_revision(singleton, revision) VALUES (TRUE, 0);

CREATE FUNCTION erp_claim_runtime_identity_revision(expected_revision BIGINT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE next_revision BIGINT;
BEGIN
  UPDATE runtime_identity_revision
  SET revision = revision + 1
  WHERE singleton = TRUE AND revision = expected_revision
  RETURNING revision INTO next_revision;
  IF next_revision IS NULL THEN
    RAISE EXCEPTION 'ERP_RUNTIME_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  RETURN next_revision;
END;
$$;
