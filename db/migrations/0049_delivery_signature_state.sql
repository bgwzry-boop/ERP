-- Historical deliveries remain explicitly unreviewed (empty status), never inferred signed.
ALTER TABLE fulfillment_records ADD COLUMN IF NOT EXISTS signature_status text NOT NULL DEFAULT '';
ALTER TABLE fulfillment_records ADD COLUMN IF NOT EXISTS unsigned_reason text NOT NULL DEFAULT '';
ALTER TABLE fulfillment_records ADD CONSTRAINT fulfillment_signature_state_check CHECK (
 signature_status = '' OR
 (signature_status = 'signed' AND signature_photo_attached AND length(trim(signature_photo_attachment_id)) > 0 AND unsigned_reason = '') OR
 (signature_status = 'unsigned' AND length(trim(unsigned_reason)) > 0 AND NOT signature_photo_attached AND signature_photo_attachment_id = '')
);

-- Recheck physical package identity under the fulfillment transaction lock.
CREATE FUNCTION erp_require_driver_packages(p_fulfillment_id text, p_order_line_id text, p_scanned text[])
RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
DECLARE actual_ids text[];
BEGIN
  PERFORM id FROM packages WHERE fulfillment_id=p_fulfillment_id ORDER BY id FOR SHARE;
  SELECT array_agg(id ORDER BY id) INTO actual_ids FROM packages
    WHERE fulfillment_id=p_fulfillment_id AND order_line_id=p_order_line_id
      AND packed_qty > 0 AND status NOT IN ('已作废','已失效','voided','invalidated');
  IF coalesce(cardinality(actual_ids),0)=0 OR actual_ids IS DISTINCT FROM
    (SELECT array_agg(id ORDER BY id) FROM unnest(p_scanned) id) THEN
    RAISE EXCEPTION 'DRIVER_REAL_PACKAGES_CHANGED' USING ERRCODE='P0001';
  END IF;
  RETURN true;
END;
$$;
