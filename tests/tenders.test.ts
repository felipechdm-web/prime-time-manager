// Testes da Fase 6.4, passo 6: concorrências esportivas com a Mesa de Negociação e o tender-resolve.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../supabase/functions/_shared/game/memoryStore.ts';
import { applyIntentHandler, createGame } from '../supabase/functions/_shared/game/handlers.ts';
import { negotiationOpenHandler, negotiationTurnHandler, tenderResolveHandler } from '../supabase/functions/_shared/game/negotiationHandlers.ts';
import { validateMestrePlain } from '../supabase/functions/_shared/game/validators.ts';
import { resolveLLMConfig } from '../supabase/functions/_shared/game/llmConfig.ts';
import type { HandlerCtx } from '../supabase/functions/_shared/game/types.ts';
import { advanceSports, fixtureByCode } from '../supabase/functions/_shared/engine/sports.ts';
import { assignBroadcasts } from '../supabase/functions/_shared/engine/sportsTv.ts';
import { refreshTenders, tenderHidden } from '../supabase/functions/_shared/engine/tenders.ts';
import type { GameState } from '../supabase/functions/_shared/engine/types.ts';
import { buildLote1, buildLote3, buildLote5 } from '../supabase/seeds/build.ts';
import * as L4 from '../supabase/seeds/catalogo_2026_lote4.ts';

let counter = 0;
function ctxWith(store: MemoryStore): HandlerCtx {
  return {
    store, llm: null, userId: 'user-a', validateMestre: validateMestrePlain,
    env: { llm: resolveLLMConfig(), weeklyCap: 30, hourlyCap: 60 },
    now: () => new Date('2026-10-18T12:00:00Z'),
    uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
}

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

const HORIZONTE = {
  universe: 'real', scenario: 'emissora_crise', difficulty: 'diretor', seed: 2027,
  player: { name: 'Teste', background: 'jornalista', pronoun: 'o' }, station: { mode: 'fictional', name: 'TV Horizonte' },
};
const CDB = 'copa_do_brasil|-|2027-2030';

async function stateOf(store: MemoryStore, id: string): Promise<GameState> {
  return (await store.getGame(id))!.state;
}

// leva a partida para depois do prazo (os envelopes ficam esperando a abertura)
async function pastDeadline(store: MemoryStore, id: string, date = '2026-09-14'): Promise<void> {
  const row = (await store.getGame(id))!;
  const s = row.state;
  s.meta.date = date;
  refreshTenders(s);
  await store.updateGame(id, { state: s, version: row.version + 1 }, row.version);
}

test('Copa do Brasil 2027–2030 aberta na largada, com a CBF vendendo e a Globo como dona atual', async () => {
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, HORIZONTE);
  const s = await stateOf(store, gameId);
  const t = s.tenders!.find((x) => x.id === CDB)!;
  assert.ok(t, 'concorrência criada na largada');
  assert.equal(t.status, 'aberta');
  assert.equal(t.seller, 'cbf');
  assert.equal(t.closes, '2026-09-10');
  assert.equal(t.startDate, '2027-01-01');
  assert.equal(t.seasons, 4);
  assert.equal(s.stations.find((x) => x.id === t.incumbent)?.realKey, 'globo');
  assert.ok(t.reference > 0 && t.interested.length > 0, 'referência e boatos de interessados');
  assert.ok(!JSON.stringify(s.tenders).includes('reserve'), 'o mínimo de quem vende não vai para o estado da partida');
});

test('reunião na Mesa: retorno sem revelar números, projeto de transmissão conta, envelope entregue; o segredo fica no servidor', async () => {
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, HORIZONTE);
  const s0 = await stateOf(store, gameId);
  const agenda0 = s0.agenda.points;
  const open = await negotiationOpenHandler(ctx, { gameId, tenderId: CDB });
  assert.ok(open.negotiationId);
  assert.ok((await stateOf(store, gameId)).agenda.points < agenda0, 'reunião gasta agenda');
  const hidden = tenderHidden(s0, s0.tenders!.find((x) => x.id === CDB)!);
  assert.ok(!JSON.stringify(open).includes(String(hidden.reserve)), 'o mínimo não aparece na resposta');
  const [sec] = await store.select('negotiation_secrets', { negotiation_id: open.negotiationId });
  assert.ok((sec.hidden_state as { reserve: number }).reserve > 0, 'o segredo está em negotiation_secrets');

  const low = await negotiationTurnHandler(ctx, { negotiationId: open.negotiationId, offer: { valor: 1_000_000, jogos: 1, faixa: 'qualquer' } });
  assert.ok(low.decision.reasons.includes('valor_abaixo_do_minimo'));
  assert.ok(low.narrative.length > 0);
  const pitch = await negotiationTurnHandler(ctx, { negotiationId: open.negotiationId, offer: { valor: hidden.reserve * 1.5, jogos: 2, faixa: 'nobre', streaming: true }, tags: ['exposicao_nobre', 'audiencia_projetada'] });
  assert.ok(pitch.decision.reasons.includes('projeto_valorizado'));
  assert.ok(!pitch.decision.reasons.includes('valor_abaixo_do_minimo'));
  let s = await stateOf(store, gameId);
  const bonus = s.tenders!.find((x) => x.id === CDB)!.planBonus;
  assert.ok(bonus > 0 && bonus <= 0.1, `projeto vale no máximo 0,1 (${bonus})`);
  const env = await negotiationTurnHandler(ctx, { negotiationId: open.negotiationId, action: 'envelope', offer: { valor: hidden.reserve * 1.5, jogos: 2, faixa: 'nobre', streaming: true, parcelas: 4 } });
  assert.equal(env.pub.status, 'fechada');
  s = await stateOf(store, gameId);
  assert.ok(s.tenders!.find((x) => x.id === CDB)!.playerBid, 'envelope registrado');
  // segundo envelope é recusado
  const again = await applyIntentHandler(ctx, { gameId, intent: { type: 'tender_bid', tenderId: CDB, offer: { valor: 1 } } });
  assert.equal(again.result.ok, false);
});

test('tender-resolve: envelope forte vence, vira contrato com parcelas e divergência da história real; o vencedor transmite em 2027', async () => {
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, HORIZONTE);
  const s0 = await stateOf(store, gameId);
  const t0 = s0.tenders!.find((x) => x.id === CDB)!;
  const h = tenderHidden(s0, t0);
  const best = Math.max(h.reserve, ...h.rivals.map((r) => r.value));
  const bid = await applyIntentHandler(ctx, { gameId, intent: { type: 'tender_bid', tenderId: CDB, offer: { valor: Math.round(best * 1.6), jogos: 2, faixa: 'nobre', streaming: true, parcelas: 4 } } });
  assert.ok(bid.result.ok, bid.result.message);
  const early = await tenderResolveHandler(ctx, { gameId });
  assert.equal(early.results.length, 0, 'antes do prazo, nada abre');
  await pastDeadline(store, gameId);
  const res = await tenderResolveHandler(ctx, { gameId });
  assert.equal(res.results.length, 1);
  const s = await stateOf(store, gameId);
  const ps = s.stations.find((x) => x.isPlayer)!;
  assert.equal(res.results[0].winner, ps.id, 'o jogador venceu');
  const c = s.rightsContracts!.find((x) => x.origin === 'concorrencia' && x.sport?.comp === 'copa_do_brasil')!;
  assert.ok(c && c.stationId === ps.id && c.startDate === '2027-01-01' && c.endDate === '2030-12-31');
  assert.equal(c.payments.length, 4);
  assert.ok(c.sport!.rightsPaid && c.sport!.perRound === 2);
  assert.ok((s.divergences ?? []).some((d) => d.productRef === 'copa_do_brasil'), 'divergência: na vida real ficou com a Globo');
  const inbox = await store.select('inbox_messages', { game_id: gameId });
  assert.ok(inbox.some((m) => String(m.subject).startsWith('Resultado da concorrência')), 'anúncio do resultado na caixa de entrada');
  // em 2027 a emissora do jogador transmite a Copa do Brasil (e a Globo não)
  advanceSports(s, '2027-04-19');
  s.meta.date = '2027-04-19';
  s.meta.weekIndex += 70;
  assignBroadcasts(s);
  const cdbWindows = s.sports!.windows!.filter((w) => fixtureByCode(s, w.main)?.comp === 'copa_do_brasil');
  assert.ok(cdbWindows.length > 0 && cdbWindows.every((w) => w.station === ps.id), 'Copa do Brasil 2027 na emissora do jogador');
});

test('envelope abaixo do mínimo é desclassificado; renovações abrem seis meses antes do fim dos contratos', async () => {
  const store = storeWithSports();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, HORIZONTE);
  await applyIntentHandler(ctx, { gameId, intent: { type: 'tender_bid', tenderId: CDB, offer: { valor: 1_000_000, jogos: 1 } } });
  await pastDeadline(store, gameId);
  const res = await tenderResolveHandler(ctx, { gameId });
  assert.equal(res.results[0].playerValid, false);
  const s = await stateOf(store, gameId);
  assert.notEqual(res.results[0].winner, s.meta.playerStationId);
  // renovação: Libertadores e Sul-Americana (contratos até 31/12/2026) já abriram em setembro
  const renew = s.tenders!.filter((x) => x.kind === 'renovacao');
  assert.ok(renew.some((x) => x.comp === 'libertadores' && x.cycle === '2027-2030'));
  assert.ok(renew.some((x) => x.comp === 'sul_americana'));
  assert.ok(!renew.some((x) => x.comp === 'copa_do_brasil'), 'a Copa do Brasil já tinha a concorrência do catálogo');
});
