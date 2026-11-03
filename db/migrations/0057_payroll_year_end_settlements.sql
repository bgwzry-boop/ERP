-- Owner decision 2026-11-02: the insurance deposit and the held month are paid out at the
-- year-end wage settlement; the deposit is forfeited if the employee left before year end.
CREATE TABLE IF NOT EXISTS payroll_year_end_settlements (
  id TEXT PRIMARY KEY,
  settlement_year INTEGER NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  -- Release review 2026-11-03: anything withheld after an earlier settlement is settled as a
  -- further batch, so an employee can have several settlements in one year.
  settlement_seq INTEGER NOT NULL DEFAULT 1,
  held_wage NUMERIC(14, 2) NOT NULL DEFAULT 0,
  insurance_deposit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  deposit_forfeited NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  preview_digest TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  settled_by TEXT REFERENCES users(id),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (settlement_year, employee_id, settlement_seq),
  CONSTRAINT payroll_year_end_seq_check CHECK (settlement_seq >= 1),
  CONSTRAINT payroll_year_end_year_check CHECK (settlement_year BETWEEN 2000 AND 2100),
  CONSTRAINT payroll_year_end_amounts_check CHECK (held_wage >= 0 AND insurance_deposit >= 0 AND deposit_forfeited >= 0 AND payable_amount >= 0)
);
