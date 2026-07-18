BEGIN;

ALTER TABLE business_decision_authorizations
  DROP CONSTRAINT IF EXISTS business_decision_authorizations_decision_scope_check;

ALTER TABLE business_decision_authorizations
  ADD CONSTRAINT business_decision_authorizations_decision_scope_check
  CHECK (decision_scope IN (
    'order_priority',
    'production_schedule',
    'raw_material_purchase',
    'fulfillment_quantity_variance',
    'statement_variance',
    'statement_write_off',
    'major_exception'
  ));

ALTER TABLE business_decision_records
  DROP CONSTRAINT IF EXISTS business_decision_records_decision_scope_check;

ALTER TABLE business_decision_records
  ADD CONSTRAINT business_decision_records_decision_scope_check
  CHECK (decision_scope IN (
    'order_priority',
    'production_schedule',
    'raw_material_purchase',
    'fulfillment_quantity_variance',
    'statement_variance',
    'statement_write_off',
    'major_exception'
  ));

COMMIT;
