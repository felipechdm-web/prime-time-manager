// Testes da integração do catálogo real com a partida (Fase 6.2): grades reais, acervo, mercado, exclusividades e divergências.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../supabase/functions/_shared/game/memoryStore.ts';
import { applyIntentHandler, createGame } from '../supabase/functions/_shared/game/handlers.ts';
import { negotiationCloseHandler, negotiationOpenHandler, negotiationTurnHandler } from '../supabase/functions/_shared/game/negotiationHandlers.ts';
import { validateMestrePlain } from '../supabase/functions/_shared/game/validators.ts';
import { resolveLLMConfig } from '../supabase/functions/_shared/game/llmConfig.ts';
import type { HandlerCtx } from '../supabase/functions/_shared/game/types.ts';
import { buildCatalogSnapshot, parseDays, pickGrid } from '../supabase/functions/_shared/engine/catalogWorld.ts';
import { makeOffer, buyOffer } from '../supabase/functions/_shared/engine/market.ts';
import { rngFor } from '../supabase/functions/_shared/engine/rng.ts';
import { playerStation } from '../supabase/functions/_shared/engine/state.ts';
import type { GameState, MarketOffer } from '../supabase/functions/_shared/engine/types.ts';
import { buildLote1 } from '../supabase/seeds/build.ts';

let counter = 0;
function ctxWith(store: MemoryStore): HandlerCtx {
  return {
    store, llm: null, userId: 'user-a', validateMestre: validateMestrePlain,
    env: { llm: resolveLLMConfig(), weeklyCap: 30, hourlyCap: 60 },
    now: () => new Date('2026-10-18T12:00:00Z'),
    uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
}

// banco com o lote 1 inteiro aprovado
function storeWithCatalog(): MemoryStore {
  const store = new MemoryStore();
  const { rows } = buildLote1();
  for (const [table, list] of Object.entries(rows)) {
    for (const r of list) void store.insert(table, [{ ...r, approved: true }]);
  }
  return store;
}

const NEW = {
  universe: 'real', scenario: 'emissora_crise', difficulty: 'diretor', seed: 4242,
  player: { name: 'Felipe', background: 'jornalista', pronoun: 'o' }, station: { mode: 'fictional', name: 'TV Horizonte' },
};

function stationByKey(state: GameState, key: string) {
  return state.stations.find((s) => s.realKey === key)!;
}

// sorteia ofertas reais até achar uma que satisfaça o critério
function findOffer(state: GameState, ok: (o: MarketOffer) => boolean): MarketOffer | null {
  for (let i = 0; i < 400; i++) {
    const kind = (['enlatado', 'filmes', 'formato'] as const)[i % 3];
    const o = makeOffer(state, kind, rngFor(state.meta.seed, 'teste', i));
    if (o && ok(o)) return o;
  }
  return null;
}

test('catálogo: dias da grade, cópia aprovada e escolha do mês', () => {
  assert.deepEqual(parseDays('seg-sex'), [0, 1, 2, 3, 4]);
  assert.deepEqual(parseDays('sab,dom'), [5, 6]);
  assert.deepEqual(parseDays('qua, sex'), [2, 4]);
  const { rows } = buildLote1();
  const cat = buildCatalogSnapshot({ titles: rows.catalog_titles, templates: rows.schedule_templates, rights: rows.historical_rights, holders: rows.rights_holders })!;
  assert.equal(cat.titles.length, 64);
  assert.equal(pickGrid(cat, 'sbt', '2026-01-05')?.referenceMonth, '2026-01');
  // direito de "relacionamento" (turcas na Record) não é exclusividade
  assert.equal(cat.rights.find((r) => r.productRef === 'novelas_turcas')?.exclusive, false);
  assert.equal(cat.rights.find((r) => r.productRef === 'televisa')?.exclusive, true);
  assert.equal(buildCatalogSnapshot({ titles: [], templates: [], rights: [], holders: [] }), null);
});

test('partida no Brasil real com catálogo: grades reais, mercado real, exclusivos travados e divergência', async () => {
  const store = storeWithCatalog();
  const ctx = ctxWith(store);
  const { gameId } = await createGame(ctx, NEW);
  const state = (await store.getGame(gameId))!.state;
  assert.ok(state.catalog, 'a partida guarda a cópia do catálogo');
  assert.equal(state.catalog!.titles.length, 64);

  // grade real do SBT (janeiro de 2026) com título do catálogo e o telejornal no lugar
  const sbt = stationByKey(state, 'sbt');
  const sbtProgs = state.programs.filter((p) => p.stationId === sbt.id && p.status === 'on_air');
  const presente = sbtProgs.find((p) => p.catalogTitleId === 'presente_de_amor');
  assert.ok(presente, 'Presente de Amor na grade do SBT');
  assert.equal(presente!.title, 'Presente de Amor');
  assert.ok(state.schedules[sbt.id].flat().some((b) => b.programId === presente!.id));
  // nenhum programa no ar sem horário
  for (const st of state.stations) {
    const used = new Set(state.schedules[st.id].flat().map((b) => b.programId));
    for (const p of state.programs) if (p.stationId === st.id && p.status === 'on_air' && !p.flags.system) assert.ok(used.has(p.id) || p.genre === 'futebol', `${st.short}: ${p.title} no ar sem horário`);
  }
  const globo = stationByKey(state, 'globo');
  assert.ok(state.programs.some((p) => p.stationId === globo.id && p.catalogTitleId === 'big_brother'), 'BBB na Globo');

  // TV Horizonte (fictícia) recebe enlatados reais baratos e sem exclusividade
  const ps = playerStation(state);
  const imports = state.programs.filter((p) => p.stationId === ps.id && p.catalogTitleId);
  assert.ok(imports.length >= 1 && imports.length <= 3);
  for (const p of imports) assert.equal(p.status, 'ready');

  // mercado: novela da Televisa aparece travada (exclusiva do SBT até 2028); comprar é recusado
  const locked = findOffer(state, (o) => !!o.lockedBy && o.lockedBy.stationKey === 'sbt');
  assert.ok(locked, 'oferta travada da Televisa');
  assert.equal(locked!.lockedBy!.until, '2028-12-31');
  state.offers.push(locked!);
  const refused = buyOffer(state, locked!.id);
  assert.equal(refused.ok, false);
  assert.match(refused.message, /exclusivo do SBT até 12\/2028/);

  // título real livre que no Brasil passou em outra emissora: não tem compra direta (Fase 6.3)...
  const free = findOffer(state, (o) => !o.lockedBy && !!o.catalogTitleId && o.price === 0
    && (state.catalog!.titles.find((t) => t.id === o.catalogTitleId)?.brStations.length ?? 0) > 0);
  assert.ok(free, 'oferta real livre');
  const row = (await store.getGame(gameId))!;
  row.state.offers.push(free!);
  await store.updateGame(gameId, { state: row.state }, row.version);
  const r = await applyIntentHandler(ctx, { gameId, intent: { type: 'buy_offer', offerId: free!.id } });
  assert.equal(r.result.ok, false);
  assert.match(r.result.message, /Mercado de Direitos/);
  // ...e fechar o contrato na Mesa de Negociação registra a divergência
  const opened = await negotiationOpenHandler(ctx, { gameId, titleId: free!.catalogTitleId }) as { negotiationId: string };
  const acc = await negotiationTurnHandler(ctx, { negotiationId: opened.negotiationId, action: 'aceitar' }) as { pub: { status: string } };
  assert.equal(acc.pub.status, 'fechada');
  const closed = await negotiationCloseHandler(ctx, { negotiationId: opened.negotiationId }) as { programId: string };
  const after = (await store.getGame(gameId))!.state;
  const bought = after.programs.find((p) => p.id === closed.programId)!;
  assert.equal(bought.catalogTitleId, free!.catalogTitleId);
  assert.equal(after.divergences?.length, 1);
  assert.equal(after.pendingDivergences, undefined, 'a fila não fica salva no estado');
  const divs = await store.select('divergences', { game_id: gameId });
  assert.equal(divs.length, 1);
  assert.match(String(divs[0].description), /no Brasil real passou (no|na) /);
});

test('assumindo o SBT real: acervo com novelas da Televisa e sem trava nas ofertas da casa', async () => {
  const store = storeWithCatalog();
  const { gameId } = await createGame(ctxWith(store), { ...NEW, scenario: 'vice_ambiciosa', station: { mode: 'real', realKey: 'sbt' } });
  const state = (await store.getGame(gameId))!.state;
  const ps = playerStation(state);
  assert.equal(ps.realKey, 'sbt');
  const archive = state.programs.filter((p) => p.stationId === ps.id && p.catalogTitleId && p.status === 'ready');
  assert.ok(archive.length >= 1, 'acervo real do SBT');
  assert.ok(state.programs.some((p) => p.stationId === ps.id && p.catalogTitleId === 'presente_de_amor' && p.status === 'on_air'));
  const televisa = findOffer(state, (o) => state.catalog!.titles.find((t) => t.id === o.catalogTitleId)?.holderId === 'televisa');
  if (televisa) assert.equal(televisa.lockedBy, undefined, 'título da Televisa não trava para o próprio SBT');
});

test('sem catálogo aprovado (ou modo fictício) o mundo é gerado como antes', async () => {
  const empty = new MemoryStore();
  const { gameId } = await createGame(ctxWith(empty), NEW);
  const s1 = (await empty.getGame(gameId))!.state;
  assert.equal(s1.catalog, undefined);
  assert.ok(!s1.programs.some((p) => p.catalogTitleId));

  const store = storeWithCatalog();
  const { gameId: g2 } = await createGame(ctxWith(store), { ...NEW, universe: 'fictional' });
  const s2 = (await store.getGame(g2))!.state;
  assert.equal(s2.catalog, undefined, 'universo fictício não usa o catálogo');
});
