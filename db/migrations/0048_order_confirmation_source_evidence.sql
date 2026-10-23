-- Preserve original pricing provenance separately from legacy numeric versions.
ALTER TABLE price_snapshots
  ADD COLUMN source_evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT price_snapshot_source_evidence_object
    CHECK (jsonb_typeof(source_evidence_json) = 'object');

CREATE FUNCTION protect_price_snapshot_source_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_evidence_json IS DISTINCT FROM OLD.source_evidence_json THEN
    RAISE EXCEPTION 'price snapshot source evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER price_snapshot_source_evidence_immutable
BEFORE UPDATE ON price_snapshots
FOR EACH ROW EXECUTE FUNCTION protect_price_snapshot_source_evidence();

-- Include the original delivery snapshot in the locked confirmation source.
-- Acquire row locks before taking the source snapshot used by confirmation.
-- VOLATILE PL/pgSQL statements take fresh READ COMMITTED snapshots after waits.
CREATE OR REPLACE FUNCTION erp_locked_confirmation_source(p_draft_id TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_channel TEXT;
  v_sources JSONB;
BEGIN
  SELECT source_channel INTO v_channel FROM order_drafts
    WHERE id=p_draft_id FOR UPDATE;
  PERFORM id FROM order_intake_submissions
    WHERE draft_id=p_draft_id ORDER BY id FOR UPDATE;
  PERFORM l.id FROM order_intake_lines l
    JOIN order_intake_submissions s ON s.id=l.submission_id
    WHERE s.draft_id=p_draft_id ORDER BY l.id FOR SHARE OF l;
  PERFORM p.id FROM order_intake_snapshots p
    JOIN order_intake_submissions s ON s.id=p.submission_id
    WHERE s.draft_id=p_draft_id ORDER BY p.id FOR SHARE OF p;
  SELECT result INTO v_sources FROM (
SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'sourceOrderNo', s.biz_no, 'draftId', s.draft_id,
      'customerId', s.customer_id, 'sourceChannel', s.source_channel,
      'delivery', jsonb_build_object('method', s.normalized_payload_json->'deliveryMethod', 'address', s.normalized_payload_json->'address', 'desiredDate', s.normalized_payload_json->'desiredDate', 'desiredTime', s.normalized_payload_json->'desiredTime', 'packagingPreference', s.normalized_payload_json->'packagingPreference'),
      'status', s.status, 'revision', s.revision, 'requestHash', s.request_hash,
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'draftLineId', l.draft_line_id, 'clientLineId', l.client_line_id,
        'mappingStatus', l.mapping_status, 'normalizedLine', l.normalized_line_json
      ) ORDER BY l.line_seq) FROM order_intake_lines l WHERE l.submission_id=s.id), '[]'::jsonb),
      'snapshots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'type', p.snapshot_type, 'priceVersion', p.price_version,
        'authoritative', p.authoritative, 'priceReleaseId', p.price_release_id,
        'priceReleaseSha256', p.price_release_sha256, 'quote', p.quote_snapshot_json
      ) ORDER BY p.id) FROM order_intake_snapshots p WHERE p.submission_id=s.id), '[]'::jsonb)
    ) ORDER BY s.id), '[]'::jsonb) AS result
    FROM order_intake_submissions s WHERE s.draft_id=p_draft_id
  ) source_snapshot;
  RETURN jsonb_build_object('sourceChannel',v_channel,'sources',v_sources);
END;
$$;
