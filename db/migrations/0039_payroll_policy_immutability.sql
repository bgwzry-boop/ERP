-- Published payroll rules are historical accounting evidence and cannot be overwritten in place.
-- Drafts may be edited or published. A changed published rule must use a new policy version id.

ALTER TABLE payroll_policy_versions
  DROP CONSTRAINT IF EXISTS payroll_policy_versions_status_check;

ALTER TABLE payroll_policy_versions
  ADD CONSTRAINT payroll_policy_versions_status_check
  CHECK (status IN ('draft', 'published', 'retired'));

CREATE OR REPLACE FUNCTION prevent_published_payroll_policy_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'published payroll policy versions are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_policy_immutable ON payroll_policy_versions;

CREATE TRIGGER trg_payroll_policy_immutable
BEFORE UPDATE ON payroll_policy_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_published_payroll_policy_update();
