-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Rate Limiting de llamadas a IA
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limits_ia (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  llamadas    INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asesor_id, endpoint, fecha)
);

-- Solo el service_role puede leer/escribir (las API routes usan service role)
ALTER TABLE rate_limits_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_rate_limits" ON rate_limits_ia
  FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_rate_limits_asesor_fecha
  ON rate_limits_ia(asesor_id, endpoint, fecha);

-- Limpiar registros viejos automáticamente (opcional, >7 días)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('0 3 * * *', $$DELETE FROM rate_limits_ia WHERE fecha < CURRENT_DATE - 7$$);
