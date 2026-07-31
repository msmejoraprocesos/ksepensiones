-- ═══════════════════════════════════════════════════════════════════
-- KSE Pensiones — Motor de Elegibilidad Financiera
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Catálogo maestro de variables de elegibilidad ────────────────
-- Define qué tipos de variables existen (semanas, edad, etc.)
CREATE TABLE IF NOT EXISTS variables_elegibilidad (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave       TEXT NOT NULL UNIQUE,           -- ej: 'semanas_min', 'edad_max'
  nombre      TEXT NOT NULL,                  -- ej: 'Semanas mínimas requeridas'
  descripcion TEXT,
  tipo        TEXT NOT NULL DEFAULT 'numero'  -- 'numero' | 'cualitativo'
              CHECK (tipo IN ('numero', 'cualitativo')),
  unidad      TEXT,                           -- ej: 'semanas', 'años', '%', 'MXN'
  opciones    JSONB,                          -- para tipo cualitativo: [{valor, etiqueta}]
  activo      BOOLEAN NOT NULL DEFAULT true,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar variables predefinidas
INSERT INTO variables_elegibilidad (clave, nombre, descripcion, tipo, unidad, orden) VALUES
  ('semanas_min', 'Semanas mínimas cotizadas', 'Número mínimo de semanas que debe tener el cliente', 'numero', 'semanas', 1),
  ('semanas_max', 'Semanas máximas aceptadas', 'Número máximo de semanas (opcional)', 'numero', 'semanas', 2),
  ('edad_min', 'Edad mínima del cliente', 'Edad mínima para aplicar', 'numero', 'años', 3),
  ('edad_max', 'Edad máxima del cliente', 'Edad máxima para aplicar al momento del trámite', 'numero', 'años', 4),
  ('monto_min', 'Monto mínimo a financiar', 'Costo mínimo de Mod.40 que la financiera acepta', 'numero', 'MXN', 5),
  ('monto_max', 'Monto máximo a financiar', 'Costo máximo de Mod.40 que la financiera financia', 'numero', 'MXN', 6),
  ('mejora_pension_min_pct', 'Mejora mínima en pensión (%)', 'La pensión debe mejorar al menos este % para ser viable', 'numero', '%', 7),
  ('relacion_beneficio_costo', 'Relación mínima beneficio/costo', 'Ej: 1.5 significa que el beneficio debe ser 1.5x el costo del crédito', 'numero', 'x', 8),
  ('plazo_max_meses', 'Plazo máximo del crédito', 'Número máximo de meses del financiamiento', 'numero', 'meses', 9),
  ('tasa_interes_anual', 'Tasa de interés anual', 'Tasa de interés que cobra esta financiera', 'numero', '%', 10)
ON CONFLICT (clave) DO NOTHING;

-- Variable cualitativa: situación laboral
INSERT INTO variables_elegibilidad (clave, nombre, descripcion, tipo, opciones, orden) VALUES
  ('situacion_laboral', 'Situación laboral requerida', 'Qué situaciones laborales acepta esta financiera', 'cualitativo',
   '[{"valor": "activo", "etiqueta": "Empleado activo"},{"valor": "independiente", "etiqueta": "Independiente/Freelance"},{"valor": "pensionado", "etiqueta": "Ya pensionado"},{"valor": "desempleado", "etiqueta": "Desempleado"}]'::jsonb, 11)
ON CONFLICT (clave) DO NOTHING;

-- ── 2. Criterios de elegibilidad por financiera ──────────────────────
CREATE TABLE IF NOT EXISTS criterios_financiera (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id    UUID NOT NULL REFERENCES instituciones_financieras(id) ON DELETE CASCADE,
  variable_clave    TEXT NOT NULL REFERENCES variables_elegibilidad(clave) ON DELETE CASCADE,
  valor_min         NUMERIC,                  -- para variables numéricas
  valor_max         NUMERIC,                  -- para variables numéricas
  valores_aceptados JSONB,                    -- para variables cualitativas: ['activo', 'independiente']
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institucion_id, variable_clave)
);

ALTER TABLE criterios_financiera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asesor_own_criterios" ON criterios_financiera
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM instituciones_financieras
      WHERE id = criterios_financiera.institucion_id
      AND asesor_id = auth.uid()
    )
  );

-- ── 3. Catálogo maestro de documentos ───────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_catalogo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  obligatorio BOOLEAN NOT NULL DEFAULT true,
  activo      BOOLEAN NOT NULL DEFAULT true,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documentos_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asesor_own_docs_catalogo" ON documentos_catalogo
  FOR ALL USING (asesor_id = auth.uid());

-- ── 4. Documentos requeridos por financiera ──────────────────────────
CREATE TABLE IF NOT EXISTS documentos_financiera (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id UUID NOT NULL REFERENCES instituciones_financieras(id) ON DELETE CASCADE,
  documento_id   UUID NOT NULL REFERENCES documentos_catalogo(id) ON DELETE CASCADE,
  obligatorio    BOOLEAN NOT NULL DEFAULT true,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institucion_id, documento_id)
);

ALTER TABLE documentos_financiera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asesor_own_docs_financiera" ON documentos_financiera
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM instituciones_financieras
      WHERE id = documentos_financiera.institucion_id
      AND asesor_id = auth.uid()
    )
  );

-- ── 5. Documentos adjuntos por cliente ──────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_cliente (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  asesor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  documento_id    UUID REFERENCES documentos_catalogo(id) ON DELETE SET NULL,
  nombre_archivo  TEXT NOT NULL,
  tipo_archivo    TEXT,                       -- 'pdf', 'jpg', etc.
  url_archivo     TEXT,                       -- URL en Supabase Storage
  estatus         TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estatus IN ('pendiente', 'recibido', 'verificado', 'rechazado')),
  notas           TEXT,
  institucion_id  UUID REFERENCES instituciones_financieras(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documentos_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asesor_own_docs_cliente" ON documentos_cliente
  FOR ALL USING (asesor_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_docs_cliente_cliente ON documentos_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_docs_cliente_asesor ON documentos_cliente(asesor_id);

-- ── 6. Evaluaciones de elegibilidad ─────────────────────────────────
-- Guarda el resultado de evaluar a un cliente contra una financiera
CREATE TABLE IF NOT EXISTS evaluaciones_elegibilidad (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  diagnostico_id  UUID REFERENCES diagnosticos(id) ON DELETE SET NULL,
  institucion_id  UUID NOT NULL REFERENCES instituciones_financieras(id) ON DELETE CASCADE,
  asesor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resultado       TEXT NOT NULL CHECK (resultado IN ('viable', 'condicional', 'no_viable')),
  criterios_eval  JSONB NOT NULL DEFAULT '[]', -- [{clave, nombre, cumple, valor_cliente, requerido, motivo}]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE evaluaciones_elegibilidad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asesor_own_evaluaciones" ON evaluaciones_elegibilidad
  FOR ALL USING (asesor_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_eval_cliente ON evaluaciones_elegibilidad(cliente_id);

-- ── 7. Datos adicionales del cliente para elegibilidad ───────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS situacion_laboral TEXT
    CHECK (situacion_laboral IN ('activo', 'independiente', 'pensionado', 'desempleado')),
  ADD COLUMN IF NOT EXISTS ingresos_mensuales NUMERIC,
  ADD COLUMN IF NOT EXISTS datos_extra JSONB DEFAULT '{}'; -- para variables cualitativas adicionales

-- ── 8. Agregar documentos predefinidos iniciales ─────────────────────
-- (Se agregan por asesor en el sistema, esto es solo referencia)

-- Permisos
GRANT ALL ON variables_elegibilidad TO service_role, authenticated, anon;
GRANT ALL ON criterios_financiera TO service_role, authenticated, anon;
GRANT ALL ON documentos_catalogo TO service_role, authenticated, anon;
GRANT ALL ON documentos_financiera TO service_role, authenticated, anon;
GRANT ALL ON documentos_cliente TO service_role, authenticated, anon;
GRANT ALL ON evaluaciones_elegibilidad TO service_role, authenticated, anon;

NOTIFY pgrst, 'reload schema';
