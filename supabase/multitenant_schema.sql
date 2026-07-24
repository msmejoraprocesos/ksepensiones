-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Multi-tenant Schema
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Organizaciones ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT NOT NULL,
  plan              TEXT NOT NULL DEFAULT 'individual'
                    CHECK (plan IN ('individual', 'equipo', 'enterprise')),
  asientos          INTEGER NOT NULL DEFAULT 1,
  activo            BOOLEAN NOT NULL DEFAULT true,
  fecha_alta        DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Agregar organizacion_id y rol a perfiles_usuario ─────────────
ALTER TABLE perfiles_usuario
  ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'asesor'
    CHECK (rol IN ('super_admin', 'org_admin', 'asesor'));

-- El super_admin no pertenece a ninguna organización (organizacion_id = NULL)
-- Actualizar el perfil existente del super_admin
UPDATE perfiles_usuario
SET rol = 'super_admin'
WHERE is_admin = true;

-- ── 3. Índices ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_perfiles_organizacion ON perfiles_usuario(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles_usuario(rol);
CREATE INDEX IF NOT EXISTS idx_organizaciones_activo ON organizaciones(activo);

-- ── 4. RLS organizaciones — solo super_admin puede gestionar ─────────
ALTER TABLE organizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_organizaciones" ON organizaciones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfiles_usuario
      WHERE id = auth.uid() AND rol = 'super_admin'
    )
  );

-- Los org_admin pueden ver su propia organización
CREATE POLICY "org_admin_view_own" ON organizaciones
  FOR SELECT USING (
    id IN (
      SELECT organizacion_id FROM perfiles_usuario WHERE id = auth.uid()
    )
  );
