export const schemaSql = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence NUMERIC(6,4) NOT NULL DEFAULT 0,
  extractor_version TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_reports (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  total_sales NUMERIC(12,2) NOT NULL,
  order_count INTEGER NOT NULL,
  average_ticket NUMERIC(12,2) NOT NULL,
  payment_mix JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS hourly_sales (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  hour_label TEXT NOT NULL,
  sales NUMERIC(12,2) NOT NULL,
  order_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS product_sales (
  id TEXT PRIMARY KEY,
  sales_report_id TEXT REFERENCES sales_reports(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  units NUMERIC(12,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,
  total_amount NUMERIC(12,2) NOT NULL,
  tax_amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payrolls (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  pay_period TEXT NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  booked_at TIMESTAMPTZ NOT NULL,
  concept TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  direction TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_users (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_state (
  sync_key TEXT PRIMARY KEY,
  sync_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
