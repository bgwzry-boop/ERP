-- One physical package keeps one immutable code, even when several order lines share it.
ALTER TABLE print_records ADD COLUMN document_type text NOT NULL DEFAULT '';
ALTER TABLE packages ADD COLUMN contents_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(contents_json)='array');
ALTER TABLE packages ADD COLUMN packing_revision integer NOT NULL DEFAULT 0 CHECK (packing_revision>=0);
ALTER TABLE packages ADD COLUMN superseded_by_batch_id text NOT NULL DEFAULT '';
ALTER TABLE fulfillment_records ADD COLUMN packing_group_anchor_id text NOT NULL DEFAULT '';
ALTER TABLE fulfillment_records ADD COLUMN packing_group_revision integer NOT NULL DEFAULT 0;
CREATE INDEX packages_contents_fulfillment_idx ON packages USING gin(contents_json);
CREATE INDEX fulfillment_packing_group_idx ON fulfillment_records(packing_group_anchor_id,id);

CREATE FUNCTION erp_validate_mixed_package() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE anchor_order text; item jsonb; total bigint:=0; item_order text; item_line text;
BEGIN
  IF jsonb_array_length(NEW.contents_json)>0 THEN
    SELECT line.order_id INTO anchor_order FROM fulfillment_records f JOIN order_lines line ON line.id=f.order_line_id WHERE f.id=NEW.fulfillment_id;
    IF anchor_order IS NULL THEN RAISE EXCEPTION 'MIXED_PACKAGE_ANCHOR_REQUIRED'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.contents_json) LOOP
      IF jsonb_typeof(item->'packedQty') IS DISTINCT FROM 'number' OR COALESCE(item->>'packedQty','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'MIXED_PACKAGE_QUANTITY_INVALID'; END IF;
      SELECT line.order_id,f.order_line_id INTO item_order,item_line FROM fulfillment_records f JOIN order_lines line ON line.id=f.order_line_id WHERE f.id=item->>'fulfillmentId';
      IF item_order IS DISTINCT FROM anchor_order OR item_line IS DISTINCT FROM item->>'orderLineId' THEN RAISE EXCEPTION 'MIXED_PACKAGE_ORDER_MISMATCH'; END IF;
      total:=total+(item->>'packedQty')::bigint;
    END LOOP;
    IF total<>NEW.packed_qty THEN RAISE EXCEPTION 'MIXED_PACKAGE_QUANTITY_MISMATCH'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.contents_json IS DISTINCT FROM OLD.contents_json OR NEW.packed_qty<>OLD.packed_qty OR
    (OLD.status NOT IN ('已作废','已失效','voided','invalidated') AND NEW.status IN ('已作废','已失效','voided','invalidated'))) THEN
    IF EXISTS(SELECT 1 FROM fulfillment_records f WHERE (f.id=OLD.fulfillment_id OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.contents_json) i WHERE i->>'fulfillmentId'=f.id))
      AND (f.physical_outbound_at IS NOT NULL OR f.loaded_at IS NOT NULL OR f.final_delivery_at IS NOT NULL OR f.delivered_at IS NOT NULL))
    THEN RAISE EXCEPTION 'ERP_MIXED_PACKAGE_DOWNSTREAM_CONFLICT'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packages_mixed_contents_guard BEFORE INSERT OR UPDATE ON packages FOR EACH ROW EXECUTE FUNCTION erp_validate_mixed_package();
