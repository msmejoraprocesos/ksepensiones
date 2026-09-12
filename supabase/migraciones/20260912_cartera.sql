-- Módulo de cartera: contratos de renta, pagos y acuerdos de palabra.
-- El modelo de negocio es solo renta: todo contrato vence y se renueva.

create table if not exists public.contratos (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references public.organizaciones(id) on delete cascade,
  periodicidad      text not null check (periodicidad in ('mensual','anual')),
  monto             numeric(12,2) not null check (monto >= 0),
  asientos          int  not null default 1 check (asientos > 0),
  fecha_inicio      date not null,
  fecha_fin         date,
  dias_tolerancia   int  not null default 5 check (dias_tolerancia >= 0),
  estado            text not null default 'activo' check (estado in ('activo','vencido','cancelado')),
  notas             text,
  creado_en         timestamptz not null default now()
);

create table if not exists public.pagos_contrato (
  id                     uuid primary key default gen_random_uuid(),
  contrato_id            uuid not null references public.contratos(id) on delete cascade,
  monto                  numeric(12,2) not null check (monto > 0),
  fecha_pago             date not null default current_date,
  metodo                 text,
  periodo_cubierto_hasta date not null,
  referencia             text,
  registrado_por         uuid,
  creado_en              timestamptz not null default now()
);

-- Acuerdos verbales: se concede acceso antes de que el pago entre.
-- Sin registrarlos, el compromiso vive en la memoria del administrador.
create table if not exists public.acuerdos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  descripcion        text not null,
  monto_comprometido numeric(12,2) check (monto_comprometido >= 0),
  fecha_compromiso   date not null,
  recordar_el        date,
  estado             text not null default 'pendiente' check (estado in ('pendiente','cumplido','incumplido')),
  pago_id            uuid references public.pagos_contrato(id) on delete set null,
  creado_en          timestamptz not null default now()
);

create index if not exists idx_contratos_org      on public.contratos(organizacion_id);
create index if not exists idx_pagos_contrato     on public.pagos_contrato(contrato_id);
create index if not exists idx_acuerdos_org       on public.acuerdos(organizacion_id);
create index if not exists idx_acuerdos_recordar  on public.acuerdos(recordar_el) where estado = 'pendiente';

-- Si no se captura, el recordatorio cae el día del compromiso.
create or replace function public.acuerdo_recordatorio_default()
returns trigger language plpgsql as $$
begin
  if new.recordar_el is null then new.recordar_el := new.fecha_compromiso; end if;
  return new;
end $$;

drop trigger if exists trg_acuerdo_recordatorio on public.acuerdos;
create trigger trg_acuerdo_recordatorio
  before insert on public.acuerdos
  for each row execute function public.acuerdo_recordatorio_default();

grant select, insert, update, delete on public.contratos, public.pagos_contrato, public.acuerdos to service_role, authenticated;
