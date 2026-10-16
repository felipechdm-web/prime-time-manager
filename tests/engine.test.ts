// Testes do motor (Fase 1 do roadmap): determinismo, validações e intenções.
// Rodar: npm test   (equivale a: node --test tests/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../supabase/functions/_shared/engine/newGame.ts';
import { simulate } from '../supabase/functions/_shared/engine/sim.ts';
import { applyIntent } from '../supabase/functions/_shared/engine/intents.ts';
import { validateSchedule } from '../supabase/functions/_shared/engine/validate.ts';
import { resolveEvent } from '../supabase/functions/_shared/engine/eventsEngine.ts';
import { previewDay } from '../supabase/functions/_shared/engine/preview.ts';
import { liveProjection } from '../supabase/functions/_shared/engine/live.ts';
import { getProgram, playerStation } from '../supabase/functions/_shared/engine/state.ts';
import { EVENT_TEMPLATES } from '../supabase/functions/_shared/engine/catalog/events.ts';
import { GENRES } from '../supabase/functions/_shared/engine/catalog/genres.ts';
import type { NewGameInput } from '../supabase/functions/_shared/engine/setup.ts';
import type { GameState } from '../supabase/functions/_shared/engine/types.ts';

const INPUT: NewGameInput = {
  universe: 'real',
  era: 'now',
  startYear: 2026,
  scenario: 'emissora_crise',
  difficulty: 'diretor',
  seed: 4242,
  player: { name: 'Felipe', background: 'publicitario', pronoun: 'o' },
  station: { mode: 'fictional', name: 'TV Horizonte' },
};

function clearEvents(state: GameState) {
  for (const e of state.events) if (!e.resolved) resolveEvent(state, e.id, e.defaultOption, true);
}

test('mesma semente + mesma grade = mesmos números', () => {
  const a = newGame(INPUT).state;
  const b = newGame(INPUT).state;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  clearEvents(a);
  clearEvents(b);
  applyIntent(a, { type: 'fill_empty' });
  applyIntent(b, { type: 'fill_empty' });
  const oa = simulate(a, 'week');
  const ob = simulate(b, 'week');
  assert.deepEqual(oa.reports.find((r) => r.kind === 'week')?.data, ob.reports.find((r) => r.kind === 'week')?.data);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('semente diferente muda o resultado', () => {
  const a = newGame(INPUT).state;
  const b = newGame({ ...INPUT, seed: 99 }).state;
  assert.notEqual(playerStation(a).history.at(-1)?.pts24, playerStation(b).history.at(-1)?.pts24);
});

test('soma de shares nunca passa de 100%', () => {
  const s = newGame(INPUT).state;
  for (let w = 0; w < 3; w++) {
    clearEvents(s);
    applyIntent(s, { type: 'fill_empty' });
    simulate(s, 'week');
    const total = s.stations.filter((x) => !x.closedWeek).reduce((t, x) => t + (x.history.at(-1)?.primeShare ?? 0), 0);
    assert.ok(total <= 100.01, `soma ${total}`);
  }
});

test('modo dia a dia produz o mesmo fechamento que o modo semana', () => {
  const a = newGame(INPUT).state;
  const b = newGame(INPUT).state;
  for (const s of [a, b]) {
    clearEvents(s);
    applyIntent(s, { type: 'fill_empty' });
  }
  for (let d = 0; d < 7; d++) simulate(a, 'day');
  simulate(b, 'week');
  assert.equal(playerStation(a).history.at(-1)?.pts24, playerStation(b).history.at(-1)?.pts24);
  assert.equal(a.meta.weekIndex, b.meta.weekIndex);
});

test('faixa vazia bloqueia "Colocar no ar"', () => {
  const s = newGame(INPUT).state;
  clearEvents(s);
  const ps = playerStation(s);
  const day = s.schedules[ps.id][0];
  const victim = day.find((b) => {
    const p = getProgram(s, b.programId);
    return p && !p.locked && p.genre !== 'janela_local';
  });
  assert.ok(victim);
  const r = applyIntent(s, { type: 'remove_block', day: 0, start: victim!.start });
  assert.ok(r.ok);
  const v = validateSchedule(s);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.code === 'faixa_vazia'));
  applyIntent(s, { type: 'fill_empty' });
  assert.ok(!validateSchedule(s).issues.some((i) => i.code === 'faixa_vazia'));
});

test('blocos protegidos não podem ser removidos', () => {
  const s = newGame({ ...INPUT, scenario: 'lider_ameacada', universe: 'fictional' }).state;
  const ps = playerStation(s);
  const locked = s.programs.find((p) => p.stationId === ps.id && p.locked && p.genre === 'telejornal');
  assert.ok(locked, 'deveria existir telejornal protegido');
  const day = s.schedules[ps.id].findIndex((d) => d.some((b) => b.programId === locked!.id));
  const blk = s.schedules[ps.id][day].find((b) => b.programId === locked!.id)!;
  const r = applyIntent(s, { type: 'remove_block', day, start: blk.start });
  assert.equal(r.ok, false);
  // tentar sobrescrever com outro programa mantém o bloco protegido
  const other = s.programs.find((p) => p.stationId === ps.id && p.status === 'ready');
  assert.ok(other);
  applyIntent(s, { type: 'place_program', programId: other!.id, days: [day], start: blk.start, len: blk.len });
  assert.ok(s.schedules[ps.id][day].some((b) => b.programId === locked!.id && b.start === blk.start));
});

test('prévia e sala de controle funcionam', () => {
  const s = newGame(INPUT).state;
  const pv = previewDay(s, 0);
  assert.ok(pv.programs.length > 3);
  for (const p of pv.programs) assert.ok(p.lo <= p.est && p.est <= p.hi);
  const ps = playerStation(s);
  const blk = s.schedules[ps.id][2].find((b) => b.start >= 56) ?? s.schedules[ps.id][2][0];
  const series = liveProjection(s, { day: 2, programId: blk.programId, stationId: ps.id, reason: 'teste', startSlot: blk.start, len: blk.len, done: false });
  assert.equal(series.minutes.length, blk.len * 15);
});

test('baralho de eventos tem volume mínimo e opções válidas', () => {
  assert.ok(EVENT_TEMPLATES.length >= 60, `só ${EVENT_TEMPLATES.length} eventos`);
  for (const t of EVENT_TEMPLATES) {
    assert.ok(t.options.length >= 1 && t.options.length <= 4, t.id);
    assert.ok(t.options.some((o) => o.id === t.defaultOption), `${t.id}: opção padrão inexistente`);
  }
  const positives = EVENT_TEMPLATES.filter((t) => t.tone === 'positivo').length;
  assert.ok(positives / EVENT_TEMPLATES.length >= 0.2);
  assert.ok(Object.keys(GENRES).length >= 25);
});

test('todos os cenários da era atual criam partidas jogáveis', () => {
  for (const scenario of ['lider_ameacada', 'vice_ambiciosa', 'emissora_crise', 'rede_nova', 'canal_pago'] as const) {
    for (const universe of ['real', 'fictional'] as const) {
      if (universe === 'real' && (scenario === 'lider_ameacada' || scenario === 'vice_ambiciosa')) continue;
      const s = newGame({ ...INPUT, scenario, universe, seed: 7 }).state;
      assert.equal(s.meta.era, 'now');
      assert.equal(s.meta.date.slice(0, 4), '2026');
      clearEvents(s);
      applyIntent(s, { type: 'fill_empty' });
      const out = simulate(s, 'week');
      assert.ok(out.weekClosed, `${scenario}/${universe}`);
      assert.ok((playerStation(s).history.at(-1)?.pts24 ?? 0) > 0, `${scenario}/${universe} sem audiência`);
    }
  }
});

test('assumir uma emissora real (modo real)', () => {
  const s = newGame({ ...INPUT, station: { mode: 'real', realKey: 'sbt' } }).state;
  const ps = playerStation(s);
  assert.equal(ps.name, 'SBT');
  assert.equal(s.meta.scenario, 'vice_ambiciosa');
});
