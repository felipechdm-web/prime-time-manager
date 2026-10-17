// Gera os dados semente do catálogo (seção 22) a partir dos arquivos do motor:
//   supabase/seed.sql            -> catálogo (eras, regras, gêneros, eventos, arquétipos, praças)
//   supabase/setup_completo.sql  -> migração + seed num arquivo só (para colar no SQL Editor)
//   prompts/mestre.v1.md         -> system prompt do Mestre, versão legível
// Uso: node scripts/gen-seed.ts

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ERAS, ERA_RULES } from '../supabase/functions/_shared/engine/catalog/eras.ts';
import { GENRES } from '../supabase/functions/_shared/engine/catalog/genres.ts';
import { EVENT_TEMPLATES } from '../supabase/functions/_shared/engine/catalog/events.ts';
import { ARCHETYPES } from '../supabase/functions/_shared/engine/catalog/archetypes.ts';
import { FIXED_NPCS, TALENT_ARCHETYPES } from '../supabase/functions/_shared/engine/catalog/npcs.ts';
import { MARKETS } from '../supabase/functions/_shared/engine/catalog/markets.ts';
import { MESTRE_V1_FIXED } from '../supabase/functions/_shared/game/prompt.ts';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const j = (o: unknown) => `$json$${JSON.stringify(o)}$json$::jsonb`;
const arr = (xs: string[]) => `array[${xs.map(q).join(',')}]::text[]`;

const lines: string[] = [];
lines.push('-- Prime Time Manager — dados semente do catálogo (gerado por scripts/gen-seed.ts; não edite à mão)');
lines.push('begin;');
lines.push('delete from public.era_rules; delete from public.event_templates; delete from public.genres; delete from public.station_archetypes; delete from public.npc_archetypes; delete from public.markets;');

for (const e of Object.values(ERAS)) {
  lines.push(`insert into public.eras (id, name, start_year, end_year, params, summary) values (${q(e.id)}, ${q(`${e.name} — ${e.tagline}`)}, ${e.startYear}, ${e.endYear}, ${j({ ...e.params, playable_years: e.playableYears, currency: e.currency, currency_note: e.currencyNote, message_format: e.messageFormat })}, ${q(e.summary)}) on conflict (id) do update set name = excluded.name, start_year = excluded.start_year, end_year = excluded.end_year, params = excluded.params, summary = excluded.summary;`);
}
for (const r of ERA_RULES) {
  lines.push(`insert into public.era_rules (era_id, rule_key, config, severity, text) values (${q(r.era)}, ${q(r.key)}, ${j(r.config)}, ${q(r.severity)}, ${q(r.text)});`);
}
for (const g of Object.values(GENRES)) {
  lines.push(`insert into public.genres (id, name, slot_fit, curve, fatigue_per_ep, cost_range, meta) values (${q(g.id)}, ${q(g.name)}, ${j({ weekday: g.fit, saturday: g.sat ?? {}, sunday: g.sun ?? {} })}, ${j({ kind: g.curve })}, ${g.fatiguePerEp}, ${j({ r2026: g.cost })}, ${j({ group: g.group, icon: g.icon, color: g.color, profile: g.profile, duration: g.dur, episodes: g.episodes, commercial: g.commercial, rating: g.rating, eras: g.eras ?? 'all' })});`);
}
for (const t of EVENT_TEMPLATES) {
  lines.push(`insert into public.event_templates (id, category, title, trigger, base_prob, options, eras, universe, meta) values (${q(t.id)}, ${q(t.category)}, ${q(t.title)}, ${j({ subject: t.subject, all: t.trigger })}, ${t.baseProb}, ${j(t.options)}, ${arr(t.eras === 'all' ? ['now'] : t.eras)}, ${arr(t.universe === 'all' ? ['real', 'fictional'] : t.universe)}, ${j({ severity: t.severity, tone: t.tone, speaker: t.speaker, scene: t.scene, default_option: t.defaultOption, blocking: !!t.blocking, cooldown_weeks: t.cooldownWeeks ?? null, calendar: !!t.calendar, arc: t.arc ?? null })});`);
}
for (const a of Object.values(ARCHETYPES)) {
  lines.push(`insert into public.station_archetypes (id, name, ai_params) values (${q(a.id)}, ${q(a.name)}, ${j({ ...a.ai, strategy: a.strategy, behavior: a.behavior })});`);
}
for (const n of FIXED_NPCS) {
  lines.push(`insert into public.npc_archetypes (id, role, traits) values (${q(n.key)}, ${q(n.role)}, ${j({ fixed: true, name: n.name, title: n.title, age: n.age, sheet: n.sheet, mood: n.mood, trust: n.trust, loyalty: n.loyalty, patience: n.patience })});`);
}
for (const t of TALENT_ARCHETYPES) {
  lines.push(`insert into public.npc_archetypes (id, role, traits) values (${q(`talento_${t.id}`)}, 'talento', ${j(t)});`);
}
for (const m of MARKETS) {
  lines.push(`insert into public.markets (code, name, households_per_point, individuals_per_point, meta) values (${q(m.code)}, ${q(m.name)}, ${m.hhPerPoint}, ${m.indPerPoint}, ${j({ ab_index: m.abIndex, lunch_boost: m.lunchBoost, carnival: m.carnival })});`);
}
lines.push('commit;');
const seed = lines.join('\n') + '\n';
writeFileSync('supabase/seed.sql', seed, 'utf8');

// todas as migrações, em ordem (a da v2 só acrescenta colunas)
const migration = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
  .join('\n\n');
writeFileSync(
  'supabase/setup_completo.sql',
  `-- Prime Time Manager — instalação completa (migração + catálogo).\n-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".\n-- Pode ser executado de novo sem problemas (atualiza o catálogo).\n-- Se o Supabase acusar erro de texto cortado (o arquivo é grande), use as duas partes:\n-- setup_parte1_estrutura.sql e depois setup_parte2_catalogo.sql.\n\n${migration}\n\n${seed}`,
  'utf8',
);
// o mesmo conteúdo em duas partes menores: colar um arquivo muito grande no SQL Editor pode chegar cortado
writeFileSync(
  'supabase/setup_parte1_estrutura.sql',
  `-- Prime Time Manager — instalação, PARTE 1 de 2: tabelas, segurança e funções (todas as migrações).\n-- Cole no SQL Editor do Supabase e clique em "Run". Depois rode a PARTE 2 (setup_parte2_catalogo.sql).\n-- Pode ser executado de novo sem problemas.\n\n${migration}\n`,
  'utf8',
);
writeFileSync(
  'supabase/setup_parte2_catalogo.sql',
  `-- Prime Time Manager — instalação, PARTE 2 de 2: catálogo do jogo (era, gêneros, eventos, personagens, praças).\n-- Rode DEPOIS da parte 1. Pode ser executado de novo sem problemas (atualiza o catálogo).\n\n${seed}`,
  'utf8',
);

mkdirSync('prompts', { recursive: true });
const md = `# Mestre do Prime Time Manager — system prompt v1

Versionado a partir de \`supabase/functions/_shared/game/prompt.ts\` (fonte da verdade usada em produção).
Os trechos entre chaves duplas são preenchidos pela Edge Function a cada chamada.

> Para aproveitar o cache de prompt da Claude API, a função envia primeiro o bloco fixo
> (regras, tom, tipos de cena e formato), depois o contexto da partida e, por fim, na
> mensagem do usuário, os dados do motor, as fichas dos personagens, o histórico e a tarefa.

## Bloco fixo (cacheado)

\`\`\`
${MESTRE_V1_FIXED}
\`\`\`

## Contexto da partida

\`\`\`
## Quem é o jogador
O jogador é {{player.name}}, Diretor(a) de Programação da {{station.name}}, origem profissional: {{player.background}}. Trate-o pelo nome ou por "diretor(a)". Ele toma as decisões; você nunca decide por ele.

## O mundo
- Universo: {{game.universe}} (real ou fictício).
- Data atual do jogo: {{game.game_date}} — era: {{era.name}}.
- Contexto da era: {{era.summary}}.
- Emissoras no mercado: {{competitors_summary}}.
\`\`\`

## Mensagem do usuário

\`\`\`
## DADOS DO MOTOR (fonte única de verdade)
{{engine_payload_json}}

## Personagens presentes nesta cena
{{npc_sheets_json}}

## Histórico recente
{{recent_history}}

## Tarefa desta chamada
{{task_instruction}}
\`\`\`
`;
writeFileSync('prompts/mestre.v1.md', md, 'utf8');
console.log(`seed.sql: ${lines.length} linhas; eventos: ${EVENT_TEMPLATES.length}; gêneros: ${Object.keys(GENRES).length}`);
