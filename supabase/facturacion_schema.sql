-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Facturación y Org Admin
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Pagos / suscripciones por organización ───────────────────────
CREATE TABLE IF NOT EXISTS pagos_suscripcion (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id   UUID NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,

  -- Periodo facturado
  periodo_inicio    DATE NOT NULL,
  periodo_fin       DATE NOT NULL,

  -- Monto
  monto             NUMERIC(10,2) NOT NULL,
  moneda            TEXT NOT NULL DEFAULT 'MXN',
  concepto          TEXT NOT NULL DEFAULT 'Suscripción mensual',

  -- Estado
  estatus           TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estatus IN ('pendiente', 'pagado', 'vencido', 'cancelado')),
  fecha_pago        DATE,
  metodo_pago       TEXT,

  -- Stripe (para integración futura)
  stripe_invoice_id TEXT,
  stripe_payment_id TEXT,

  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS pagos_suscripcion ─────────────────────────────────────────
ALTER TABLE pagos_suscripcion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_pagos_sus" ON pagos_suscripcion
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles_usuario WHERE id = auth.uid() AND rol = 'super_admin')
  );

CREATE POLICY "org_admin_view_own_pagos" ON pagos_suscripcion
  FOR SELECT USING (
    organizacion_id IN (
      SELECT organizacion_id FROM perfiles_usuario WHERE id = auth.uid()
    )
  );

-- ── 3. Índices ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_sus_org    ON pagos_suscripcion(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_pagos_sus_est    ON pagos_suscripcion(estatus);

-- ── 4. Actualizar rol org_admin ──────────────────────────────────────
-- El rol 'org_admin' ya fue agregado en multitenant_schema.sql
-- Solo verificar que el CHECK constraint lo incluye:
-- CHECK (rol IN ('super_admin', 'org_admin', 'asesor'))
-- Si no existe, ejecutar:
-- ALTER TABLE perfiles_usuario DROP CONSTRAINT IF EXISTS perfiles_usuario_rol_check;
-- ALTER TABLE perfiles_usuario ADD CONSTRAINT perfiles_usuario_rol_check
--   CHECK (rol IN ('super_admin', 'org_admin', 'asesor'));
