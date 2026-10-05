ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS monthly_request_budget integer
  CHECK (monthly_request_budget IS NULL OR monthly_request_budget > 0);

CREATE TABLE IF NOT EXISTS monthly_request_reservations (
  request_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monthly_request_reservations_tenant_month_idx
  ON monthly_request_reservations (tenant_id, month_start);
