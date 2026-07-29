CREATE TABLE IF NOT EXISTS employee_schedule_week_settings (
  employee_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  rest_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_employee_schedule_week_settings_rest_date
  ON employee_schedule_week_settings(rest_date);
