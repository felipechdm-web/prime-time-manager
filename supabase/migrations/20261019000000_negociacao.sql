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
