-- ── Stripe: agregar campos de suscripción a organizaciones ──────────────
-- Ejecutar en Supabase SQL Editor

ALTER TABLE organizaciones
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_price_id        TEXT,
  ADD COLUMN IF NOT EXISTS vigencia_hasta          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dias_gracia             INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS cancelar_al_periodo     BOOLEAN NOT NULL DEFAULT false;

-- Índices para lookups rápidos desde webhooks
CREATE INDEX IF NOT EXISTS idx_org_stripe_customer     ON organizaciones(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_org_stripe_subscription ON organizaciones(stripe_subscription_id);

-- Vista útil: estado de suscripción activa
CREATE OR REPLACE VIEW vista_org_suscripcion AS
SELECT
  id,
  nombre,
  plan,
  asientos,
  stripe_customer_id,
  stripe_subscription_id,
  vigencia_hasta,
  dias_gracia,
  cancelar_al_periodo,
  CASE
    WHEN vigencia_hasta IS NULL THEN 'sin_suscripcion'
    WHEN vigencia_hasta + (dias_gracia || ' days')::interval > NOW() THEN 'activa'
    ELSE 'vencida'
  END AS estado_suscripcion,
  activo
FROM organizaciones;
