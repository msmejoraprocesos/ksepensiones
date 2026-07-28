-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — RLS para org_admin
-- Permite al org_admin ver y reasignar clientes de toda su organización
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Helper: devuelve los IDs de asesores de la misma org que el usuario actual
CREATE OR REPLACE FUNCTION get_org_asesor_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM perfiles_usuario
  WHERE organizacion_id = (
    SELECT organizacion_id FROM perfiles_usuario
    WHERE id = auth.uid()
    AND organizacion_id IS NOT NULL
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── Clientes — org_admin ve todos los de su org ──────────────────────
DROP POLICY IF EXISTS "asesor_own_clientes" ON clientes;

CREATE POLICY "asesor_own_clientes" ON clientes
  FOR ALL USING (
    asesor_id = auth.uid()
    OR asesor_id IN (SELECT get_org_asesor_ids())
  );

-- ── Diagnósticos — org_admin ve todos los de su org ─────────────────
DROP POLICY IF EXISTS "asesor_own_diagnosticos" ON diagnosticos;

CREATE POLICY "asesor_own_diagnosticos" ON diagnosticos
  FOR ALL USING (
    asesor_id = auth.uid()
    OR asesor_id IN (SELECT get_org_asesor_ids())
  );

-- ── Financiamientos — org_admin ve todos los de su org ──────────────
DROP POLICY IF EXISTS "asesor_own_financiamientos" ON financiamientos;

CREATE POLICY "asesor_own_financiamientos" ON financiamientos
  FOR ALL USING (
    asesor_id = auth.uid()
    OR asesor_id IN (SELECT get_org_asesor_ids())
  );
