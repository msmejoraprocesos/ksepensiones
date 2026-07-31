-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Catálogos de Actividad y Automatización
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Columnas nuevas en actividades ───────────────────────────────
ALTER TABLE actividades
  ADD COLUMN IF NOT EXISTS tipo_contacto TEXT,
  ADD COLUMN IF NOT EXISTS resultado      TEXT,
  ADD COLUMN IF NOT EXISTS proximo_paso   TEXT,
  ADD COLUMN IF NOT EXISTS proximo_fecha  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS materiales_ids JSONB DEFAULT '[]';

-- ── 2. Catálogos configurables por asesor ───────────────────────────
CREATE TABLE IF NOT EXISTS catalogos_actividad (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria   TEXT NOT NULL CHECK (categoria IN ('tipo_contacto', 'resultado', 'proximo_paso')),
  valor       TEXT NOT NULL,
  etiqueta    TEXT NOT NULL,
  icono       TEXT,
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT true,
  -- Si el próximo paso genera evento automático
  genera_evento     BOOLEAN NOT NULL DEFAULT false,
  -- Si el próximo paso abre materiales de apoyo
  abre_materiales   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asesor_id, categoria, valor)
);

ALTER TABLE catalogos_actividad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asesor_own_catalogos" ON catalogos_actividad
  FOR ALL USING (asesor_id = auth.uid());

GRANT ALL ON catalogos_actividad TO service_role, authenticated, anon;

-- ── 3. Insertar catálogos predefinidos (función por asesor) ──────────
-- Se llama al primer login del asesor o manualmente
-- Los catálogos son un punto de partida, el asesor puede modificarlos

CREATE OR REPLACE FUNCTION inicializar_catalogos_asesor(p_asesor_id UUID)
RETURNS void AS $$
BEGIN
  -- Tipo de contacto
  INSERT INTO catalogos_actividad (asesor_id, categoria, valor, etiqueta, icono, orden) VALUES
    (p_asesor_id, 'tipo_contacto', 'llamada',          'Llamada telefónica',    '📞', 1),
    (p_asesor_id, 'tipo_contacto', 'whatsapp',         'WhatsApp',              '💬', 2),
    (p_asesor_id, 'tipo_contacto', 'reunion_presencial','Reunión presencial',    '🤝', 3),
    (p_asesor_id, 'tipo_contacto', 'videollamada',     'Videollamada',          '📹', 4),
    (p_asesor_id, 'tipo_contacto', 'email',            'Correo electrónico',    '📧', 5),
    (p_asesor_id, 'tipo_contacto', 'visita',           'Visita domiciliaria',   '🏠', 6)
  ON CONFLICT (asesor_id, categoria, valor) DO NOTHING;

  -- Resultado del contacto
  INSERT INTO catalogos_actividad (asesor_id, categoria, valor, etiqueta, icono, orden) VALUES
    (p_asesor_id, 'resultado', 'interesado_info',    'Interesado — pide más información', '🟡', 1),
    (p_asesor_id, 'resultado', 'interesado_cita',    'Interesado — agenda cita',          '🟢', 2),
    (p_asesor_id, 'resultado', 'en_duda',            'En duda — requiere seguimiento',    '🟠', 3),
    (p_asesor_id, 'resultado', 'no_contesta',        'No contesta',                       '⚫', 4),
    (p_asesor_id, 'resultado', 'pide_tiempo',        'Pide tiempo para decidir',          '🔵', 5),
    (p_asesor_id, 'resultado', 'no_interesado',      'No interesado',                     '🔴', 6),
    (p_asesor_id, 'resultado', 'cita_confirmada',    'Cita confirmada',                   '✅', 7),
    (p_asesor_id, 'resultado', 'docs_recibidos',     'Documentos recibidos',              '📋', 8),
    (p_asesor_id, 'resultado', 'diagnostico_presentado', 'Diagnóstico presentado',        '📊', 9),
    (p_asesor_id, 'resultado', 'propuesta_enviada',  'Propuesta enviada',                 '📤', 10),
    (p_asesor_id, 'resultado', 'cierre_exitoso',     'Cierre exitoso',                    '🏆', 11)
  ON CONFLICT (asesor_id, categoria, valor) DO NOTHING;

  -- Próximo paso
  INSERT INTO catalogos_actividad (asesor_id, categoria, valor, etiqueta, icono, orden, genera_evento, abre_materiales) VALUES
    (p_asesor_id, 'proximo_paso', 'llamar_manana',      'Llamar mañana',                  '📞', 1,  true,  false),
    (p_asesor_id, 'proximo_paso', 'llamar_semana',      'Llamar en 1 semana',             '📞', 2,  true,  false),
    (p_asesor_id, 'proximo_paso', 'llamar_15dias',      'Llamar en 15 días',              '📞', 3,  true,  false),
    (p_asesor_id, 'proximo_paso', 'llamar_mes',         'Llamar en 1 mes',                '📞', 4,  true,  false),
    (p_asesor_id, 'proximo_paso', 'agendar_cita',       'Agendar cita presencial',        '🤝', 5,  true,  false),
    (p_asesor_id, 'proximo_paso', 'enviar_info',        'Enviar información de referencia','📎', 6,  false, true),
    (p_asesor_id, 'proximo_paso', 'enviar_propuesta',   'Elaborar y enviar propuesta',    '📤', 7,  true,  false),
    (p_asesor_id, 'proximo_paso', 'solicitar_docs',     'Solicitar documentos',           '📋', 8,  true,  false),
    (p_asesor_id, 'proximo_paso', 'esperar_respuesta',  'Esperar respuesta del cliente',  '⏳', 9,  true,  false),
    (p_asesor_id, 'proximo_paso', 'ninguno',            'Sin próximo paso',               '✓',  10, false, false)
  ON CONFLICT (asesor_id, categoria, valor) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Inicializar para el asesor actual (reemplaza con tu UUID si quieres)
-- SELECT inicializar_catalogos_asesor('05cadf90-7926-4892-bf9f-b73c9eedf63d');

NOTIFY pgrst, 'reload schema';
