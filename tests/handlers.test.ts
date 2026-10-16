// Testes ponta a ponta dos handlers (sem LLM e com um LLM falso), usando o armazenamento em memória.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../supabase/functions/_shared/game/memoryStore.ts';
import {
  applyIntentHandler, createGame, interpretHandler, liveModeHandler, mestreSceneHandler, resolveEventHandler, simulateHandler,
} from '../supabase/functions/_shared/game/handlers.ts';
import { validateMestrePlain } from '../supabase/functions/_shared/game/validators.ts';
import { allowedNumbers, scrubNumbers } from '../supabase/functions/_shared/game/mestre.ts';
import type { HandlerCtx, LLMProvider, LLMRequest } from '../supabase/functions/_shared/game/types.ts';
import { resolveLLMConfig, summarizeLLMCalls } from '../supabase/functions/_shared/game/llmConfig.ts';
import type { GameState } from '../supabase/functions/_shared/engine/types.ts';

let counter = 0;
function ctxWith(store: MemoryStore, llm: LLMProvider | null, userId = 'user-a'): HandlerCtx {
  return {
    store,
    llm,
    userId,
    validateMestre: validateMestrePlain,
    env: { llm: resolveLLMConfig(), weeklyCap: 30, hourlyCap: 60 },
    now: () => new Date(),
    uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
}

const NEW = {
  universe: 'real', scenario: 'emissora_crise', difficulty: 'diretor',
  player: { name: 'Felipe', background: 'jornalista', pronoun: 'o' }, station: { mode: 'fictional', name: 'TV Horizonte' }, seed: 31337,
};

async function gameState(store: MemoryStore, id: string): Promise<GameState> {
  return (await store.getGame(id))!.state;
}

test('fluxo completo sem IA: criar, mexer na grade, responder eventos, simular', async () => {
  const store = new MemoryStore();
  const ctx = ctxWith(store, null);
  const { gameId, interview } = await createGame(ctx, NEW);
  assert.ok(gameId);
  assert.ok(interview.narrative.length >= 2);
  const inbox = await store.select('inbox_messages', { game_id: gameId });
  assert.ok(inbox.length >= 4, 'mensagens de boas-vindas');

  // outro usuário não acessa a partida
  await assert.rejects(() => simulateHandler(ctxWith(store, null, 'user-b'), { gameId, mode: 'week' }), /não é sua/);

  // preenche vazios e roda a semana
  const fill = await applyIntentHandler(ctx, { gameId, intent: { type: 'fill_empty' } });
  assert.equal(fill.result.ok, true);
  const sim = await simulateHandler(ctx, { gameId, mode: 'week' });
  assert.equal(sim.blocked, false);
  assert.ok(sim.summary!.weekClosed);
  const weekReport = sim.summary!.reports.find((r) => r.kind === 'week');
  assert.ok(weekReport, 'boletim semanal gerado');
  assert.ok((await store.select('ratings_slots', { game_id: gameId })).length >= 7 * 16);

  // narração do boletim em fallback
  const nar = await mestreSceneHandler(ctx, { gameId, action: 'narrate_report', reportId: weekReport!.id });
  assert.ok(nar.scene.narrative.length > 0);

  // eventos: narra e resolve todos
  let state = await gameState(store, gameId);
  for (const ev of state.events.filter((e) => !e.resolved)) {
    const scene = await mestreSceneHandler(ctx, { gameId, action: 'narrate_event', eventId: ev.id });
    assert.deepEqual(scene.scene.choices.map((c: { id: string }) => c.id), ev.options.map((o) => o.id));
    const r = await resolveEventHandler(ctx, { gameId, eventId: ev.id, optionId: ev.options[0].id });
    assert.ok(r.result.optionLabel);
  }

  // reunião roteirizada consome agenda
  state = await gameState(store, gameId);
  const before = state.agenda.points;
  const meet = await mestreSceneHandler(ctx, { gameId, action: 'start_meeting', npcIds: ['npc_comercial'], meetingType: 'curta' });
  assert.ok(meet.conversationId);
  assert.ok(meet.scene.choices.length > 0);
  const reply = await mestreSceneHandler(ctx, { gameId, action: 'say', conversationId: meet.conversationId, choiceId: meet.scene.choices[0].id, choiceLabel: meet.scene.choices[0].label });
  assert.ok(reply.applied.length > 0, 'efeito da escolha aplicado');
  state = await gameState(store, gameId);
  assert.equal(state.agenda.points, before - 2);

  // Bia responde mesmo sem IA
  const bia = await mestreSceneHandler(ctx, { gameId, action: 'ask_bia', text: 'O que é share?' });
  assert.ok(bia.scene.narrative.some((n: { text: string }) => /Share/i.test(n.text)));

  // ação livre sem IA pede para usar as telas
  const interp = await interpretHandler(ctx, { gameId, text: 'coloque a novela às 21h' });
  assert.equal(interp.intent, null);

  // modo dia a dia
  await applyIntentHandler(ctx, { gameId, intent: { type: 'fill_empty' } });
  state = await gameState(store, gameId);
  for (const e of state.events.filter((x) => !x.resolved)) await resolveEventHandler(ctx, { gameId, eventId: e.id, optionId: e.defaultOption });
  const day = await simulateHandler(ctx, { gameId, mode: 'day' });
  assert.equal(day.blocked, false);
  assert.deepEqual(day.summary!.daysSimulated, [0]);

  // a caixa de saída nunca fica no estado salvo, então nenhuma mensagem é gravada duas vezes
  state = await gameState(store, gameId);
  assert.equal(state.pendingInbox.length, 0);
  const all = await store.select('inbox_messages', { game_id: gameId });
  const keys = all.map((m) => `${m.week_index}|${m.event_id}|${m.subject}|${m.body}`);
  assert.equal(new Set(keys).size, keys.length, 'mensagens duplicadas na caixa de entrada');
});

test('sala de controle no dia do momento ao vivo', async () => {
  const store = new MemoryStore();
  const ctx = ctxWith(store, null);
  const { gameId } = await createGame(ctx, { ...NEW, seed: 99 });
  let state = await gameState(store, gameId);
  // garante um momento ao vivo fazendo uma estreia na segunda
  const ready = state.programs.find((p) => p.stationId === state.meta.playerStationId && p.status === 'ready' && p.stats.length === 0);
  assert.ok(ready);
  await applyIntentHandler(ctx, { gameId, intent: { type: 'place_program', programId: ready!.id, days: [0], start: 60, len: 4 } });
  await applyIntentHandler(ctx, { gameId, intent: { type: 'fill_empty' } });
  // recalcula momentos (o handler de intenção não recalcula; a semana seguinte sim): força via estado
  state = await gameState(store, gameId);
  const { computeLiveMoments } = await import('../supabase/functions/_shared/engine/live.ts');
  state.liveMoments = computeLiveMoments(state);
  await store.updateGame(gameId, { state }, (await store.getGame(gameId))!.version);
  const m = state.liveMoments.find((x) => x.day === 0);
  assert.ok(m, 'momento ao vivo na segunda');
  const live = await liveModeHandler(ctx, { gameId, day: 0 });
  assert.ok(live.series.minutes.length > 0);
  assert.ok(live.commentary.length > 0);
});

test('Mestre com LLM falso: valida JSON, corta números inventados e filtra propostas', async () => {
  const store = new MemoryStore();
  let calls = 0;
  const fake: LLMProvider = {
    name: 'fake',
    async complete(req: LLMRequest) {
      calls++;
      if (calls === 1) return { ok: true, text: 'isto não é json', usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, model: req.model };
      const out = {
        scene_type: 'reuniao',
        narrative: [
          { speaker: 'npc_comercial', text: 'Diretor, fechamos com 999 pontos de audiência. Isso é mentira.' },
          { speaker: 'npc_comercial', text: 'Mas o cliente está feliz.' },
        ],
        headlines: [],
        choices: [{ id: 'ok', label: 'Ok' }],
        player_action: { type: 'set_promo', params_json: '{"programId":"x","level":2}', summary: 'chamadas' },
        proposals: [
          { tag: 'npc_mood', target: 'npc_comercial', value: 40, reason: 'teste de limite' },
          { tag: 'dinheiro', target: 'x', value: 1000, reason: 'proibido' },
        ],
        memory_notes: [{ npc_id: 'npc_comercial', fact: 'O diretor prometeu verba.', weight: 9 }],
      };
      return { ok: true, text: JSON.stringify(out), usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 }, model: req.model };
    },
  };
  const ctx = ctxWith(store, fake);
  const { gameId } = await createGame(ctxWith(store, null), NEW);
  const st0 = await gameState(store, gameId);
  const mood0 = st0.npcs.find((n) => n.id === 'npc_comercial')!.mood;
  const meet = await mestreSceneHandler(ctx, { gameId, action: 'start_meeting', npcIds: ['npc_comercial'], meetingType: 'curta' });
  assert.ok(meet.usedLLM);
  assert.equal(calls, 2, 'uma correção após JSON inválido');
  assert.ok(!meet.scene.narrative.some((n: { text: string }) => n.text.includes('999')), 'frase com número inventado removida');
  const st1 = await gameState(store, gameId);
  const mood1 = st1.npcs.find((n) => n.id === 'npc_comercial')!.mood;
  assert.ok(mood1 - mood0 <= 15 + 6, 'humor limitado a ±15 por cena (+ bônus da reunião)');
  assert.ok(meet.pendingAction?.type === 'set_promo');
  const mem = await store.select('npc_memories', { game_id: gameId });
  assert.equal(mem[0].weight, 5);
  const logs = await store.select('llm_calls', { game_id: gameId });
  assert.equal(logs.length, 2);
});

// ===== Fase 6.1: custo da IA =====

const SCENE_JSON = JSON.stringify({
  scene_type: 'livre', narrative: [{ speaker: 'narrador', text: 'O corredor ferve.' }], headlines: [],
  choices: [{ id: 'ok', label: 'Ok' }], player_action: null, proposals: [], memory_notes: [],
});

function recordingLLM(script: ((req: LLMRequest) => { truncated?: boolean } | void)[] = []) {
  const calls: LLMRequest[] = [];
  const provider: LLMProvider = {
    name: 'gravador',
    async complete(req: LLMRequest) {
      calls.push(req);
      const plan = script[calls.length - 1]?.(req);
      const usage = { input: 1000, output: 200, cacheRead: 0, cacheWrite: 1600 };
      if (plan?.truncated) return { ok: false, text: '{"scene', usage, model: req.model, error: 'resposta cortada (max_tokens)', truncated: true };
      return { ok: true, text: SCENE_JSON, usage, model: req.model };
    },
  };
  return { provider, calls };
}

test('configuração padrão da v2: Haiku, esforço baixo, sem raciocínio e max_tokens da seção 17.5', () => {
  const cfg = resolveLLMConfig();
  for (const fn of Object.values(cfg.fns)) {
    assert.equal(fn.model, 'claude-haiku-5-5');
    assert.equal(fn.effort, 'low');
    assert.equal(fn.thinking, false);
  }
  assert.equal(cfg.fns.boletim.maxTokens, 1200);
  assert.equal(cfg.fns.reuniao.maxTokens, 600);
  assert.equal(cfg.fns.evento.maxTokens, 700);
  assert.equal(cfg.fns['live-mode'].maxTokens, 500);
  assert.equal(cfg.fns['interpret-free-action'].maxTokens, 300);
  assert.equal(cfg.fns.avaliacao.maxTokens, 1500);
  assert.equal(cfg.premium, false);
  // modo premium liga o Sonnet só na avaliação; variáveis por função sobrescrevem o padrão
  const env: Record<string, string> = { LLM_PREMIUM: 'on', LLM_REUNIAO_MAX_TOKENS: '900', LLM_BIA_EFFORT: 'medium' };
  const p = resolveLLMConfig((k) => env[k]);
  assert.equal(p.fns.avaliacao.model, 'claude-sonnet-5-5');
  assert.equal(p.fns.boletim.model, 'claude-haiku-5-5');
  assert.equal(p.fns.reuniao.maxTokens, 900);
  assert.equal(p.fns.bia.effort, 'medium');
});

test('boletim diário, e-mails e grade não chamam a IA; eventos leves usam texto-modelo', async () => {
  const store = new MemoryStore();
  const { provider, calls } = recordingLLM();
  const ctx = ctxWith(store, provider);
  const { gameId } = await createGame(ctx, { ...NEW, seed: 4242 });
  assert.equal(calls.length, 1, 'só a entrevista inicial');
  await applyIntentHandler(ctx, { gameId, intent: { type: 'fill_empty' } });
  await simulateHandler(ctx, { gameId, mode: 'day' });
  await simulateHandler(ctx, { gameId, mode: 'week' });
  assert.equal(calls.length, 1, 'simular dias e a semana não chama a IA (boletim diário e e-mails são textos do motor)');

  const { fireEvent } = await import('../supabase/functions/_shared/engine/eventsEngine.ts');
  const { EVENT_TEMPLATES } = await import('../supabase/functions/_shared/engine/catalog/events.ts');
  let state = await gameState(store, gameId);
  const leve = fireEvent(state, EVENT_TEMPLATES.find((t) => t.severity === 'leve' && t.options.length > 1)!.id, {})!;
  const medio = fireEvent(state, EVENT_TEMPLATES.find((t) => t.severity === 'medio' && t.options.length > 1)!.id, {})!;
  await store.updateGame(gameId, { state }, (await store.getGame(gameId))!.version);

  await mestreSceneHandler(ctx, { gameId, action: 'narrate_event', eventId: leve.id });
  assert.equal(calls.length, 1, 'evento leve não chama a IA');
  await mestreSceneHandler(ctx, { gameId, action: 'narrate_event', eventId: medio.id });
  assert.equal(calls.length, 2, 'evento médio é narrado');
  const req = calls[1];
  assert.equal(req.model, 'claude-haiku-5-5');
  assert.equal(req.effort, 'low');
  assert.equal(req.maxTokens, 700);
  assert.equal(req.thinking, false);
  assert.ok(req.system[0].cache, 'parte fixa do Mestre vai com cache');

  state = await gameState(store, gameId);
  const ev = state.events.find((e) => e.id === medio.id)!;
  await resolveEventHandler(ctx, { gameId, eventId: ev.id, optionId: ev.options[0].id });
  assert.equal(calls.length, 2, 'desfecho com IA só em evento grave');

  const logs = await store.select('llm_calls', { game_id: gameId, function: 'evento' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].cache_write_tokens, 1600);
  assert.equal(logs[0].week_index, state.meta.weekIndex);
  assert.equal(logs[0].truncated, false);
  // 1000 × 0,10 + 200 × 0,50 + 1600 × 0,125 (por milhão)
  assert.ok(Math.abs(Number(logs[0].cost_usd) - 0.0004) < 1e-9);
});

test('painel de custo: linhas reais da v1 (sem custo gravado) e da v2', () => {
  const rows = [
    // as duas chamadas da v1 do Felipe (llm_calls, 16/10/2026)
    { function: 'live-mode', model: 'claude-sonnet-5-5', input_tokens: 2123, output_tokens: 855, cache_read_tokens: 0, ok: true },
    { function: 'create-game', model: 'claude-sonnet-5-5', input_tokens: 1551, output_tokens: 890, cache_read_tokens: 0, ok: true },
    // v2: custo e semana gravados
    { function: 'boletim', model: 'claude-haiku-5-5', input_tokens: 900, output_tokens: 300, cache_read_tokens: 3700, cache_write_tokens: 0, cost_usd: 0.000277, week_index: 1, ok: true, truncated: false },
    { function: 'reuniao', model: 'claude-haiku-5-5', input_tokens: 800, output_tokens: 600, cache_read_tokens: 0, cache_write_tokens: 3700, cost_usd: 0.000843, week_index: 1, ok: false, truncated: true },
  ];
  const s = summarizeLLMCalls(rows);
  assert.equal(s.total.calls, 4);
  const live = s.byFunction.find((f) => f.fn === 'live-mode')!;
  const cg = s.byFunction.find((f) => f.fn === 'create-game')!;
  assert.equal(live.agg.usd.toFixed(4), '0.0128', 'mesmo valor do relatório da v1');
  assert.equal(cg.agg.usd.toFixed(4), '0.0120');
  assert.equal(s.byFunction[0].fn, 'live-mode', 'mais caro primeiro');
  assert.deepEqual(s.byWeek.map((w) => w.week), [1, null]);
  assert.ok(Math.abs(s.perWeek! - 0.00112) < 1e-9);
  assert.equal(s.cacheHit, 0.5);
  assert.equal(s.total.failed, 1);
  assert.equal(s.total.truncated, 1);
});

test('resposta cortada em max_tokens tenta de novo com o dobro do limite', async () => {
  const store = new MemoryStore();
  const { provider, calls } = recordingLLM([() => ({ truncated: true })]);
  const ctx = ctxWith(store, provider);
  const { gameId, interview } = await createGame(ctx, { ...NEW, seed: 777 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].maxTokens, 700);
  assert.equal(calls[1].maxTokens, 1400);
  assert.equal(interview.narrative[0].text, 'O corredor ferve.');
  const logs = await store.select('llm_calls', { game_id: gameId });
  assert.deepEqual(logs.map((l) => l.truncated), [true, false]);
});

test('checagem de números aceita os do payload e corta os inventados', () => {
  const allowed = allowedNumbers({ pontos: 18.4, share: 31.2, receita: 'R$ 4,1 mi' });
  assert.equal(scrubNumbers('A novela marcou 18,4 pontos.', allowed).removed, 0);
  assert.equal(scrubNumbers('Share de 31%.', allowed).removed, 0);
  assert.equal(scrubNumbers('Faturamos R$ 4,1 milhões.', allowed).removed, 0);
  assert.equal(scrubNumbers('Chegamos a 55 pontos.', allowed).removed, 1);
  assert.equal(scrubNumbers('Em 1996, às 21h, na semana 3.', allowed).removed, 0);
});
