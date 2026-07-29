BEGIN;

ALTER TABLE time_clock_correction_requests
  ADD COLUMN IF NOT EXISTS schedule_shift_id TEXT;

CREATE INDEX IF NOT EXISTS idx_time_clock_corrections_schedule_shift
  ON time_clock_correction_requests(schedule_shift_id, status);

COMMIT;
