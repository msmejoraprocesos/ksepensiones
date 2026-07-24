-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Business Dashboard & AI Cost Tracking
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tracking de uso de IA por llamada ────────────────────────────
CREATE TABLE IF NOT EXISTS uso_ia (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizacion_id   UUID REFERENCES organizaciones(id) ON DELETE SET NULL,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  diagnostico_id    UUID REFERENCES diagnosticos(id) ON DELETE SET NULL,

  -- Tipo de llamada
  tipo              TEXT NOT NULL
                    CHECK (tipo IN ('extraccion_constancia', 'analisis_pensional')),

  -- Tokens y costo
  tokens_entrada    INTEGER NOT NULL DEFAULT 0,
  tokens_salida     INTEGER NOT NULL DEFAULT 0,
  tokens_total      INTEGER GENERATED ALWAYS AS (tokens_entrada + tokens_salida) STORED,
  modelo            TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',

  -- Costo estimado en USD (precios claude-sonnet-4-6: $3/MTok entrada, $15/MTok salida)
  costo_entrada_usd NUMERIC(10,6) GENERATED ALWAYS AS
                    (tokens_entrada * 3.0 / 1000000) STORED,
  costo_salida_usd  NUMERIC(10,6) GENERATED ALWAYS AS
                    (tokens_salida * 15.0 / 1000000) STORED,
  costo_total_usd   NUMERIC(10,6) GENERATED ALWAYS AS
                    (tokens_entrada * 3.0 / 1000000 + tokens_salida * 15.0 / 1000000) STORED,

  -- Resultado
  exitoso           BOOLEAN NOT NULL DEFAULT true,
  error_msg         TEXT,
  duracion_ms       INTEGER,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Índices ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_uso_ia_asesor     ON uso_ia(asesor_id);
CREATE INDEX IF NOT EXISTS idx_uso_ia_org        ON uso_ia(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_uso_ia_tipo       ON uso_ia(tipo);
CREATE INDEX IF NOT EXISTS idx_uso_ia_created    ON uso_ia(created_at);

-- ── 3. RLS — solo super_admin ve todo ──────────────────────────────
ALTER TABLE uso_ia ENABLE ROW LEVEL SECURITY;

-- Super admin ve todo
CREATE POLICY "super_admin_all_uso_ia" ON uso_ia
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfiles_usuario
      WHERE id = auth.uid() AND rol = 'super_admin'
    )
  );

-- El asesor puede insertar su propio uso (necesario desde el API route)
-- El API route usa service_role key así que no necesita esta policy
-- pero la dejamos por si acaso
CREATE POLICY "asesor_insert_own" ON uso_ia
  FOR INSERT WITH CHECK (asesor_id = auth.uid());
