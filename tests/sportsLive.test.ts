// Testes da Fase 6.4, passo 5: Central de Esportes (escolha dos jogos, equipe), modo ao vivo com lances do motor,
// narração (texto-modelo e IA falsa), eventos esportivos da seção 8C.7 e o espelho na tabela fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../supabase/functions/_shared/game/memoryStore.ts';
import { applyIntentHandler, createGame, liveModeHandler, simulateHandler } from '../supabase/functions/_shared/game/handlers.ts';
import { validateMestrePlain } from '../supabase/functions/_shared/game/validators.ts';
import { resolveLLMConfig } from '../supabase/functions/_shared/game/llmConfig.ts';
import type { HandlerCtx, LLMProvider, LLMRequest } from '../supabase/functions/_shared/game/types.ts';
import { EVENT_TEMPLATES } from '../supabase/functions/_shared/engine/catalog/events.ts';
import { fixtureByCode } from '../supabase/functions/_shared/engine/sports.ts';
import { playerPickUnits, sportsDayPlan, sportsEventCandidates } from '../supabase/functions/_shared/engine/sportsTv.ts';
import { slotArray } from '../supabase/functions/_shared/engine/schedule.ts';
import type { GameState } from '../supabase/functions/_shared/engine/types.ts';
import { buildLote1, buildLote3, buildLote5 } from '../supabase/seeds/build.ts';
import * as L4 from '../supabase/seeds/catalogo_2026_lote4.ts';

let counter = 0;
function ctxWith(store: MemoryStore, llm: LLMProvider | null = null): HandlerCtx {
  return {
    store, llm, userId: 'user-a', validateMestre: validateMestrePlain,
    env: { llm: resolveLLMConfig(), weeklyCap: 30, hourlyCap: 60 },
    now: () => new Date('2026-10-18T12:00:00Z'),
    uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
}

// banco com os lotes 1, 3 (grades), 4 (clubes e torcidas) e 5 (esporte) aprovados
function storeWithSports(): MemoryStore {
  const store = new MemoryStore();
  const l1 = buildLote1().rows;
  const l5 = buildLote5();
  const add = (table: string, rows: Record<string, unknown>[]) => { for (const r of rows) void store.insert(table, [{ ...r, approved: true }]); };
  add('rights_holders', [...l1.rights_holders, ...l5.rows.rights_holders]);
  add('catalog_titles', l1.catalog_titles);
  add('historical_rights', [...l1.historical_rights, ...l5.rows.historical_rights]);
  const grids = new Map<string, Record<string, unknown>>();
  for (const g of [...l1.schedule_templates, ...buildLote3().rows.schedule_templates]) grids.set(String(g.station_key), g);
  add('schedule_templates', [...grids.values()]);
  add('sports_competitions', l5.competitions);
  add('clubs', L4.CLUBS.map((c) => ({ ...c, rivalries: l5.rivalries[c.id] ?? [] })));
  add('club_fanbase', L4.FANBASE.map((f) => ({ ...f, era_id: 'now' })));
  return store;
}

const GLOBO = {
  universe: 'real', scenario: 'lider_ameacada', difficulty: 'diretor', seed: 777,
  player: { name: 'Teste', background: 'jornalista', pronoun: 'o' }, station: { mode: 'real', realKey: 'globo' },
};

async function stateOf(store: MemoryStore, id: string): Promise<GameState> {
  return (await store.getGame(id))!.state;
}

test('Central de Esportes: escolher outro jogo da rodada, abrir mão da transmissão e definir a equipe', async () => {
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, GLOBO);
  let s = await stateOf(store, gameId);
  assert.ok(s.sports, 'partida com esporte real');
  const fx = await store.select('fixtures', { game_id: gameId });
  assert.ok(fx.length > 20, 'próximos jogos espelhados na tabela fixtures');
  assert.ok(fx.some((r) => (r.broadcaster_station_ids as string[]).length > 0), 'com quem transmite');

  const units = playerPickUnits(s);
  assert.ok(units.length >= 3, 'rodadas do jogador na semana (estaduais)');
  const u = units.find((x) => x.options.some((o) => o.code !== x.chosen))!;
  assert.ok(u, 'há alternativa em alguma rodada');
  const alt = u.options.find((o) => o.code !== u.chosen)!;
  const r1 = await applyIntentHandler(ctx, { gameId, intent: { type: 'sports_pick', contractId: u.contractId, unit: u.unit, code: alt.code } });
  assert.ok(r1.result.ok, r1.result.message);
  s = await stateOf(store, gameId);
  const w = s.sports!.windows!.find((x) => x.contract === u.contractId && x.unit === u.unit)!;
  assert.equal(w.main, alt.code, 'a transmissão passa a ser o jogo escolhido');

  const r2 = await applyIntentHandler(ctx, { gameId, intent: { type: 'sports_pick', contractId: u.contractId, unit: u.unit, code: null } });
  assert.ok(r2.result.ok);
  s = await stateOf(store, gameId);
  const skipped = s.sports!.windows!.find((x) => x.contract === u.contractId && x.unit === u.unit)!;
  assert.ok(skipped.skipped);
  const plan = sportsDayPlan(s, s.meta.playerStationId, skipped.day, slotArray(s.schedules[s.meta.playerStationId][skipped.day]));
  assert.ok(!plan.slots.some((id) => id?.includes(skipped.main.replace(/[^a-z0-9]+/gi, '_'))), 'jogo sem transmissão não entra na grade');
  assert.ok(!s.liveMoments.some((m) => m.sport && m.day === skipped.day && m.startSlot === skipped.start), 'nem no modo ao vivo');

  // equipe: contrato com exclusividade exige equipe no local; o pacote LFU (compartilhado) aceita estúdio
  const libra = s.rightsContracts!.find((c) => c.stationId === s.meta.playerStationId && c.sport?.pacote === 'libra')!;
  const lfu = s.rightsContracts!.find((c) => c.stationId === s.meta.playerStationId && c.sport?.pacote === 'lfu')!;
  assert.equal((await applyIntentHandler(ctx, { gameId, intent: { type: 'sports_crew', contractId: libra.id, crew: 'estudio' } })).result.ok, false);
  assert.ok((await applyIntentHandler(ctx, { gameId, intent: { type: 'sports_crew', contractId: lfu.id, crew: 'estudio' } })).result.ok);
  s = await stateOf(store, gameId);
  assert.equal(s.rightsContracts!.find((c) => c.id === lfu.id)!.sport!.crew, 'estudio');
});

test('modo ao vivo do jogo: placar e lances do motor, picos nos gols, narração sem IA e com IA (sem inventar números)', async () => {
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, GLOBO);
  // roda os dias até o primeiro dia com jogo ao vivo do jogador que termine com gol
  let s = await stateOf(store, gameId);
  let found: { day: number; series: unknown } | null = null;
  for (let i = 0; i < 28 && !found; i++) {
    const m = s.liveMoments.find((x) => x.sport && x.day === s.weekProgress.day);
    if (m) {
      const res = await liveModeHandler(ctx, { gameId, day: m.day });
      const match = res.series.match!;
      assert.ok(match, 'série do jogo traz o placar');
      const goals = match.plays.filter((p) => p.kind === 'gol' || p.kind === 'gol_penalti');
      assert.equal(goals.length, (match.score[0] ?? 0) + (match.score[1] ?? 0), 'um lance de gol para cada gol do placar');
      assert.ok(res.commentary[0].text.startsWith('Bola rolando'), 'narração sem IA começa pelo apito inicial');
      for (const c of res.commentary) assert.doesNotMatch(c.text, /\b(Neymar|Vinícius|Gabigol|Arrascaeta)\b/);
      if (goals.length) {
        const g = goals[0];
        const pid = res.series.playerStationId;
        const at = res.series.minutes[g.minute].values[pid];
        const before = res.series.minutes[Math.max(0, g.minute - 3)].values[pid];
        if (g.minute > 3 && g.minute < 44) assert.ok(at > before, `pico no gol (${before} → ${at})`);
        found = { day: m.day, series: res.series };
      }
    }
    await simulateHandler(ctx, { gameId, mode: 'day' });
    s = await stateOf(store, gameId);
  }
  assert.ok(found, 'achou um jogo ao vivo com gol');

  // IA falsa: a narração vem da IA, e frase com número inventado é cortada
  const fake: LLMProvider = {
    name: 'fake',
    async complete(req: LLMRequest) {
      const out = { scene_type: 'esporte', narrative: [{ speaker: 'narrador', text: "0' Começa o jogo na casa do torcedor!" }, { speaker: 'narrador', text: "50' Gol aos 9999 minutos, inventado." }], headlines: [], choices: [], player_action: null, proposals: [], memory_notes: [] };
      return { ok: true, text: JSON.stringify(out), usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }, model: req.model };
    },
  };
  const store2 = storeWithSports();
  const c2 = ctxWith(store2);
  const g2 = (await createGame(c2, GLOBO)).gameId;
  let s2 = await stateOf(store2, g2);
  for (let i = 0; i < 14; i++) {
    const m = s2.liveMoments.find((x) => x.sport && x.day === s2.weekProgress.day);
    if (m) {
      const res = await liveModeHandler(ctxWith(store2, fake), { gameId: g2, day: m.day });
      assert.ok(res.commentary.some((c) => c.text.includes('Começa o jogo')), 'narração da IA');
      assert.ok(!res.commentary.some((c) => c.text.includes('9999')), 'número inventado cortado');
      return;
    }
    await simulateHandler(c2, { gameId: g2, mode: 'day' });
    s2 = await stateOf(store2, g2);
  }
  assert.fail('nenhum jogo ao vivo em duas semanas');
});

test('eventos esportivos da seção 8C.7 no baralho e disparados pela situação da partida', async () => {
  const ids = ['esporte_selecao_eliminada', 'esporte_final_grande_torcida', 'esporte_clube_rebaixado', 'esporte_jogo_adiado', 'esporte_mudanca_horario', 'esporte_narrador_assediado', 'esporte_patrocinador_exclusividade', 'esporte_briga_em_campo', 'esporte_leilao_prazo'];
  for (const id of ids) assert.ok(EVENT_TEMPLATES.find((t) => t.id === id && t.calendar), id);
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, GLOBO);
  await simulateHandler(ctx, { gameId, mode: 'week' });
  const s = await stateOf(store, gameId);
  assert.ok(s.events.some((e) => e.templateId === 'esporte_leilao_prazo' && e.scene.includes('Copa do Brasil')), 'concorrência da Copa do Brasil 2027–2030 aberta na largada');

  // clube de grande torcida rebaixado
  const a = structuredClone(s);
  const table = ['palmeiras', 'flamengo', 'botafogo', 'cruzeiro', 'fluminense', 'bahia', 'mirassol', 'internacional', 'gremio', 'sao_paulo', 'bragantino', 'vasco', 'atletico_mg', 'athletico_pr', 'vitoria', 'coritiba', 'chapecoense', 'remo', 'santos', 'corinthians'];
  a.sports!.done['brasileirao_a|2026'] = { champion: 'palmeiras', runnerUp: 'flamengo', table };
  const ca = sportsEventCandidates(a, []);
  assert.ok(ca.some((e) => e.templateId === 'esporte_clube_rebaixado' && /Corinthians|Santos/.test(String(e.vars.clube))), JSON.stringify(ca) + JSON.stringify(a.sports!.eventFlags));
  // jogo do jogador adiado pela liga
  const b = structuredClone(s);
  const w = b.sports!.windows!.find((x) => x.station === b.meta.playerStationId && !x.skipped)!;
  const f = fixtureByCode(b, w.main)!;
  const ev = sportsEventCandidates(b, [{ fixture: f, change: { date: '2026-02-04', time: '21:30', kind: 'adiado', reason: 'conflito de calendário com outra competição', fromDate: f.date, fromTime: f.time } }]);
  assert.ok(ev.some((e) => e.templateId === 'esporte_jogo_adiado' && String(e.vars.motivo).includes('conflito')), JSON.stringify({ ev, main: w.main, date: f.date, time: f.time, day: w.day }));
});
