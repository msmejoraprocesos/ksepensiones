-- Regeneración atómica del calendario de pagos programados.
--
-- El cliente hacía delete + insert en dos llamadas separadas. Entre ambas hay
-- una ventana en la que, si la inserción falla o el proceso muere, el cliente
-- se queda sin calendario y nadie se entera hasta que alguien lo busca.
--
-- El cliente de Supabase no expone transacciones, así que la compensación en
-- JavaScript (guardar el anterior y restaurarlo) mitiga pero no garantiza:
-- si el navegador se cierra a media operación, los datos se pierden igual.
--
-- Una función de base de datos sí es atómica: o queda el calendario nuevo
-- completo, o queda el anterior intacto. No hay estado intermedio posible.

create or replace function public.regenerar_pagos_programados(
  p_cliente_id uuid,
  p_pagos      jsonb
)
returns setof public.pagos_programados
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Todo lo que sigue ocurre dentro de la transacción implícita de la función.
  delete from public.pagos_programados where cliente_id = p_cliente_id;

  return query
  insert into public.pagos_programados (
    cliente_id, asesor_id, numero_pago, fecha_programada, monto_programado, pagado
  )
  select
    (e->>'cliente_id')::uuid,
    (e->>'asesor_id')::uuid,
    (e->>'numero_pago')::int,
    (e->>'fecha_programada')::date,
    (e->>'monto_programado')::numeric,
    coalesce((e->>'pagado')::boolean, false)
  from jsonb_array_elements(p_pagos) as e
  returning *;
end $$;

comment on function public.regenerar_pagos_programados is
  'Reemplaza el calendario completo de un cliente de forma atómica. Si la inserción falla, el borrado se revierte y el calendario anterior queda intacto.';

grant execute on function public.regenerar_pagos_programados(uuid, jsonb) to authenticated, service_role;
