-- Fase 6.2, integração do catálogo: divergências entre a partida e a história real (seção 8A).
-- Ex.: "TV Horizonte comprou Kara Sevda, que no Brasil real passou na Band."
-- Só o dono da partida lê; quem grava são as Edge Functions (service_role).

create table if not exists public.divergences (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  game_date date,
  product_ref text,
  description text not null,
  created_at timestamptz not null default now()
);
create index if not exists divergences_idx on public.divergences (game_id, created_at desc);

alter table public.divergences enable row level security;
drop policy if exists "dono da partida lê" on public.divergences;
create policy "dono da partida lê" on public.divergences for select using (public.owns_game(game_id));

grant select on public.divergences to authenticated;
grant all on public.divergences to service_role;
grant usage, select on all sequences in schema public to service_role;
