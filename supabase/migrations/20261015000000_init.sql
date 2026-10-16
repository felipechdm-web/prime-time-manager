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
