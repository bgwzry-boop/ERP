-- Current variance handling is a persisted state, separate from immutable decision history.
-- Old rows stay unresolved: do not guess an approval from status or a historical decision.
ALTER TABLE statements ADD COLUMN variance_handling TEXT NOT NULL DEFAULT '';
ALTER TABLE statements ADD COLUMN variance_handled_at TIMESTAMPTZ;
ALTER TABLE statements ADD CONSTRAINT statement_variance_handling_valid CHECK (
  variance_handling IN ('', '未收差额转欠款', '抹零/减免已审批', '账单有误待重算', '多笔付款待齐', '其他')
  AND ((variance_handling = '' AND variance_handled_at IS NULL)
    OR (variance_handling <> '' AND variance_handled_at IS NOT NULL))
);

-- Every writer, including later payment/quantity adjustments, invalidates the old
-- approval when its financial basis changes. Communication-only revisions retain it.
CREATE FUNCTION erp_invalidate_statement_variance_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.customer_id, NEW.receivable_amount, NEW.received_amount, NEW.variance_amount)
     IS DISTINCT FROM ROW(OLD.customer_id, OLD.receivable_amount, OLD.received_amount, OLD.variance_amount) THEN
    NEW.variance_handling := '';
    NEW.variance_handled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER statement_variance_state_invalidation
BEFORE UPDATE ON statements FOR EACH ROW
EXECUTE FUNCTION erp_invalidate_statement_variance_state();
