-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Sistema de Notificaciones
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notificaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN (
    'cliente_sin_contacto',
    'financiamiento_por_vencer',
    'documento_pendiente',
    'solicitud_canalizacion',
    'asientos_limite',
    'costo_ia_elevado',
    'suscripcion_por_vencer',
    'actividad_pendiente',
    'general'
  )),
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT false,
  url_destino TEXT,             -- ruta a donde va al hacer clic
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_own_notificaciones" ON notificaciones
  FOR ALL USING (usuario_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones(usuario_id, leida, created_at DESC);

GRANT ALL ON notificaciones TO service_role, authenticated, anon;

NOTIFY pgrst, 'reload schema';
