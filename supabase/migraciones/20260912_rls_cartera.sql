-- Políticas de acceso para las tablas de cartera.
--
-- La migración anterior otorgó permisos a `authenticated`, lo que dejaba a
-- cualquier usuario con sesión capaz de leer y escribir contratos, pagos y
-- acuerdos. Son datos comerciales del negocio, no del asesor: solo el
-- super-admin debe tocarlos.

alter table public.contratos       enable row level security;
alter table public.pagos_contrato  enable row level security;
alter table public.acuerdos        enable row level security;
alter table public.tramos_precio   enable row level security;

-- Quién es admin. Se apoya en la bandera que ya usa /admin y /cartera.
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.perfiles_usuario p where p.id = auth.uid()),
    false
  )
$$;

-- Contratos, pagos y acuerdos: solo admin, en lectura y escritura.
do $$
declare t text;
begin
  foreach t in array array['contratos','pagos_contrato','acuerdos'] loop
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format(
      'create policy %I_admin on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin())',
      t, t
    );
  end loop;
end $$;

-- Tramos de precio: lectura para cualquier sesión (el cotizador los necesita),
-- escritura solo para admin.
drop policy if exists tramos_precio_lectura on public.tramos_precio;
create policy tramos_precio_lectura on public.tramos_precio
  for select to authenticated using (true);

drop policy if exists tramos_precio_escritura on public.tramos_precio;
create policy tramos_precio_escritura on public.tramos_precio
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- service_role ignora RLS por diseño; se conserva su acceso para tareas
-- de servidor.
grant select, insert, update, delete
  on public.contratos, public.pagos_contrato, public.acuerdos, public.tramos_precio
  to service_role;
