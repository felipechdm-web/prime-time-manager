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
