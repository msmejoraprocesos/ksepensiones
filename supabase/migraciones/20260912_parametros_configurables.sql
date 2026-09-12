-- Parámetros que estaban embebidos en el código y ahora se editan
-- desde Admin Fórmulas. Sin estas columnas el guardado falla en silencio.
alter table public.perfiles_usuario
  add column if not exists recargo_mensual    numeric(6,3) default 2.07,
  add column if not exists inflacion_pension  numeric(6,3) default 4.5;

comment on column public.perfiles_usuario.recargo_mensual
  is '% mensual de recargos por mora del pago retroactivo. Lo fija el Congreso cada año en la Ley de Ingresos (Art. 21 CFF).';
comment on column public.perfiles_usuario.inflacion_pension
  is '% anual de actualización de pensiones por INPC (Art. 214 LSS). Usado en ganancia acumulada y proyección de flujos.';
