// Testes do esporte na TV (Fase 6.4, passo 4): contratos da largada, escolha dos jogos, jogo na grade deslocando a
// programação (com perda de hábito), pré e pós-jogo, prorrogação e pênaltis, obrigações, cotas e sublicenciamento.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogSnapshot } from '../supabase/functions/_shared/engine/catalogWorld.ts';
import { MARKETS } from '../supabase/functions/_shared/engine/catalog/markets.ts';
import { applyIntent } from '../supabase/functions/_shared/engine/intents.ts';
import { newGame } from '../supabase/functions/_shared/engine/newGame.ts';
import { dayPlanWithOverlays, slotArray } from '../supabase/functions/_shared/engine/schedule.ts';
import { simulate } from '../supabase/functions/_shared/engine/sim.ts';
import { advanceSports, competitionOf, fixtureByCode, programMarketInterest } from '../supabase/functions/_shared/engine/sports.ts';
import { assignBroadcasts, decisiveBroadcast, sportsDayPlan, sportsProgramIds, sublicenseQuote } from '../supabase/functions/_shared/engine/sportsTv.ts';
import type { CatalogSnapshot, GameState } from '../supabase/functions/_shared/engine/types.ts';
import { buildLote1, buildLote3, buildLote5 } from '../supabase/seeds/build.ts';
import * as L4 from '../supabase/seeds/catalogo_2026_lote4.ts';

function catalogWithSports(): CatalogSnapshot {
  const l1 = buildLote1();
  const l3 = buildLote3();
  const l5 = buildLote5();
  const grids = new Map<string, Record<string, unknown>>();
  for (const g of [...l1.rows.schedule_templates, ...l3.rows.schedule_templates]) grids.set(String(g.station_key), g);
  return buildCatalogSnapshot({
    titles: l1.rows.catalog_titles, templates: [...grids.values()],
    rights: [...l1.rows.historical_rights, ...l5.rows.historical_rights], holders: [...l1.rows.rights_holders, ...l5.rows.rights_holders],
    sports: { competitions: l5.competitions, clubs: L4.CLUBS.map((c) => ({ ...c, rivalries: l5.rivalries[c.id] ?? [] })), fanbase: L4.FANBASE.map((f) => ({ ...f, era_id: 'now' })) },
  })!;
}

let cached: GameState | null = null;
// jogando como Globo (dona da maior parte dos direitos na largada)
function globoGame(): GameState {
  cached ??= newGame({
    universe: 'real', era: 'now', startYear: 2026, scenario: 'lider_ameacada', difficulty: 'diretor', seed: 31,
    player: { name: 'Teste', background: 'jornalista', pronoun: 'o' }, station: { mode: 'real', realKey: 'globo' }, catalog: catalogWithSports(),
  } as Parameters<typeof newGame>[0]).state;
  return structuredClone(cached);
}
const byKey = (s: GameState, k: string) => s.stations.find((x) => x.realKey === k)!;

// vai para a semana que começa na segunda indicada (placares até lá) e escolhe as transmissões
function weekOf(s: GameState, monday: string): GameState {
  advanceSports(s, monday);
  s.meta.date = monday;
  s.meta.weekIndex += 1;
  assignBroadcasts(s);
  return s;
}

test('contratos da largada pelo mapa da seção 8C.2; sem "Campeonato Nacional" genérico nem a Copa antiga', () => {
  const s = globoGame();
  const sc = (s.rightsContracts ?? []).filter((c) => c.sport);
  const has = (key: string, comp: string) => sc.some((c) => c.stationId === byKey(s, key).id && c.sport!.comp === comp);
  assert.ok(has('globo', 'brasileirao_a') && has('record', 'brasileirao_a') && has('globo', 'formula1') && has('sbt', 'champions_league') && has('sbt', 'copa_do_mundo') && has('globo', 'copa_do_mundo') && has('redetv', 'brasileirao_b'));
  assert.equal(sc.find((c) => c.stationId === byKey(s, 'record').id && c.sport!.comp === 'brasileirao_a')!.endDate, '2027-12-31');
  assert.ok(!sc.some((c) => c.sport!.comp === 'copa_do_brasil' && c.endDate! > '2026-12-31'), 'Copa do Brasil 2027-2030 sem dono na largada');
  assert.ok(!s.programs.some((p) => p.title.startsWith('Campeonato Nacional')));
  assert.ok(!Object.keys(s.flags).some((k) => /^copa_2026_/.test(k)), 'sem os direitos genéricos da Copa antiga');
  assert.ok(s.stations.every((st) => !st.footballUntilYear));
});

test('escolha dos jogos: 1ª escolha antes da 2ª, mandante define o pacote, um jogo não passa em duas emissoras (só os do Brasil)', () => {
  const s = weekOf(globoGame(), '2026-04-06');
  const ws = s.sports!.windows!;
  const globo = byKey(s, 'globo').id;
  const record = byKey(s, 'record').id;
  const br = ws.filter((w) => fixtureByCode(s, w.main)?.comp === 'brasileirao_a');
  assert.ok(br.some((w) => w.station === globo) && br.some((w) => w.station === record), 'Globo e Record com Brasileirão');
  const libra = competitionOf(s, 'brasileirao_a')!.format.blocos as Record<string, string[]>;
  for (const w of br.filter((x) => x.station === record)) assert.ok(!libra.libra.includes(fixtureByCode(s, w.main)!.home), 'Record só passa mandante da LFU');
  const seen = new Map<string, string>();
  for (const w of ws) for (const code of new Set(w.byMarket.filter(Boolean))) {
    const f = fixtureByCode(s, code)!;
    const brazil = f.home === 'selecao:brasil' || f.away === 'selecao:brasil';
    if (!brazil && seen.has(code)) assert.equal(seen.get(code), w.station, `${code} em duas emissoras`);
    seen.set(code, w.station);
  }
  // transmissão regionalizada da Globo: cada praça vê o jogo de maior interesse dela
  const reg = br.find((w) => w.station === globo && new Set(w.byMarket).size > 1);
  if (reg) {
    const p = s.programs.find((x) => x.id === sportsProgramIds(globo, reg.main).match)!;
    const mi = programMarketInterest(s, p)!;
    assert.ok(mi.markets.every((v) => Number.isFinite(v)));
  }
});

test('jogo na grade: entra ao vivo no horário, com pré e pós-jogo; a programação vai para depois e perde hábito', () => {
  let s = weekOf(globoGame(), '2026-04-06');
  const globo = byKey(s, 'globo');
  const w = s.sports!.windows!.find((x) => x.station === globo.id && fixtureByCode(s, x.main)!.away && x.start >= 40)!;
  assert.ok(w, 'a Globo transmite um jogo na semana');
  const base = slotArray(s.schedules[globo.id][w.day]);
  const plan = dayPlanWithOverlays(s, globo.id, w.day, s.schedules[globo.id]);
  const ids = sportsProgramIds(globo.id, w.main);
  assert.equal(plan[w.start], ids.match, 'jogo no horário do jogo');
  assert.equal(plan[w.start - 1], ids.pre, 'pré-jogo antes');
  const f = fixtureByCode(s, w.main)!;
  assert.equal(plan[w.start + f.slots], ids.pos, 'pós-jogo depois');
  const moved = base[w.start];
  assert.ok(moved && plan.lastIndexOf(moved) > w.start + f.slots, 'o programa do horário vai para depois do jogo');
  const { displaced } = sportsDayPlan(s, globo.id, w.day, base);
  assert.ok(displaced.includes(moved!));
  // no fechamento da semana, o programa deslocado perde hábito
  s = globoGame();
  simulate(s, 'week');
  const ww = s.sports!.windows!.filter((x) => x.station === globo.id);
  const dispIds = new Set(ww.flatMap((x) => sportsDayPlan(s, globo.id, x.day, slotArray(s.schedules[globo.id][x.day])).displaced));
  const before = new Map([...dispIds].map((id) => [id, s.programs.find((p) => p.id === id)!.habitWeeks]));
  simulate(s, 'week');
  for (const [id, h] of before) {
    const p = s.programs.find((x) => x.id === id);
    if (p && dispIds.size) assert.ok(p.habitWeeks <= Math.min(8, h + 1) - 0.5, `${p.title}: hábito ${h} → ${p.habitWeeks}`);
  }
});

test('prorrogação e pênaltis estouram a grade: "atrasar" empurra a programação; "cortar" encurta o pós-jogo', () => {
  const s0 = weekOf(globoGame(), '2026-05-11'); // volta da 5ª fase da Copa do Brasil (13 e 14/05)
  const globo = byKey(s0, 'globo');
  const decisive = decisiveBroadcast(s0);
  assert.ok(decisive, 'a semana tem mata-mata decisivo do jogador');
  const w = s0.sports!.windows!.find((x) => x.station === globo.id && fixtureByCode(s0, x.main)?.tie && fixtureByCode(s0, x.main)?.leg === 2)!;
  const f = fixtureByCode(s0, w.main)!;
  const first = s0.sports!.results[f.firstLeg!] ?? [1, 1];
  s0.sports!.results[f.firstLeg!] = first;
  s0.sports!.results[f.code] = [first[1], first[0], 4, 3]; // empate no agregado, decidido nos pênaltis
  const s = structuredClone(s0); // estado novo: o calendário é recalculado com o placar
  const base = slotArray(s.schedules[globo.id][w.day]);
  const normal = sportsDayPlan(s, globo.id, w.day, base);
  assert.equal(normal.overtime[0]?.extra, 1);
  const ids = sportsProgramIds(globo.id, w.main);
  const lenOf = (slots: (string | null)[], id: string) => slots.filter((x) => x === id).length;
  assert.equal(lenOf(normal.slots, ids.match), f.slots + 1, 'pênaltis somam 15 minutos ao jogo');
  assert.equal(lenOf(normal.slots, ids.pos), 2);
  // o jogador escolheu "cortar": o pós-jogo encolhe para a grade não atrasar
  s.events.push({ id: 'evx', templateId: 'esporte_prorrogacao', category: 'esporte', title: '', severity: 'leve', tone: 'neutro', firedWeek: s.meta.weekIndex, deadlineWeek: s.meta.weekIndex, blocking: false, context: { vars: {} }, scene: '', narrated: false, speaker: null, options: [], defaultOption: 'atrasar', resolved: true, chosen: 'cortar', outcome: null });
  const cut = sportsDayPlan(s, globo.id, w.day, base);
  assert.equal(lenOf(cut.slots, ids.pos), 1);
  const after = normal.slots.findIndex((x, i) => i > w.start && x !== ids.match && x !== ids.pos);
  const afterCut = cut.slots.findIndex((x, i) => i > w.start && x !== ids.match && x !== ids.pos);
  assert.ok(afterCut < after, 'cortando, o programa seguinte entra mais cedo');
});

test('estaduais só passam na praça deles (Carioca no Rio, Mineiro em BH, no mesmo horário); nas outras, a grade normal', () => {
  const s = globoGame(); // semana da largada
  const globo = byKey(s, 'globo').id;
  const w = s.sports!.windows!.find((x) => x.station === globo && x.byMarket.some((code) => code && fixtureByCode(s, code)?.comp === 'carioca'))!;
  assert.ok(w);
  const p = s.programs.find((x) => x.id === sportsProgramIds(globo, w.main).match)!;
  const mi = programMarketInterest(s, p)!;
  const at = (code: string) => MARKETS.findIndex((m) => m.code === code);
  assert.ok(Number.isFinite(mi.markets[at('RJ')]) && mi.markets[at('RJ')] > 0.5);
  assert.ok(Number.isNaN(mi.markets[at('SP')]), 'em SP a Globo mostra a grade normal');
  assert.equal(fixtureByCode(s, w.byMarket[at('RJ')])!.comp, 'carioca');
  // todo estadual da Globo da semana está em alguma transmissão
  const comps = new Set(s.sports!.windows!.filter((x) => x.station === globo).flatMap((x) => x.byMarket.filter(Boolean).map((code) => fixtureByCode(s, code)!.comp)));
  for (const c of ['carioca', 'mineiro', 'gauchao']) assert.ok(comps.has(c), `${c} passa na semana da largada`);
});

test('cotas esportivas vendidas na temporada, jogos exibidos contam para a obrigação do contrato', () => {
  const s = globoGame();
  simulate(s, 'week');
  simulate(s, 'week');
  const cotas = s.deals.filter((d) => d.kind === 'quota' && d.advertiser.includes('cota'));
  assert.ok(cotas.length >= 3 && cotas.every((d) => d.weeklyValue > 0));
  assert.ok(cotas.every((d) => !/Itaú|Ambev|Coca|Vivo|Claro|Bradesco/.test(d.advertiser)), 'sem marcas reais');
  const carioca = s.rightsContracts!.find((c) => c.sport?.comp === 'carioca')!;
  assert.ok(carioca.sport!.entitled >= 1 && carioca.sport!.aired >= 1);
});

test('sublicenciamento: uma vez por contrato e só com janelas além da TV aberta', () => {
  const s = globoGame();
  const ps = s.stations.find((x) => x.isPlayer)!;
  const f1 = s.rightsContracts!.find((c) => c.stationId === ps.id && c.sport?.comp === 'formula1')!;
  const q = sublicenseQuote(s, f1.id);
  assert.ok(q.ok && q.value > 0, q.reason);
  const r = applyIntent(s, { type: 'sublicense_sport', contractId: f1.id });
  assert.ok(r.ok, r.message);
  assert.ok(s.weekProgress.eventCash >= q.value, 'o valor entra no caixa da semana');
  assert.equal(applyIntent(s, { type: 'sublicense_sport', contractId: f1.id }).ok, false, 'não revende duas vezes');
  const sbt = s.rightsContracts!.find((c) => c.stationId === byKey(s, 'sbt').id && c.sport?.comp === 'champions_league')!;
  assert.equal(sublicenseQuote(s, sbt.id).ok, false, 'contrato de outra emissora');
  const carioca = s.rightsContracts!.find((c) => c.stationId === ps.id && c.sport?.comp === 'carioca')!;
  assert.equal(sublicenseQuote(s, carioca.id).ok, false, 'Carioca é só TV aberta');
});
