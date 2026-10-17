-- Fase 6.4, Esporte (seções 8C, 18.1 e 19.7).
-- sports_competitions ... CATÁLOGO: competições reais (Brasileirão, Copa do Brasil, Libertadores, F1...), com apelo
--                         base, formato, regras de calendário e participantes por temporada. Passa pelo Editor de
--                         Catálogo, como os títulos. Quem detém os direitos na largada fica em historical_rights.
-- clubs.rivalries ....... CATÁLOGO: clássicos de cada clube (peso do clássico na audiência). Coluna nova.
-- fixtures .............. PARTIDA: os jogos e GPs da partida (disputados e próximos), com horário, quem transmite,
--                         resultado e audiência. O calendário completo sai do motor pela semente; aqui fica o espelho.
-- As emissoras vivem dentro do estado da partida (não há tabela stations), por isso as emissoras são texto.
-- Pode rodar de novo sem problema.

-- ===== catálogo: competições =====
create table if not exists public.sports_competitions (
  id text primary key,                               -- 'brasileirao_a', 'copa_do_brasil', 'f1'...
  name text not null,
  kind text not null check (kind in ('liga', 'copa', 'evento', 'gp', 'luta')),
  scope text not null default 'nacional' check (scope in ('estadual', 'nacional', 'continental', 'mundial')),
  sport text not null default 'futebol',             -- futebol, automobilismo, luta...
  rights_holder_id text references public.rights_holders(id),   -- quem vende os direitos (CBF, Conmebol, liga...)
  eras text[] not null default array['now']::text[],
  base_appeal numeric check (base_appeal is null or (base_appeal >= 0 and base_appeal <= 100)),  -- B da seção 8C.4
  format jsonb not null default '{}'::jsonb,         -- fases, turno/returno, ida e volta, número de clubes, mata-mata
  calendar_rules jsonb not null default '{}'::jsonb, -- início/fim por temporada, dias e horários típicos da era
  participants jsonb not null default '{}'::jsonb,   -- temporada -> ids de clubs (estrangeiros entram por faixa de força)
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,                                        -- de onde vem a informação
  batch text,                                        -- lote de origem (ex.: '2026-esporte')
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sports_competitions_review_idx on public.sports_competitions (approved, confidence);

-- clássicos: [{ "club": "fluminense", "weight": 1.5 }, ...] (o R da fórmula da seção 8C.4; estimativa de jogo)
alter table public.clubs add column if not exists rivalries jsonb not null default '[]'::jsonb;

alter table public.sports_competitions enable row level security;
drop policy if exists "catálogo público" on public.sports_competitions;
create policy "catálogo público" on public.sports_competitions for select to authenticated using (true);
grant select on public.sports_competitions to authenticated;
grant all on public.sports_competitions to service_role;

-- ===== partida: jogos =====
create table if not exists public.fixtures (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,                                -- código do jogo gerado pelo motor (estável na partida)
  competition_id text not null,                      -- sports_competitions.id
  season int not null,
  phase text,                                        -- grupos, oitavas, quartas, semifinal, final...
  round text,                                        -- rodada ou perna (ida/volta)
  kickoff timestamptz,                               -- data e hora do jogo (horário de Brasília)
  original_kickoff timestamptz,                      -- horário original, quando o jogo muda de horário ou é adiado
  home_club text,                                    -- clubs.id ou rótulo genérico (estrangeiro, seleção)
  away_club text,
  broadcaster_station_ids text[] not null default '{}',  -- emissoras de TV aberta que transmitem
  result jsonb,                                      -- placar, prorrogação, pênaltis e lances (sem atletas reais)
  audience jsonb,                                    -- audiência por emissora (estimativa do jogo)
  status text not null default 'agendado' check (status in ('agendado', 'adiado', 'ao_vivo', 'encerrado', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, code)
);
create index if not exists fixtures_game_idx on public.fixtures (game_id, kickoff);
create index if not exists fixtures_competition_idx on public.fixtures (game_id, competition_id, season);

-- O dono da partida lê; ninguém grava pelo navegador (as Edge Functions usam service_role).
alter table public.fixtures enable row level security;
drop policy if exists "dono da partida lê" on public.fixtures;
create policy "dono da partida lê" on public.fixtures for select using (public.owns_game(game_id));
grant select on public.fixtures to authenticated;
grant all on public.fixtures to service_role;
grant usage, select on all sequences in schema public to service_role;
