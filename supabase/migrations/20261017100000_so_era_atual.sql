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
