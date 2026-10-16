-- =====================================================================
-- v2 / Fase 6.2 — catálogo real (seções 8A e 18.1 do documento-mestre)
-- Players donos de direitos, títulos reais, grades típicas, direitos históricos,
-- clubes e torcidas por praça. Catálogo global (vale para todas as partidas),
-- somente leitura para o jogador; quem edita é o Editor de Catálogo (Edge Function
-- catalog-admin, com service role). Não apaga nada da v1 e pode rodar de novo.
--
-- Além do que a seção 18.1 lista, toda tabela ganha confidence, approved, notes,
-- batch (lote de origem) e datas, para o Editor filtrar e revisar (seção 8A.4).
-- O vínculo programa -> título real (catalog_title_id) fica no próprio programa,
-- dentro de games.state (campo catalogTitleId), porque o jogo não tem tabela programs.
-- =====================================================================

-- ===== players: empresas reais com quem se negocia (representantes são fictícios) =====
create table if not exists public.rights_holders (
  id text primary key,                               -- 'televisa', 'wbd', 'liberty_f1'...
  name text not null,
  category text not null,                            -- novela_latina, novela_turca, estudio_eua, formato, futebol_nacional...
  eras text[] not null,
  profile jsonb not null default '{}'::jsonb,        -- estilo, pesos de utilidade, faixas de piso/alvo (usado na Fase 6.3)
  representative_seed jsonb,                         -- representante FICTÍCIO: nome, cargo, estilo de fala
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,                                        -- de onde vem a informação
  batch text,                                        -- lote de origem (ex.: '2026-lote1')
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== títulos reais (novelas, séries, filmes, formatos...) =====
create table if not exists public.catalog_titles (
  id text primary key,
  title_original text,
  title_br text not null,
  kind text not null,                                -- novela, serie, filme, pacote_filmes, desenho, formato, reality, documentario
  country text,
  rights_holder_id text references public.rights_holders(id),   -- apagar um player com títulos é bloqueado
  production_year int,
  episodes int,
  duration_min int,
  br_history jsonb,                                  -- emissora(s) e período de exibição real no Brasil
  available_from date,                               -- janela em que o título está à venda no jogo
  available_to date,
  game_attrs jsonb not null default '{}'::jsonb,     -- ESTIMATIVAS de jogo: gênero, qualidade, apelo, perfil, fadiga inicial
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,
  batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_to is null or available_from is null or available_to >= available_from)
);
create index if not exists catalog_titles_holder_idx on public.catalog_titles (rights_holder_id);
create index if not exists catalog_titles_window_idx on public.catalog_titles (available_from, available_to);
create index if not exists catalog_titles_review_idx on public.catalog_titles (approved, confidence);

-- ===== grade típica de cada emissora real num mês de referência =====
create table if not exists public.schedule_templates (
  id bigserial primary key,
  era_id text references public.eras(id),
  station_key text not null,                         -- globo, sbt, record, band...
  reference_month text not null,                     -- ex.: '2026-01'
  slots jsonb not null,                              -- faixa/dia -> catalog_title_id ou rótulo real
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,
  batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (era_id, station_key, reference_month)
);

-- ===== quem detinha o quê na largada de cada era =====
create table if not exists public.historical_rights (
  id bigserial primary key,
  era_id text references public.eras(id),
  product_ref text not null,                         -- id de título, de player ou de competição
  holder_station_key text not null,
  terms jsonb not null default '{}'::jsonb,          -- exclusividade, plataformas, abrangência...
  valid_from date,
  valid_to date,
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,
  batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists historical_rights_era_idx on public.historical_rights (era_id, holder_station_key);

-- ===== clubes e torcidas por praça (usados pela Fase 6.4) =====
create table if not exists public.clubs (
  id text primary key,
  name text not null,
  country text,
  rating_by_season jsonb not null default '{}'::jsonb,   -- força 0-100 por temporada (estimativa de jogo)
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,
  batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_fanbase (              -- fatia de torcida por praça
  club_id text references public.clubs(id) on delete cascade,
  market_id text not null,                           -- código da praça (markets.code); sem chave estrangeira porque o
                                                     -- seed recria markets a cada execução do setup_completo.sql
  era_id text references public.eras(id),
  share numeric not null check (share >= 0 and share <= 1),
  confidence text not null default 'media' check (confidence in ('alta','media','baixa')),
  approved boolean not null default false,
  notes text,
  batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, market_id, era_id)
);

-- ===== segurança: o jogador logado lê; só as Edge Functions (service role) escrevem =====
do $$
declare t text;
begin
  foreach t in array array['rights_holders','catalog_titles','schedule_templates','historical_rights','clubs','club_fanbase']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "catálogo público" on public.%I', t);
    execute format('create policy "catálogo público" on public.%I for select to authenticated using (true)', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;
