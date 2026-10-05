CREATE TABLE IF NOT EXISTS request_usage (
  request_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  operation text NOT NULL CHECK (operation IN ('chat:complete', 'search:read')),
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_usage_tenant_created_idx
  ON request_usage (tenant_id, created_at DESC);
