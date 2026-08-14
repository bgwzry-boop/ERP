-- Payroll runs and lines are accounting evidence.
-- State transitions are forward-only and payroll lines are mutable only while their run is a draft.

ALTER TABLE payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_month_check,
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check,
  DROP CONSTRAINT IF EXISTS payroll_runs_revision_check;

ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_month_check
    CHECK (payroll_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT payroll_runs_status_check
    CHECK (status IN ('draft', 'reviewed', 'locked', 'paid')),
  ADD CONSTRAINT payroll_runs_revision_check
    CHECK (revision >= 1);

CREATE OR REPLACE FUNCTION enforce_payroll_run_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.payroll_month IS DISTINCT FROM NEW.payroll_month
    OR OLD.revision IS DISTINCT FROM NEW.revision
    OR OLD.policy_version_id IS DISTINCT FROM NEW.policy_version_id
    OR OLD.generated_by IS DISTINCT FROM NEW.generated_by
    OR OLD.generated_at IS DISTINCT FROM NEW.generated_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'payroll run identity and generation evidence are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'reviewed' THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
      OR NEW.locked_by IS NOT NULL OR NEW.locked_at IS NOT NULL
      OR NEW.paid_by IS NOT NULL OR NEW.paid_at IS NOT NULL
      OR NEW.payment_reference <> '' THEN
      RAISE EXCEPTION 'reviewed payroll run audit evidence is invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'reviewed' AND NEW.status = 'locked' THEN
    IF OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by
      OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
      OR NEW.locked_by IS NULL OR NEW.locked_at IS NULL
      OR NEW.paid_by IS NOT NULL OR NEW.paid_at IS NOT NULL
      OR NEW.payment_reference <> '' THEN
      RAISE EXCEPTION 'locked payroll run audit evidence is invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'locked' AND NEW.status = 'paid' THEN
    IF OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by
      OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
      OR OLD.locked_by IS DISTINCT FROM NEW.locked_by
      OR OLD.locked_at IS DISTINCT FROM NEW.locked_at
      OR NEW.paid_by IS NULL OR NEW.paid_at IS NULL
      OR btrim(NEW.payment_reference) = '' THEN
      RAISE EXCEPTION 'paid payroll run audit evidence is invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid payroll run status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_run_state_transition ON payroll_runs;

CREATE TRIGGER trg_payroll_run_state_transition
BEFORE UPDATE ON payroll_runs
FOR EACH ROW
EXECUTE FUNCTION enforce_payroll_run_state_transition();

CREATE OR REPLACE FUNCTION enforce_draft_payroll_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_run_id TEXT;
  target_status TEXT;
BEGIN
  target_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  SELECT status INTO target_status FROM payroll_runs WHERE id = target_run_id;
  IF target_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'payroll lines are mutable only while the run is draft'
      USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_line_draft_mutation ON payroll_lines;

CREATE TRIGGER trg_payroll_line_draft_mutation
BEFORE INSERT OR UPDATE OR DELETE ON payroll_lines
FOR EACH ROW
EXECUTE FUNCTION enforce_draft_payroll_line_mutation();
