-- Dashboard-only audit records. The POS Z and its synchronized snapshot stay unchanged.
CREATE TABLE IF NOT EXISTS pos.cash_closing_adjustments (
  id UUID PRIMARY KEY,
  closing_id INTEGER NOT NULL REFERENCES pos.cash_closings(id),
  batch_key TEXT NOT NULL CHECK (length(trim(batch_key)) > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  original_snapshot JSONB NOT NULL CHECK (jsonb_typeof(original_snapshot) = 'object'),
  corrected_snapshot JSONB NOT NULL CHECK (jsonb_typeof(corrected_snapshot) = 'object'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  UNIQUE (closing_id, batch_key)
);
CREATE INDEX IF NOT EXISTS cash_closing_adjustments_latest
  ON pos.cash_closing_adjustments(closing_id, recorded_at DESC, id DESC);

CREATE OR REPLACE FUNCTION pos.reject_closing_adjustment_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Closing adjustments are append-only; record a new adjustment instead';
END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='pos.cash_closing_adjustments'::regclass
    AND tgname='cash_closing_adjustments_append_only') THEN
    CREATE TRIGGER cash_closing_adjustments_append_only
      BEFORE UPDATE OR DELETE OR TRUNCATE ON pos.cash_closing_adjustments
      FOR EACH STATEMENT EXECUTE FUNCTION pos.reject_closing_adjustment_mutation();
  END IF;
END $$;
