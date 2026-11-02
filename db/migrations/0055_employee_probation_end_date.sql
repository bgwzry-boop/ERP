-- Owner decision 2026-11-02: no 岗位补贴 during probation; the office records when it ends.
ALTER TABLE employees ADD COLUMN probation_end_date DATE;
