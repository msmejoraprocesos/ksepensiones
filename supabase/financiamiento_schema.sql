-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Módulo de Financiamiento
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Instituciones financieras configurables por asesor ───────────
CREATE TABLE IF NOT EXISTS instituciones_financieras (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  tasa_anual        NUMERIC(6,4) NOT NULL DEFAULT 32.2,
  plazo_max_meses   INTEGER NOT NULL DEFAULT 60,
  tipo              TEXT NOT NULL DEFAULT 'banco'
                    CHECK (tipo IN ('banco', 'directo')),
  activo            BOOLEAN NOT NULL DEFAULT true,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Financiamientos autorizados desde la calculadora ─────────────
CREATE TABLE IF NOT EXISTS financiamientos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id            UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  diagnostico_id        UUID REFERENCES diagnosticos(id) ON DELETE SET NULL,
  institucion_id        UUID REFERENCES instituciones_financieras(id) ON DELETE SET NULL,

  -- Condiciones del crédito
  monto_total           NUMERIC(14,2) NOT NULL,
  plazo_meses           INTEGER NOT NULL,
  cuota_mensual         NUMERIC(12,2) NOT NULL,
  tasa_anual            NUMERIC(6,4) NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'banco'
                        CHECK (tipo IN ('banco', 'directo')),

  -- Comisión del asesor
  comision_pct          NUMERIC(5,2) DEFAULT 0,
  comision_monto        NUMERIC(12,2) DEFAULT 0,
  comision_cobrada      BOOLEAN DEFAULT false,

  -- Estado del financiamiento
  estatus               TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estatus IN ('pendiente', 'activo', 'liquidado', 'cancelado')),
  fecha_inicio          DATE,
  fecha_termino_estimada DATE,

  -- Snapshot del diagnóstico para referencia futura
  pension_sin_mod40     NUMERIC(12,2),
  pension_con_mod40     NUMERIC(12,2),
  umas_registradas      INTEGER,
  meses_mod40           INTEGER,

  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Pagos individuales por financiamiento ────────────────────────
CREATE TABLE IF NOT EXISTS pagos_financiamiento (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financiamiento_id UUID NOT NULL REFERENCES financiamientos(id) ON DELETE CASCADE,
  numero_pago       INTEGER NOT NULL,
  fecha_programada  DATE NOT NULL,
  fecha_real        DATE,
  monto             NUMERIC(12,2) NOT NULL,
  estatus           TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estatus IN ('pendiente', 'pagado', 'vencido')),
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. RLS — cada asesor solo ve los suyos ──────────────────────────
ALTER TABLE instituciones_financieras ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_financiamiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asesor_own_instituciones" ON instituciones_financieras
  FOR ALL USING (asesor_id = auth.uid());

CREATE POLICY "asesor_own_financiamientos" ON financiamientos
  FOR ALL USING (asesor_id = auth.uid());

CREATE POLICY "asesor_own_pagos" ON pagos_financiamiento
  FOR ALL USING (
    financiamiento_id IN (
      SELECT id FROM financiamientos WHERE asesor_id = auth.uid()
    )
  );

-- ── 5. Índices ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_financiamientos_asesor   ON financiamientos(asesor_id);
CREATE INDEX IF NOT EXISTS idx_financiamientos_cliente  ON financiamientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_financiamientos_estatus  ON financiamientos(estatus);
CREATE INDEX IF NOT EXISTS idx_pagos_financiamiento     ON pagos_financiamiento(financiamiento_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estatus            ON pagos_financiamiento(estatus);
