# KSE Pensiones — Migraciones SQL

Ejecuta los archivos en este orden exacto en Supabase SQL Editor.
Marca cada uno con ✅ cuando lo ejecutes.

## Estado actual

| # | Archivo | Descripción | Estado |
|---|---------|-------------|--------|
| 01 | `schema.sql` | Tablas base: perfiles_usuario, clientes, diagnosticos, actividades | ✅ Ejecutado |
| 02 | `multitenant_schema.sql` | Tabla organizaciones, columnas organizacion_id y rol en perfiles_usuario | ✅ Ejecutado |
| 03 | `uso_ia_schema.sql` | Tabla uso_ia para tracking de tokens y costo por llamada a Claude | ✅ Ejecutado |
| 04 | `orgadmin_rls.sql` | RLS para que org_admin vea clientes de toda su organización | ✅ Ejecutado |
| 05 | `financiamiento_schema.sql` | Tablas instituciones_financieras, financiamientos, pagos_financiamiento | ✅ Ejecutado |
| 06 | `facturacion_schema.sql` | Tabla pagos_suscripcion | ✅ Ejecutado |
| 07 | `cartera_schema.sql` | NSS en clientes, activo en perfiles_usuario, tabla solicitudes_canalizacion | ✅ Ejecutado |
| 08 | `rate_limits_schema.sql` | Tabla rate_limits_ia para rate limiting de llamadas a IA (30/día/asesor) | ⏳ PENDIENTE |

## Comandos manuales ejecutados

Los siguientes comandos se ejecutaron directamente en SQL Editor (no en archivos):

```sql
-- Columnas adicionales en perfiles_usuario (post migración 02)
ALTER TABLE perfiles_usuario
  ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizaciones(id),
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'asesor'
    CHECK (rol IN ('super_admin', 'org_admin', 'asesor'));
UPDATE perfiles_usuario SET rol = 'super_admin' WHERE is_admin = true;
NOTIFY pgrst, 'reload schema';
GRANT ALL ON perfiles_usuario TO service_role;
GRANT ALL ON perfiles_usuario TO authenticated;
GRANT ALL ON perfiles_usuario TO anon;

-- RLS permisiva temporal (post migración 02)
CREATE POLICY "service_role_all_perfiles" ON perfiles_usuario
  FOR ALL USING (true) WITH CHECK (true);
```

## Variables de entorno en Vercel

| Variable | Descripción | Estado |
|----------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio Supabase | ✅ |
| `ANTHROPIC_API_KEY` | Clave API de Anthropic (Claude) | ✅ |
| `RESEND_API_KEY` | Clave API de Resend para emails | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL de producción | ✅ |

## Notas

- Supabase proyecto: `jjauccfnewxevknvoccb`
- URL producción: `https://ksepensiones.vercel.app`
- Repo: `msmejoraprocesos/ksepensiones` (branch: main)
- Admin: `msmejoraprocesos@gmail.com` (ID: `05cadf90-7926-4892-bf9f-b73c9eedf63d`)
