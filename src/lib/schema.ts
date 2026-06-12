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

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payrolls (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  pay_period TEXT NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL
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

ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS chat_id TEXT;
CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat_id ON telegram_messages(chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  sync_key TEXT PRIMARY KEY,
  sync_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shift_start TEXT NOT NULL,
  shift_end TEXT NOT NULL,
  working_days_per_month INTEGER NOT NULL,
  hourly_cost NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hourly_product_sales (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  hour_label TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  units NUMERIC(12,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS product_costs (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Altres',
  unit_cost NUMERIC(8,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_code)
);

-- Historical costs per product. Each change of unit_cost closes the current
-- row (valid_until = effective_date) and opens a new one. Lookups for food
-- cost use the cost whose validity window contains the sale's business_date.
CREATE TABLE IF NOT EXISTS product_cost_history (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_cost NUMERIC(8,4) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_history_lookup ON product_cost_history(product_code, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_cost_history_current ON product_cost_history(product_code) WHERE valid_until IS NULL;

CREATE TABLE IF NOT EXISTS employee_shifts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  shift_start TEXT NOT NULL,
  shift_end TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_sales_reports_business_date ON sales_reports(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_hourly_sales_business_date ON hourly_sales(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_product_sales_business_date ON product_sales(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_hourly_product_sales_business_date ON hourly_product_sales(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_pay_period ON payrolls(pay_period DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_business_date ON employee_shifts(business_date DESC);

CREATE TABLE IF NOT EXISTS employee_schedule_shifts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  shift_start TEXT NOT NULL,
  shift_end TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_schedule_shifts_business_date
  ON employee_schedule_shifts(business_date DESC);

CREATE TABLE IF NOT EXISTS employee_schedule_links (
  employee_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
