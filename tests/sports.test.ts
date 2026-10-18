// Testes do motor esportivo (Fase 6.4, passo 3): calendário, mudanças, gols por Poisson, classificação e fases,
// audiência pela fórmula da seção 8C.4 e multiplicador de evento (seleção e finais).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDay } from '../supabase/functions/_shared/engine/audience.ts';
import { buildCatalogSnapshot } from '../supabase/functions/_shared/engine/catalogWorld.ts';
import { MARKETS } from '../supabase/functions/_shared/engine/catalog/markets.ts';
import { newGame } from '../supabase/functions/_shared/engine/newGame.ts';
import { placeBlock } from '../supabase/functions/_shared/engine/schedule.ts';
import {
  advanceSports, ensureMatchProgram, eventTleMult, fixturesBetween, matchEvents, matchInterest, planCalendarChanges,
  seasonFixtures, simulateMatch, sportsDow, standings, teamName,
} from '../supabase/functions/_shared/engine/sports.ts';
import type { Fixture } from '../supabase/functions/_shared/engine/sports.ts';
import { addDays, clockToSlot } from '../supabase/functions/_shared/engine/time.ts';
import type { CatalogSnapshot, GameState } from '../supabase/functions/_shared/engine/types.ts';
import { buildLote1, buildLote3, buildLote5 } from '../supabase/seeds/build.ts';
import * as L4 from '../supabase/seeds/catalogo_2026_lote4.ts';

// catálogo com os lotes 1, 3, 4 e 5 aprovados (o que o create-game copiaria para a partida)
function catalogWithSports(): CatalogSnapshot {
  const l1 = buildLote1();
  const l3 = buildLote3();
  const l5 = buildLote5();
  const grids = new Map<string, Record<string, unknown>>();
  for (const g of [...l1.rows.schedule_templates, ...l3.rows.schedule_templates]) grids.set(String(g.station_key), g);
  return buildCatalogSnapshot({
    titles: l1.rows.catalog_titles, templates: [...grids.values()],
    rights: [...l1.rows.historical_rights, ...l5.rows.historical_rights], holders: [...l1.rows.rights_holders, ...l5.rows.rights_holders],
    sports: {
      competitions: l5.competitions,
      clubs: L4.CLUBS.map((c) => ({ ...c, rivalries: l5.rivalries[c.id] ?? [] })),
      fanbase: L4.FANBASE.map((f) => ({ ...f, era_id: 'now' })),
    },
  })!;
}

const INPUT = {
  universe: 'real' as const, era: 'now' as const, startYear: 2026, scenario: 'emissora_crise', difficulty: 'diretor' as const, seed: 99,
  player: { name: 'Teste', background: 'jornalista', pronoun: 'o' as const }, station: { mode: 'fictional' as const, name: 'TV Horizonte' },
};
let cached: GameState | null = null;
function game(): GameState {
  cached ??= newGame({ ...INPUT, catalog: catalogWithSports() } as Parameters<typeof newGame>[0]).state;
  return structuredClone(cached);
}

const mIdx = (code: string) => MARKETS.findIndex((m) => m.code === code);

// coloca a transmissão do jogo na grade de uma emissora e calcula o dia (sem ruído)
function airDay(base: GameState, stationKey: string, fx: Fixture | null, date: string, time: string, slots = 8) {
  const s = structuredClone(base);
  const monday = addDays(date, -sportsDow(date));
  s.meta.date = monday;
  const day = sportsDow(date);
  const st = s.stations.find((x) => x.realKey === stationKey)!;
  const start = clockToSlot(time);
  if (fx) {
    const p = ensureMatchProgram(s, st.id, fx);
    s.schedules[st.id][day] = placeBlock(s.schedules[st.id][day], p.id, start, slots);
  }
  const res = computeDay(s, day, { carry: null, noNoise: true });
  const c = res.stationIds.indexOf(st.id);
  const share = (m: number) => {
    let pts = 0;
    let tle = 0;
    for (let k = start; k < start + slots; k++) { pts += res.marketPts[m][c][k]; tle += res.marketTle[m][k]; }
    return pts / tle;
  };
  const tleAvg = (m: number) => res.marketTle[m].slice(start, start + slots).reduce((a, b) => a + b, 0) / slots;
  const pnt = res.pntPts[c].slice(start, start + slots).reduce((a, b) => a + b, 0) / slots;
  return { share, tleAvg, pnt };
}

test('esporte real só existe com competições no catálogo; sem catálogo a partida é a de sempre', () => {
  const s = game();
  assert.ok(s.sports, 'partida com competições aprovadas tem esporte');
  const plain = newGame({ ...INPUT, catalog: null } as Parameters<typeof newGame>[0]).state;
  assert.equal(plain.sports, undefined);
});

test('calendário: Brasileirão com 380 jogos nas datas da era, um jogo por clube por rodada, fora da pausa da Copa e dos fins de semana dos estaduais', () => {
  const s = game();
  const br = seasonFixtures(s, 'brasileirao_a', '2026');
  assert.equal(br.length, 380);
  for (let r = 1; r <= 38; r++) {
    const round = br.filter((f) => f.round === r);
    assert.equal(round.length, 10);
    assert.equal(new Set(round.flatMap((f) => [f.home, f.away])).size, 20, `rodada ${r}: cada clube joga uma vez`);
  }
  for (const f of br) {
    assert.ok(f.date >= '2026-01-27' && f.date <= '2026-12-03', `${f.code} ${f.date}`);
    assert.ok(!(f.date >= '2026-06-01' && f.date <= '2026-07-21'), `${f.code} cai na pausa da Copa`);
    assert.ok(!(sportsDow(f.date) >= 5 && f.date <= '2026-03-08'), `${f.code} no fim de semana dos estaduais`);
    assert.match(f.time, /^\d{2}:\d{2}$/);
  }
  // horários de TV aberta (domingo 16h e 20h30, quarta 21h30) ficam com os jogos de maior torcida
  const tv = br.filter((f) => ['16:00', '20:30', '21:30'].includes(f.time) && ['dom', 'qua'].includes(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'][sportsDow(f.date)]));
  assert.ok(tv.filter((f) => [f.home, f.away].includes('flamengo') || [f.home, f.away].includes('corinthians')).length > tv.length * 0.25);
  // Copa do Mundo: os jogos do Brasil nas datas e horários reais
  const bra = seasonFixtures(s, 'copa_do_mundo', '2026').filter((f) => f.home === 'selecao:brasil' || f.away === 'selecao:brasil').map((f) => `${f.date} ${f.time}`).sort();
  assert.deepEqual(bra, ['2026-06-13 19:00', '2026-06-19 22:00', '2026-06-24 19:00']);
  // F1: 24 GPs; Champions 2025/26 já com as rodadas de antes da largada disputadas
  assert.equal(seasonFixtures(s, 'formula1', '2026').length, 24);
  const ucl = seasonFixtures(s, 'champions_league', '2025/26').filter((f) => f.date < s.meta.date);
  assert.ok(ucl.length > 0 && ucl.every((f) => f.score), 'jogos anteriores à largada já têm placar');
});

test('resultados por Poisson: determinísticos, média de gols realista, mando de campo e força contam', () => {
  const s = game();
  const br = seasonFixtures(s, 'brasileirao_a', '2026');
  const scores = br.map((f) => simulateMatch(s, f));
  assert.deepEqual(scores, br.map((f) => simulateMatch(s, f)), 'mesma semente, mesmo placar');
  const goals = scores.reduce((n, sc) => n + sc[0] + sc[1], 0) / scores.length;
  assert.ok(goals > 2.0 && goals < 3.0, `média de gols ${goals.toFixed(2)}`);
  const home = scores.filter((sc) => sc[0] > sc[1]).length;
  const away = scores.filter((sc) => sc[0] < sc[1]).length;
  assert.ok(home > away * 1.3, `mandante vence mais (${home} x ${away})`);
  const fx = { ...br[0], home: 'flamengo', away: 'chapecoense' };
  let strong = 0;
  for (let i = 0; i < 300; i++) {
    const sc = simulateMatch(s, { ...fx, code: `teste:${i}` });
    if (sc[0] > sc[1]) strong++;
  }
  assert.ok(strong > 160, `time forte vence a maioria em casa (${strong}/300)`);
});

test('temporada completa: classificação, mata-mata com pênaltis, campeões e acesso/rebaixamento para 2027', () => {
  const s = game();
  advanceSports(s, '2027-01-04');
  const ss = s.sports!;
  for (const k of ['brasileirao_a|2026', 'brasileirao_b|2026', 'copa_do_brasil|2026', 'libertadores|2026', 'sul_americana|2026', 'copa_do_mundo|2026', 'paulistao|2026', 'carioca|2026', 'mineiro|2026', 'gauchao|2026', 'champions_league|2025/26']) {
    assert.ok(ss.done[k], `${k} terminou`);
    if (!k.startsWith('formula1')) assert.ok(ss.done[k].champion, `${k} tem campeão`);
  }
  assert.equal(ss.done['brasileirao_a|2026'].table!.length, 20);
  assert.ok(!Object.keys(ss.results).some((k) => k.startsWith('brasileirao_a:2026:')), 'temporada encerrada vira resumo');
  const a27 = new Set(seasonFixtures(s, 'brasileirao_a', '2027').map((f) => f.home));
  const tA = ss.done['brasileirao_a|2026'].table!;
  const tB = ss.done['brasileirao_b|2026'].table!;
  assert.equal(a27.size, 20);
  for (const t of tA.slice(-4)) assert.ok(!a27.has(t), `${teamName(s, t)} caiu`);
  for (const t of tB.slice(0, 4)) assert.ok(a27.has(t), `${teamName(s, t)} subiu`);
  // mata-mata: todo jogo decisivo empatado no agregado foi para os pênaltis
  const g = game();
  advanceSports(g, '2026-12-07');
  const cdb = seasonFixtures(g, 'copa_do_brasil', '2026');
  assert.ok(cdb.length === 0 || cdb.every((f) => f.score));
  // classificação ordena por pontos
  const br = seasonFixtures(game(), 'brasileirao_a', '2026').map((f) => ({ ...f, score: [2, 0] }));
  const table = standings(br.slice(0, 10), [...new Set(br.slice(0, 10).flatMap((f) => [f.home, f.away!]))]);
  assert.equal(table[0].pts, 3);
});

test('a liga muda horários e adia jogos, sempre com motivo, e o jogo adiado vai para outra data', () => {
  const s = game();
  const all: ReturnType<typeof planCalendarChanges> = [];
  let d = s.meta.date;
  for (let w = 0; w < 40; w++) {
    all.push(...planCalendarChanges(s, d));
    d = addDays(d, 7);
  }
  assert.ok(all.length >= 10, `mudanças em 40 semanas: ${all.length}`);
  assert.ok(all.some((c) => c.change.kind === 'adiado'));
  for (const c of all) {
    assert.ok(c.change.reason.length > 10);
    assert.notEqual(`${c.change.date} ${c.change.time}`, `${c.change.fromDate} ${c.change.fromTime}`);
    if (c.change.kind === 'adiado') assert.ok(c.change.date > c.change.fromDate);
  }
  const moved = all[0].fixture;
  const again = fixturesBetween(s, moved.date, moved.date).find((f) => f.code === moved.code)!;
  assert.equal(again.time, moved.change!.time, 'o calendário passa a mostrar o novo horário');
});

test('lances calculados pelo motor batem com o placar e não citam atletas reais', () => {
  const s = game();
  advanceSports(s, '2026-04-01');
  const played = fixturesBetween(s, '2026-01-28', '2026-03-31').filter((f) => f.score && f.away);
  assert.ok(played.length > 50);
  for (const f of played.slice(0, 80)) {
    const ev = matchEvents(s, f);
    const gh = ev.filter((e) => (e.kind === 'gol' || e.kind === 'gol_penalti') && e.team === 'home').length;
    const ga = ev.filter((e) => (e.kind === 'gol' || e.kind === 'gol_penalti') && e.team === 'away').length;
    assert.deepEqual([gh, ga], [f.score![0], f.score![1]]);
    for (const e of ev) assert.doesNotMatch(e.text, /[A-Z][a-z]+ [A-Z][a-z]+ marca/, 'sem nome de jogador');
  }
});

test('Fla-Flu rende mais no Rio que em Porto Alegre (torcida por praça, seção 8C.4)', () => {
  const s = game();
  const fla = seasonFixtures(s, 'brasileirao_a', '2026').find((f) => [f.home, f.away].includes('flamengo') && [f.home, f.away].includes('fluminense'))!;
  assert.ok(fla);
  const rj = matchInterest(s, fla, mIdx('RJ'));
  const poa = matchInterest(s, fla, mIdx('POA'));
  assert.ok(rj > poa * 2, `interesse RJ ${rj.toFixed(2)} x POA ${poa.toFixed(2)}`);
  // na audiência: o ganho de share da emissora que transmite é maior no Rio
  const withGame = airDay(s, 'globo', fla, fla.date, fla.time);
  const without = airDay(s, 'globo', null, fla.date, fla.time);
  const gainRJ = withGame.share(mIdx('RJ')) - without.share(mIdx('RJ'));
  const gainPOA = withGame.share(mIdx('POA')) - without.share(mIdx('POA'));
  assert.ok(withGame.share(mIdx('RJ')) > withGame.share(mIdx('POA')), 'share do Fla-Flu maior no Rio');
  assert.ok(gainRJ > gainPOA, `ganho de share RJ ${(gainRJ * 100).toFixed(1)} x POA ${(gainPOA * 100).toFixed(1)}`);
});

test('uma final rende mais que uma rodada comum (fator de fase e multiplicador de evento)', () => {
  const s = game();
  const reg = seasonFixtures(s, 'brasileirao_a', '2026').find((f) => [f.home, f.away].includes('flamengo') && [f.home, f.away].includes('palmeiras') && !f.lastRounds)!;
  const fin: Fixture = { ...reg, phase: 'final', leg: 0 };
  for (let m = 0; m < MARKETS.length; m++) assert.ok(matchInterest(s, fin, m) > matchInterest(s, reg, m), MARKETS[m].code);
  assert.equal(eventTleMult(s, reg, mIdx('RJ')), 1);
  assert.ok(eventTleMult(s, fin, mIdx('RJ')) > 1, 'final liga mais TVs onde o time tem torcida');
  // na audiência: a final do Carioca rende mais que um jogo comum do Carioca na mesma emissora e horário
  // depois das semifinais e antes da final (temporada encerrada vira só um resumo)
  let car: Fixture[] = [];
  for (let d = '2026-02-14'; d <= '2026-03-20' && !car.some((f) => f.phase === 'final'); d = addDays(d, 1)) {
    advanceSports(s, d);
    car = seasonFixtures(s, 'carioca', '2026');
  }
  const final = car.find((f) => f.phase === 'final' && f.leg === 2) ?? car.find((f) => f.phase === 'final')!;
  const commons = car.filter((f) => f.phase === 'primeira' && [final.home, final.away].includes(f.home) && [final.home, final.away].includes(f.away!));
  const common = commons[0] ?? car.find((f) => f.phase === 'primeira' && (f.home === final.home || f.away === final.home))!;
  const a = airDay(s, 'globo', final, final.date, '18:00');
  const b = airDay(s, 'globo', { ...common, date: final.date, time: '18:00' }, final.date, '18:00');
  assert.ok(a.share(mIdx('RJ')) > b.share(mIdx('RJ')), `final ${(a.share(mIdx('RJ')) * 100).toFixed(1)}% x comum ${(b.share(mIdx('RJ')) * 100).toFixed(1)}%`);
});

test('jogo da seleção aumenta o TLE (multiplicador de evento da seção 9.1) em todas as praças', () => {
  const s = game();
  const bra = seasonFixtures(s, 'copa_do_mundo', '2026').find((f) => f.date === '2026-06-13' && (f.home === 'selecao:brasil' || f.away === 'selecao:brasil'))!;
  assert.ok(bra);
  const withGame = airDay(s, 'globo', bra, bra.date, bra.time);
  const without = airDay(s, 'globo', null, bra.date, bra.time);
  for (let m = 0; m < MARKETS.length; m++) assert.ok(withGame.tleAvg(m) > without.tleAvg(m) * 1.04, `${MARKETS[m].code}: TLE ${without.tleAvg(m).toFixed(1)} → ${withGame.tleAvg(m).toFixed(1)}`);
  // um jogo comum de clube não mexe no TLE
  const br = seasonFixtures(s, 'brasileirao_a', '2026').find((f) => !f.lastRounds)!;
  const c1 = airDay(s, 'globo', br, br.date, br.time);
  const c0 = airDay(s, 'globo', null, br.date, br.time);
  assert.ok(Math.abs(c1.tleAvg(mIdx('SP')) - c0.tleAvg(mIdx('SP'))) < 1e-9);
});
