// Fase 6.1 — mede o custo da IA numa semana-padrão de jogo, v1 x v2, sem gastar nada.
// Roda os handlers reais com um Mestre falso que grava cada pedido; os tokens seguem o perfil
// medido na v1 em llm_calls/Console (16/10/2026) e o custo usa os preços oficiais da Claude API.
//
//   node scripts/custo-semana.ts
//
// Semana-padrão: boletim semanal, todos os eventos abertos e respondidos, 1 reunião curta (abertura + 4 falas),
// 1 pergunta à Bia, 1 ação livre e 1 transmissão na Sala de Controle. A entrevista inicial (uma vez por partida)
// e o resumo mensal de campanha aparecem à parte.

import { MemoryStore } from '../supabase/functions/_shared/game/memoryStore.ts';
import {
  applyIntentHandler, createGame, interpretHandler, liveModeHandler, mestreSceneHandler, resolveEventHandler, simulateHandler,
} from '../supabase/functions/_shared/game/handlers.ts';
import { validateMestrePlain } from '../supabase/functions/_shared/game/validators.ts';
import { HAIKU, LLM_FUNCTIONS, SONNET, callCost, resolveLLMConfig } from '../supabase/functions/_shared/game/llmConfig.ts';
import type { LLMFunction } from '../supabase/functions/_shared/game/llmConfig.ts';
import type { HandlerCtx, LLMProvider, LLMRequest } from '../supabase/functions/_shared/game/types.ts';
import { computeLiveMoments } from '../supabase/functions/_shared/engine/live.ts';

// ===== perfil medido na v1 (2 chamadas em Sonnet 5.5, raciocínio adaptativo, esforço baixo) =====
const V1_CREATE_GAME_INPUT = 1551; // entrada sem cache da entrevista
const V1_CACHE_PREFIX = 3701; // parte fixa do Mestre gravada no cache (Console - llm_calls, por chamada)
const V1_OUTPUT_AVG = 872; // saída média por chamada, incluindo o raciocínio
const V1_MODEL: Record<LLMFunction, string> = {
  'create-game': SONNET, boletim: SONNET, avaliacao: SONNET, evento: SONNET, 'resolve-event': SONNET,
  reuniao: SONNET, 'live-mode': SONNET, bia: HAIKU, 'interpret-free-action': HAIKU, 'campaign-summary': HAIKU,
};

const SCENE_JSON = JSON.stringify({
  scene_type: 'livre', narrative: [{ speaker: 'narrador', text: 'Bastidor.' }], headlines: [],
  choices: [{ id: 'ok', label: 'Ok' }], player_action: null, proposals: [], memory_notes: [],
});

interface Rec { fn: LLMFunction; uncachedChars: number; cached: boolean; maxTokens: number }
const recs: Rec[] = [];
let currentFn: LLMFunction = 'create-game';

const provider: LLMProvider = {
  name: 'medidor',
  async complete(req: LLMRequest) {
    const cached = req.system.some((b) => b.cache) && !!req.jsonSchema && req.system[0].text.length > 3000;
    const uncachedChars = req.system.filter((b) => !b.cache || !cached).reduce((s, b) => s + b.text.length, 0) + req.messages.reduce((s, m) => s + m.content.length, 0);
    recs.push({ fn: currentFn, uncachedChars, cached, maxTokens: req.maxTokens });
    return { ok: true, text: SCENE_JSON, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: req.model };
  },
};

let n = 0;
const store = new MemoryStore();
const ctx: HandlerCtx = {
  store, llm: provider, userId: 'medidor', validateMestre: validateMestrePlain,
  env: { llm: resolveLLMConfig(), weeklyCap: 999, hourlyCap: 999 },
  now: () => new Date(), uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
};
const as = async <T>(fn: LLMFunction, run: () => Promise<T>) => { currentFn = fn; return run(); };

// ===== a semana-padrão =====
const { gameId } = await as('create-game', () => createGame(ctx, {
  universe: 'real', era: '90s', startYear: 1995, scenario: 'emissora_crise', difficulty: 'diretor',
  player: { name: 'Felipe', background: 'jornalista', pronoun: 'o' }, station: { mode: 'fictional', name: 'TV Horizonte' }, seed: 20261016,
}));
const createGameRecs = recs.length;
await applyIntentHandler(ctx, { gameId, intent: { type: 'fill_empty' } });
const sim = await simulateHandler(ctx, { gameId, mode: 'week' });
const weekReport = sim.summary!.reports.find((r) => r.kind === 'week')!;
await as('boletim', () => mestreSceneHandler(ctx, { gameId, action: 'narrate_report', reportId: weekReport.id }));

let state = (await store.getGame(gameId))!.state;
const events = state.events.filter((e) => !e.resolved);
for (const ev of events) {
  await as('evento', () => mestreSceneHandler(ctx, { gameId, action: 'narrate_event', eventId: ev.id }));
  await as('resolve-event', () => resolveEventHandler(ctx, { gameId, eventId: ev.id, optionId: ev.options[0].id }));
}
const meet = await as('reuniao', () => mestreSceneHandler(ctx, { gameId, action: 'start_meeting', npcIds: ['npc_comercial'], meetingType: 'curta' }));
for (let i = 0; i < 4; i++) {
  await as('reuniao', () => mestreSceneHandler(ctx, { gameId, action: 'say', conversationId: meet.conversationId, text: 'Quero entender a política de descontos.' }));
}
await as('bia', () => mestreSceneHandler(ctx, { gameId, action: 'ask_bia', text: 'O que priorizar esta semana?' }));
await as('interpret-free-action', () => interpretHandler(ctx, { gameId, text: 'coloque a novela das seis às 18h de segunda a sexta' }));

// Sala de Controle: garante uma estreia na segunda para abrir um momento ao vivo
state = (await store.getGame(gameId))!.state;
const ready = state.programs.find((p) => p.stationId === state.meta.playerStationId && p.status === 'ready' && p.stats.length === 0);
if (ready) await applyIntentHandler(ctx, { gameId, intent: { type: 'place_program', programId: ready.id, days: [0], start: 60, len: 4 } });
await applyIntentHandler(ctx, { gameId, intent: { type: 'fill_empty' } });
state = (await store.getGame(gameId))!.state;
state.liveMoments = computeLiveMoments(state);
await store.updateGame(gameId, { state }, (await store.getGame(gameId))!.version);
if (state.liveMoments.some((m) => m.day === 0)) await as('live-mode', () => liveModeHandler(ctx, { gameId, day: 0 }));

// ===== custo =====
const charsPerToken = recs[0].uncachedChars / V1_CREATE_GAME_INPUT; // calibrado pela entrevista medida na v1
const leves = events.filter((e) => e.severity === 'leve').length;
const graves = events.filter((e) => e.severity === 'grave').length;

interface Call { fn: LLMFunction; model: string; input: number; cached: boolean; output: number }
function priceCalls(calls: Call[]) {
  const warm = new Set<string>(); // cache de 5 min: numa sessão de jogo, a 1ª chamada de cada modelo escreve e as outras leem
  const byFn = new Map<LLMFunction, { calls: number; usd: number }>();
  let total = 0;
  for (const c of calls) {
    const write = c.cached && !warm.has(c.model) ? V1_CACHE_PREFIX : 0;
    const read = c.cached && warm.has(c.model) ? V1_CACHE_PREFIX : 0;
    if (c.cached) warm.add(c.model);
    const usd = callCost(c.model, { input: c.input, output: c.output, cacheRead: read, cacheWrite: write }) ?? 0;
    total += usd;
    const f = byFn.get(c.fn) ?? { calls: 0, usd: 0 };
    f.calls += 1;
    f.usd += usd;
    byFn.set(c.fn, f);
  }
  return { total, byFn };
}

const weekRecs = recs.slice(createGameRecs);
const tokens = (r: Rec) => Math.round(r.uncachedChars / charsPerToken);
// v2: o que os handlers de fato chamaram. Saída conservadora: a mesma da v1 (com raciocínio), limitada pelo max_tokens
const v2: Call[] = weekRecs.map((r) => ({ fn: r.fn, model: HAIKU, input: tokens(r), cached: r.cached, output: Math.min(V1_OUTPUT_AVG, r.maxTokens) }));
// v1: as mesmas chamadas + narração dos eventos leves + desfecho de todo evento narrado, nos modelos da v1
const avg = (fn: LLMFunction) => {
  const xs = weekRecs.filter((r) => r.fn === fn).map(tokens);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 2500;
};
const v1: Call[] = [
  ...weekRecs.map((r) => ({ fn: r.fn, model: V1_MODEL[r.fn], input: tokens(r), cached: r.cached, output: V1_OUTPUT_AVG })),
  ...Array.from({ length: leves }, () => ({ fn: 'evento' as const, model: SONNET, input: avg('evento'), cached: true, output: V1_OUTPUT_AVG })),
  ...Array.from({ length: events.length - graves }, () => ({ fn: 'resolve-event' as const, model: SONNET, input: avg('evento'), cached: true, output: V1_OUTPUT_AVG })),
];
const c1 = priceCalls(v1);
const c2 = priceCalls(v2);

const usd = (v: number) => `US$ ${v.toFixed(4)}`;
console.log(`Semana-padrão: ${events.length} evento(s) (${leves} leve(s), ${graves} grave(s)), reunião curta, Bia, ação livre, Sala de Controle.`);
console.log(`Calibração: ${charsPerToken.toFixed(2)} caracteres por token (entrevista da v1 = ${V1_CREATE_GAME_INPUT} tokens).\n`);
const fns = [...new Set([...c1.byFn.keys(), ...c2.byFn.keys()])];
console.table(Object.fromEntries(fns.map((fn) => [LLM_FUNCTIONS[fn].label, {
  'chamadas v1': c1.byFn.get(fn)?.calls ?? 0,
  'custo v1': usd(c1.byFn.get(fn)?.usd ?? 0),
  'chamadas v2': c2.byFn.get(fn)?.calls ?? 0,
  'custo v2': usd(c2.byFn.get(fn)?.usd ?? 0),
}])));
const cut = 1 - c2.total / c1.total;
console.log(`Total da semana: v1 ${usd(c1.total)} · v2 ${usd(c2.total)} · redução de ${(cut * 100).toFixed(1)}% (meta da Fase 6.1: 80%).`);
// cenário pessimista: todos os eventos da semana são médios, então a v2 também narra cada um com a IA
const v2Worst = priceCalls([...v2, ...events.filter((e) => e.severity === 'leve').map(() => ({ fn: 'evento' as const, model: HAIKU, input: avg('evento'), cached: true, output: Math.min(V1_OUTPUT_AVG, LLM_FUNCTIONS.evento.maxTokens) }))]).total;
const cutWorst = 1 - v2Worst / c1.total;
console.log(`Cenário pessimista (todos os eventos médios): v2 ${usd(v2Worst)} · redução de ${(cutWorst * 100).toFixed(1)}%.`);
const interview = recs.slice(0, createGameRecs);
const e1 = priceCalls(interview.map((r) => ({ fn: r.fn, model: SONNET, input: tokens(r), cached: r.cached, output: V1_OUTPUT_AVG }))).total;
const e2 = priceCalls(interview.map((r) => ({ fn: r.fn, model: HAIKU, input: tokens(r), cached: r.cached, output: Math.min(V1_OUTPUT_AVG, r.maxTokens) }))).total;
console.log(`Entrevista inicial (uma vez por partida): v1 ${usd(e1)} · v2 ${usd(e2)}.`);
const sum1 = priceCalls([{ fn: 'campaign-summary', model: HAIKU, input: 800, cached: false, output: V1_OUTPUT_AVG }]).total;
const sum2 = priceCalls([{ fn: 'campaign-summary', model: HAIKU, input: 800, cached: false, output: Math.min(V1_OUTPUT_AVG, 400) }]).total;
console.log(`Resumo mensal de campanha (1 por mês de jogo): v1 ${usd(sum1)} · v2 ${usd(sum2)}.`);
if (cutWorst < 0.8) process.exitCode = 1;
