-- An employee-month can have calculation revisions, but ordinary monthly
-- payment can only be confirmed once. Keep every historical run unchanged.
-- Do not leave a gap for an old writer between backfill and trigger installation.
LOCK TABLE payroll_runs IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS payroll_paid_month_guards (
  payroll_month TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id)
);

-- The first recorded paid run blocks new full payments even when old data
-- already contains more than one paid revision. This does not reconcile those runs.
INSERT INTO payroll_paid_month_guards (payroll_month, payroll_run_id)
SELECT DISTINCT ON (payroll_month) payroll_month, id
FROM payroll_runs
WHERE status = 'paid'
ORDER BY payroll_month, paid_at NULLS LAST, revision, id
ON CONFLICT (payroll_month) DO NOTHING;

CREATE OR REPLACE FUNCTION guard_ordinary_payroll_month_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  INSERT INTO payroll_paid_month_guards (payroll_month, payroll_run_id)
  VALUES (NEW.payroll_month, NEW.id)
  ON CONFLICT (payroll_month) DO NOTHING;
  IF NOT FOUND THEN
    RAISE unique_violation USING
      MESSAGE = 'ordinary payroll is already paid for this month',
      CONSTRAINT = 'payroll_paid_month_guards_pkey';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_month_payment_guard ON payroll_runs;
CREATE TRIGGER trg_payroll_month_payment_guard
AFTER INSERT OR UPDATE OF status ON payroll_runs
FOR EACH ROW EXECUTE FUNCTION guard_ordinary_payroll_month_payment();
