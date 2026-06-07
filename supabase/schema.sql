-- =============================================
-- KSE PENSIONES — Database Setup
-- Ejecutar en Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS perfiles_usuario (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nombre TEXT,
  logo_url TEXT,
  uma_diaria NUMERIC DEFAULT 113.45,
  salario_minimo NUMERIC DEFAULT 263.12,
  pmg_mensual NUMERIC DEFAULT 5953,
  rendimiento_afore_default NUMERIC DEFAULT 6,
  inflacion_uma NUMERIC DEFAULT 4.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asesor_id UUID REFERENCES auth.users(id),
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  ultimo_contacto TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnosticos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asesor_id UUID REFERENCES auth.users(id),
  cliente_id UUID REFERENCES clientes(id),
  ley TEXT,
  semanas INTEGER,
  salario_diario NUMERIC,
  edad_retiro INTEGER,
  ingreso_deseado NUMERIC,
  afore_saldo NUMERIC DEFAULT 0,
  ppr_mensual NUMERIC DEFAULT 0,
  rendimiento NUMERIC DEFAULT 6,
  resultado_e1 NUMERIC,
  resultado_e2 NUMERIC,
  resultado_e3 NUMERIC,
  resultado_e4 NUMERIC,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actividades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asesor_id UUID REFERENCES auth.users(id),
  cliente_id UUID REFERENCES clientes(id),
  tipo TEXT,
  titulo TEXT NOT NULL,
  fecha_programada TIMESTAMPTZ,
  estatus TEXT DEFAULT 'pendiente',
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE perfiles_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth" ON perfiles_usuario;
DROP POLICY IF EXISTS "auth" ON clientes;
DROP POLICY IF EXISTS "auth" ON diagnosticos;
DROP POLICY IF EXISTS "auth" ON actividades;

CREATE POLICY "auth" ON perfiles_usuario
  FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "auth" ON clientes
  FOR ALL TO authenticated
  USING (asesor_id = auth.uid()) WITH CHECK (asesor_id = auth.uid());

CREATE POLICY "auth" ON diagnosticos
  FOR ALL TO authenticated
  USING (asesor_id = auth.uid()) WITH CHECK (asesor_id = auth.uid());

CREATE POLICY "auth" ON actividades
  FOR ALL TO authenticated
  USING (asesor_id = auth.uid()) WITH CHECK (asesor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfiles_usuario (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
