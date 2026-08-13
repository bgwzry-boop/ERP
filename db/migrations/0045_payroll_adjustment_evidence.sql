-- Persist accountant evidence linked to each immutable payroll-line adjustment.
-- Enforcement is introduced at the service boundary after the reviewed upload UI
-- is connected; this migration is additive and preserves historical adjustments.

ALTER TABLE payroll_line_adjustments
  ADD COLUMN IF NOT EXISTS evidence_attachment_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE payroll_line_adjustments
  DROP CONSTRAINT IF EXISTS payroll_line_adjustments_evidence_array,
  ADD CONSTRAINT payroll_line_adjustments_evidence_array CHECK (
    jsonb_typeof(evidence_attachment_ids_json) = 'array'
    AND jsonb_array_length(evidence_attachment_ids_json) <= 5
  );

CREATE OR REPLACE FUNCTION enforce_payroll_line_adjustment_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payroll line adjustments are immutable'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_line_adjustment_immutable ON payroll_line_adjustments;

CREATE TRIGGER trg_payroll_line_adjustment_immutable
BEFORE UPDATE OR DELETE ON payroll_line_adjustments
FOR EACH ROW
EXECUTE FUNCTION enforce_payroll_line_adjustment_immutable();
