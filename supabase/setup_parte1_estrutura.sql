-- Prime Time Manager — instalação, PARTE 1 de 2: tabelas, segurança e funções (todas as migrações).
-- Cole no SQL Editor do Supabase e clique em "Run". Depois rode a PARTE 2 (setup_parte2_catalogo.sql).
-- Pode ser executado de novo sem problemas.

-- =====================================================================
-- Prime Time Manager — migração inicial (seção 18 do documento-mestre)
-- Catálogo (somente leitura para o jogador) + partida (protegida por RLS).
-- O estado vivo da partida fica em games.state (JSONB versionado);
-- histórico, mensagens e auditoria ficam em tabelas próprias.
-- Escrita: somente pelas Edge Functions (service role). O cliente só lê.
-- =====================================================================

-- gen_random_uuid() é nativo do Postgres 13+ (o Supabase usa 15+)

-- ===================== CATÁLOGO =====================
create table if not exists public.eras (
  id text primary key,                       -- '80s','90s','00s','10s','now'
  name text not null,
  start_year int not null,
  end_year int not null,
  params jsonb not null,                     -- TLE, fuga digital, ruído, beta, CPP, índice de preço...
  summary text not null                      -- contexto curto enviado ao Mestre
);

create table if not exists public.era_rules (
  id bigserial primary key,
  era_id text references public.eras(id) on delete cascade,
  rule_key text not null,                    -- rating_hours, ad_cap, hgpe, alcohol_ads...
  config jsonb not null,
  severity text check (severity in ('block','warn','info')),
  text text
);

create table if not exists public.genres (
  id text primary key,
  name text not null,
  slot_fit jsonb not null,                   -- afinidade gênero x faixa x dia
  curve jsonb not null,                      -- tipo de curva minuto a minuto
  fatigue_per_ep numeric not null,
  cost_range jsonb not null,
  meta jsonb
);

create table if not exists public.event_templates (
  id text primary key,
  category text not null,
  title text,
  trigger jsonb not null,                    -- condições avaliadas pelo motor
  base_prob numeric not null,
  options jsonb not null,                    -- opções com efeitos codificados
  eras text[] not null,
  universe text[] not null,
  meta jsonb
);

create table if not exists public.station_archetypes (id text primary key, name text, ai_params jsonb not null);
create table if not exists public.npc_archetypes (id text primary key, role text, traits jsonb not null);

create table if not exists public.markets (
  code text primary key,
  name text not null,
  households_per_point int not null,
  individuals_per_point int not null,
  meta jsonb
);

-- ===================== PARTIDA =====================
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  universe text check (universe in ('real','fictional')),
  era_id text references public.eras(id),
  scenario text not null,
  difficulty text not null,
  seed bigint not null,
  game_date date not null,
  week_index int not null default 0,
  status text not null default 'active',     -- active, fired, retired, promoted
  player jsonb not null,                     -- nome, origem, pronome
  station_name text,
  state jsonb not null,                      -- estado oficial do motor (emissoras, programas, grade, NPCs...)
  version int not null default 1,            -- trava otimista
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists games_owner_idx on public.games (owner_id);

-- audiência por slot de 15 min: PNT + 15 praças, só as 4 semanas mais recentes (seção 9.9)
create table if not exists public.ratings_slots (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  week_index int not null,
  day int not null,
  date date not null,
  market text not null default 'PNT',
  data jsonb not null                        -- { stations: { id: [96 pontos] }, tle: [96] }
);
create index if not exists ratings_slots_idx on public.ratings_slots (game_id, week_index, day, market);

-- resumo compactado por semana (programas e emissoras), mantido para sempre
create table if not exists public.weekly_stats (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  week_index int not null,
  data jsonb not null
);
create index if not exists weekly_stats_idx on public.weekly_stats (game_id, week_index);

create table if not exists public.ratings_minute (       -- momentos ao vivo
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  week_index int not null,
  day int not null,
  program_id text,
  data jsonb not null
);

create table if not exists public.reports (               -- boletins (dia, semana) e fechamentos
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  week_index int not null,
  kind text not null,                                      -- day, week, month, quarter, year
  day int,
  data jsonb not null,
  narrative jsonb,
  narrated boolean default false,
  created_at timestamptz default now()
);
create index if not exists reports_idx on public.reports (game_id, week_index, kind);

create table if not exists public.finance_ledger (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  week_index int not null,
  date date not null,
  station_id text,
  kind text not null,                        -- publicidade, cotas, arrendamento, producao, direitos, talentos, multas...
  amount numeric not null                    -- R$ de 2026 (a interface converte para a moeda da era)
);
create index if not exists finance_ledger_idx on public.finance_ledger (game_id, week_index);

create table if not exists public.competitor_actions (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  week_index int not null,
  date date,
  station_id text,
  kind text,
  text text,
  public boolean default true
);
create index if not exists competitor_actions_idx on public.competitor_actions (game_id, week_index);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  week_index int,
  game_date date,
  from_npc text,
  subject text,
  body text,
  kind text,                                 -- mensagem, evento, alerta, pedido, imprensa, sistema
  requires_action boolean default false,
  event_id text,
  read boolean default false,
  created_at timestamptz default now()
);
create index if not exists inbox_idx on public.inbox_messages (game_id, created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  scene_type text,                           -- reuniao, entrevista, bia
  npc_ids text[],
  meeting_type text,
  week_index int,
  game_date date,
  status text,                               -- open, closed
  turns int default 0,
  max_turns int default 4,
  created_at timestamptz default now()
);
create index if not exists conversations_idx on public.conversations (game_id, created_at desc);

create table if not exists public.messages (
  id bigserial primary key,
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text check (role in ('player','mestre','system')),
  content jsonb not null,
  created_at timestamptz default now()
);
create index if not exists messages_idx on public.messages (conversation_id, id);

create table if not exists public.npc_memories (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  npc_id text not null,
  game_date date not null,
  fact text not null,
  weight int check (weight between 1 and 5)
);
create index if not exists npc_memories_idx on public.npc_memories (game_id, npc_id);

create table if not exists public.events_log (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  event_id text,
  template_id text,
  week_index int,
  chosen_option text,
  outcome text,
  created_at timestamptz default now()
);

create table if not exists public.kpi_snapshots (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  period_type text,
  period_start date,
  kpis jsonb not null
);

create table if not exists public.campaign_summaries (
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  period text,
  summary text not null,
  created_at timestamptz default now()
);

create table if not exists public.player_intents (           -- auditoria das intenções do jogador
  id bigserial primary key,
  game_id uuid references public.games(id) on delete cascade,
  user_id uuid,
  intent jsonb not null,
  result jsonb,
  created_at timestamptz default now()
);

create table if not exists public.llm_calls (                 -- auditoria e custo do Mestre
  id bigserial primary key,
  game_id uuid,
  user_id uuid,
  function text,
  model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  ok boolean,
  error text,
  created_at timestamptz default now()
);
create index if not exists llm_calls_user_idx on public.llm_calls (user_id, created_at desc);

-- ===================== RLS =====================
create or replace function public.owns_game(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.games g where g.id = gid and g.owner_id = auth.uid());
$$;

alter table public.games enable row level security;
drop policy if exists "dono lê" on public.games;
create policy "dono lê" on public.games for select using (owner_id = auth.uid());
drop policy if exists "dono apaga" on public.games;
create policy "dono apaga" on public.games for delete using (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['ratings_slots','weekly_stats','ratings_minute','reports','finance_ledger','competitor_actions',
                           'inbox_messages','conversations','npc_memories','events_log','kpi_snapshots','campaign_summaries','player_intents']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono da partida lê" on public.%I', t);
    execute format('create policy "dono da partida lê" on public.%I for select using (public.owns_game(game_id))', t);
  end loop;
end $$;

-- única escrita permitida ao cliente: marcar mensagem da caixa de entrada como lida
drop policy if exists "dono marca como lida" on public.inbox_messages;
create policy "dono marca como lida" on public.inbox_messages for update using (public.owns_game(game_id)) with check (public.owns_game(game_id));

alter table public.messages enable row level security;
drop policy if exists "dono da conversa lê" on public.messages;
create policy "dono da conversa lê" on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and public.owns_game(c.game_id))
);

alter table public.llm_calls enable row level security;
drop policy if exists "dono lê o próprio custo" on public.llm_calls;
create policy "dono lê o próprio custo" on public.llm_calls for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['eras','era_rules','genres','event_templates','station_archetypes','npc_archetypes','markets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "catálogo público" on public.%I', t);
    execute format('create policy "catálogo público" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- permissões explícitas (o cliente só lê; as Edge Functions usam service_role)
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant delete on public.games to authenticated;
grant update (read) on public.inbox_messages to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.owns_game(uuid) to authenticated, service_role;


-- v2 / Fase 6.1 — custo da IA (seção 17.5): llm_calls passa a guardar o que faltava para medir o gasto.
-- Só acrescenta colunas; nada da v1 é apagado. Pode rodar de novo sem problemas.

alter table public.llm_calls add column if not exists cache_write_tokens int;      -- escrita do cache (1,25 × entrada)
alter table public.llm_calls add column if not exists week_index int;              -- semana de jogo da chamada
alter table public.llm_calls add column if not exists effort text;                 -- low | medium | high
alter table public.llm_calls add column if not exists max_tokens int;              -- teto usado na chamada
alter table public.llm_calls add column if not exists thinking boolean;            -- raciocínio ligado?
alter table public.llm_calls add column if not exists truncated boolean;           -- resposta cortada em max_tokens
alter table public.llm_calls add column if not exists cost_usd numeric(12, 6);     -- custo estimado pela tabela de preços

create index if not exists llm_calls_game_idx on public.llm_calls (game_id, week_index);


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


-- =====================================================================
-- v2.1 — o jogo tem só a era atual (2026). Decisão do Felipe em 17/10/2026.
-- Apaga as partidas das outras eras, com tudo o que pertence a elas (boletins, grades,
-- mensagens, conversas, memórias, custo da IA...), e as eras antigas do catálogo.
-- NÃO PODE SER DESFEITO. Pode rodar de novo sem problemas (na segunda vez não acha nada).
-- =====================================================================

-- custo da IA das partidas antigas (llm_calls não tem chave estrangeira para games)
delete from public.llm_calls
where game_id in (select id from public.games where era_id is distinct from 'now');

-- partidas antigas: as demais tabelas da partida são apagadas em cascata
delete from public.games where era_id is distinct from 'now';

-- catálogo: só a era atual
delete from public.era_rules where era_id is distinct from 'now';
delete from public.schedule_templates where era_id is distinct from 'now';
delete from public.historical_rights where era_id is distinct from 'now';
delete from public.club_fanbase where era_id is distinct from 'now';
update public.rights_holders set eras = array['now']::text[] where eras is distinct from array['now']::text[];
delete from public.eras where id <> 'now';


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


-- Fase 6.3, Mesa de Negociação (seções 8B, 18.1 e 19.7).
-- negotiations ............ uma reunião de negócios com um player (o que o jogador pode ver)
-- negotiation_secrets ..... o segredo do player: piso, alvo, pesos, paciência e lances dos rivais.
--                           NINGUÉM lê pelo navegador; só as Edge Functions (service_role).
-- negotiation_rounds ...... cada rodada: proposta do jogador, decisão do motor (sem o piso), contraproposta
-- rights_contracts ........ contratos de direitos assinados (inclui as exclusividades reais da largada)
-- holder_relationships .... relacionamento de cada emissora com cada player (0 a 100)
-- divergences ............. já criada na Fase 6.2; aqui só garantimos que existe
-- As emissoras vivem dentro do estado da partida (não há tabela stations), por isso station_id é texto.
-- Pode rodar de novo sem problema.

create table if not exists public.negotiations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  station_id text not null,                          -- emissora do jogador que negocia
  rights_holder_id text not null,
  product_ref text,                                  -- título, pacote ou produto (catalog_titles.id ou outro código)
  kind text not null default 'titulo' check (kind in ('titulo', 'relacionamento', 'concorrencia')),
  status text not null default 'aberta' check (status in ('aberta', 'pausada', 'fechada', 'fracassada')),
  round int not null default 0,
  max_rounds int not null default 6,
  public_state jsonb not null default '{}'::jsonb,   -- term sheet na mesa, paciência visível, termos flexíveis
  rival_interest jsonb not null default '[]'::jsonb, -- só o que o jogador pode saber (quem demonstrou interesse)
  game_date date,                                    -- data do jogo em que a reunião abriu
  deadline date,                                     -- prazo do "vamos pensar"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists negotiations_game_idx on public.negotiations (game_id, created_at desc);

create table if not exists public.negotiation_secrets (
  negotiation_id uuid primary key references public.negotiations(id) on delete cascade,
  hidden_state jsonb not null,                       -- piso, alvo, pesos de utilidade, paciência, lances rivais
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.negotiation_rounds (
  id bigint generated always as identity primary key,
  negotiation_id uuid not null references public.negotiations(id) on delete cascade,
  round int not null,
  player_text text,                                  -- o que o jogador escreveu (se escreveu)
  player_offer jsonb,                                -- term sheet proposto pelo jogador
  argument_tags text[] not null default '{}',
  engine_decision jsonb,                             -- aceite, recusa ou contraproposta e o motivo (nunca o piso)
  holder_counter jsonb,                              -- contraproposta do player
  holder_text jsonb,                                 -- falas do representante
  created_at timestamptz not null default now()
);
create index if not exists negotiation_rounds_idx on public.negotiation_rounds (negotiation_id, round);

create table if not exists public.rights_contracts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  station_id text not null,                          -- emissora dona do direito (do jogador ou rival)
  rights_holder_id text,
  product_ref text,
  origin text not null default 'negociacao' check (origin in ('largada', 'negociacao', 'concorrencia')),
  negotiation_id uuid references public.negotiations(id) on delete set null,
  terms jsonb not null,
  start_date date,
  end_date date,
  payments jsonb not null default '[]'::jsonb,       -- parcelas: data, valor, paga
  obligations jsonb not null default '[]'::jsonb,    -- ex.: exibir no horário prometido
  status text not null default 'ativo' check (status in ('ativo', 'encerrado', 'rescindido', 'inadimplente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rights_contracts_game_idx on public.rights_contracts (game_id, status);

create table if not exists public.holder_relationships (
  game_id uuid not null references public.games(id) on delete cascade,
  rights_holder_id text not null,
  station_id text not null,
  score int not null default 50 check (score between 0 and 100),
  distrust_until date,                               -- blefe descoberto: desconfiança até esta data do jogo
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, rights_holder_id, station_id)
);

create table if not exists public.divergences (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  game_date date,
  product_ref text,
  description text not null,
  created_at timestamptz not null default now()
);

-- ===== segurança =====
-- O dono da partida lê; ninguém grava pelo navegador (as Edge Functions usam service_role).
alter table public.negotiations enable row level security;
alter table public.negotiation_rounds enable row level security;
alter table public.rights_contracts enable row level security;
alter table public.holder_relationships enable row level security;
alter table public.negotiation_secrets enable row level security;

drop policy if exists "dono da partida lê" on public.negotiations;
create policy "dono da partida lê" on public.negotiations for select using (public.owns_game(game_id));
drop policy if exists "dono da partida lê" on public.rights_contracts;
create policy "dono da partida lê" on public.rights_contracts for select using (public.owns_game(game_id));
drop policy if exists "dono da partida lê" on public.holder_relationships;
create policy "dono da partida lê" on public.holder_relationships for select using (public.owns_game(game_id));
drop policy if exists "dono da negociação lê" on public.negotiation_rounds;
create policy "dono da negociação lê" on public.negotiation_rounds for select using (
  exists (select 1 from public.negotiations n where n.id = negotiation_id and public.owns_game(n.game_id))
);

grant select on public.negotiations, public.negotiation_rounds, public.rights_contracts, public.holder_relationships to authenticated;
grant all on public.negotiations, public.negotiation_rounds, public.rights_contracts, public.holder_relationships, public.negotiation_secrets to service_role;
grant usage, select on all sequences in schema public to service_role;

-- O segredo: RLS ligada e NENHUMA policy (nem o dono lê) e, por garantia, sem permissão nenhuma para quem usa o
-- navegador. Esta migração vem depois da inicial, que concede leitura em todas as tabelas: por isso o revoke fica aqui.
-- Se uma migração futura voltar a conceder leitura em todas as tabelas, ela precisa repetir este revoke.
revoke all on public.negotiation_secrets from anon, authenticated;
drop policy if exists "dono da partida lê" on public.negotiation_secrets;


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

