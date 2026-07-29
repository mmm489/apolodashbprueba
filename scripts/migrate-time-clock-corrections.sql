BEGIN;

CREATE TABLE IF NOT EXISTS time_clock_correction_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  schedule_shift_id TEXT,
  business_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('clock_in', 'clock_out', 'full_session')),
  requested_clock_in_at TIMESTAMPTZ,
  requested_clock_out_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'failed')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  apply_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (request_type = 'clock_in' AND requested_clock_in_at IS NOT NULL)
    OR (request_type = 'clock_out' AND requested_clock_out_at IS NOT NULL)
    OR (
      request_type = 'full_session'
      AND requested_clock_in_at IS NOT NULL
      AND requested_clock_out_at IS NOT NULL
      AND requested_clock_out_at > requested_clock_in_at
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_time_clock_corrections_status
  ON time_clock_correction_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_clock_corrections_employee_date
  ON time_clock_correction_requests(employee_id, business_date DESC);

ALTER TABLE time_clock_correction_requests
  ADD COLUMN IF NOT EXISTS schedule_shift_id TEXT;

CREATE INDEX IF NOT EXISTS idx_time_clock_corrections_schedule_shift
  ON time_clock_correction_requests(schedule_shift_id, status);

COMMIT;
