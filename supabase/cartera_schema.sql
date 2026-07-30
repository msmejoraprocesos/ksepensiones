-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Sprint: Gestión de Cartera y Usuarios
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. NSS en clientes ───────────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nss TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nac DATE;

CREATE INDEX IF NOT EXISTS idx_clientes_nss ON clientes(nss) WHERE nss IS NOT NULL;

-- ── 2. Inactivar asesores (no borrar) ───────────────────────────────
ALTER TABLE perfiles_usuario
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

UPDATE perfiles_usuario SET activo = true WHERE activo IS NULL;

-- ── 3. Solicitudes de canalización ──────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes_canalizacion (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  asesor_origen_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asesor_destino_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organizacion_id   UUID REFERENCES organizaciones(id) ON DELETE CASCADE,
  motivo            TEXT,
  estatus           TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estatus IN ('pendiente', 'aprobada', 'rechazada')),
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE solicitudes_canalizacion ENABLE ROW LEVEL SECURITY;

-- Asesor puede crear solicitudes de sus propios clientes
CREATE POLICY "asesor_create_canalizacion" ON solicitudes_canalizacion
  FOR INSERT WITH CHECK (asesor_origen_id = auth.uid());

-- Asesor ve sus propias solicitudes
CREATE POLICY "asesor_view_canalizacion" ON solicitudes_canalizacion
  FOR SELECT USING (
    asesor_origen_id = auth.uid()
    OR asesor_destino_id = auth.uid()
    OR organizacion_id IN (
      SELECT organizacion_id FROM perfiles_usuario WHERE id = auth.uid()
    )
  );

-- org_admin y super_admin pueden gestionar todas las solicitudes de su org
CREATE POLICY "admin_manage_canalizacion" ON solicitudes_canalizacion
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles_usuario WHERE id = auth.uid() AND rol = 'super_admin')
    OR (
      organizacion_id IN (
        SELECT organizacion_id FROM perfiles_usuario
        WHERE id = auth.uid() AND rol = 'org_admin'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_canalizacion_cliente ON solicitudes_canalizacion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_canalizacion_org ON solicitudes_canalizacion(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_canalizacion_estatus ON solicitudes_canalizacion(estatus);
