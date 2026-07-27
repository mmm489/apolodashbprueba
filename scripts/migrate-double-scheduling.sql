BEGIN;

ALTER TABLE IF EXISTS employee_schedule_shifts
  ADD COLUMN IF NOT EXISTS schedule_kind TEXT NOT NULL DEFAULT 'operational';

UPDATE employee_schedule_shifts
SET schedule_kind = 'operational'
WHERE schedule_kind IS NULL
   OR schedule_kind NOT IN ('operational', 'contractual');

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'employee_schedule_shifts'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%employee_id%'
    AND pg_get_constraintdef(c.oid) LIKE '%business_date%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employee_schedule_shifts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_schedule_shifts_kind_date
  ON employee_schedule_shifts(schedule_kind, business_date DESC);

ALTER TABLE IF EXISTS employee_hourly_cost_history
  ADD COLUMN IF NOT EXISTS overtime_hourly_cost NUMERIC(10,2);

COMMIT;
