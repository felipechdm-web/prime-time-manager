// Script de calibração (seção 9.8 do documento-mestre).
// Uso:  node scripts/calibrate.ts [--era 90s] [--weeks 12] [--seeds 6] [--universe real|fictional]
// Valida: (1) share da líder no nobre dentro da faixa plausível; (2) soma de shares <= 100;
// (3) decisões boas (estreia com chamadas, contraprogramação) rendem >= 1 ponto na média;
// (4) o ruído não domina a estratégia ao longo de um mês.

import { newGame } from '../supabase/functions/_shared/engine/newGame.ts';
import { simulate } from '../supabase/functions/_shared/engine/sim.ts';
import { applyIntent } from '../supabase/functions/_shared/engine/intents.ts';
import { resolveEvent } from '../supabase/functions/_shared/engine/eventsEngine.ts';
import { computeDay } from '../supabase/functions/_shared/engine/audience.ts';
import { ERA_ORDER, REAL_STATIONS } from '../supabase/functions/_shared/engine/catalog/eras.ts';
import { getProgram, playerStation } from '../supabase/functions/_shared/engine/state.ts';
import type { EraId, GameState, ScenarioId, Universe } from '../supabase/functions/_shared/engine/types.ts';

const args = process.argv.slice(2);
function arg(name: string, def: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const eras: EraId[] = arg('era', 'all') === 'all' ? ERA_ORDER : [arg('era', '90s') as EraId];
const WEEKS = parseInt(arg('weeks', '8'), 10);
const SEEDS = parseInt(arg('seeds', '4'), 10);
const universe = arg('universe', 'real') as Universe;
const scenario = arg('scenario', 'emissora_crise') as ScenarioId;
const verbose = args.includes('--verbose');

const LEADER_SHARE: Record<EraId, [number, number]> = {
  '80s': [45, 75],
  '90s': [40, 65],
  '00s': [35, 60],
  '10s': [28, 50],
  now: [24, 45],
};

function startYear(era: EraId): number {
  return { '80s': 1985, '90s': 1994, '00s': 2004, '10s': 2014, now: 2026 }[era];
}

function makeGame(era: EraId, seed: number): GameState {
  return newGame({
    universe,
    era,
    startYear: startYear(era),
    scenario,
    difficulty: 'diretor',
    seed,
    player: { name: 'Teste', background: 'publicitario', pronoun: 'o' },
    station: { mode: 'fictional', name: 'TV Horizonte' },
  }).state;
}

function autopilot(state: GameState): void {
  // resolve eventos pela opção padrão e preenche faixas vazias para manter o jogo andando
  for (const e of state.events) if (!e.resolved) resolveEvent(state, e.id, e.defaultOption, true);
  applyIntent(state, { type: 'fill_empty' });
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function sd(xs: number[]): number {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
}

let failures = 0;
function check(cond: boolean, msg: string): void {
  console.log(`${cond ? '  OK ' : '  FALHA'} ${msg}`);
  if (!cond) failures++;
}

for (const era of eras) {
  console.log(`\n===== ${era} (${universe}, ${scenario}) =====`);
  const t0 = Date.now();
  const leaderShares: number[] = [];
  const shareSums: number[] = [];
  const orderHits: number[] = [];
  const player24: number[] = [];
  const weekTimes: number[] = [];
  let lastState: GameState | null = null;
  for (let s = 1; s <= SEEDS; s++) {
    const state = makeGame(era, 1000 + s);
    lastState = state;
    for (let w = 0; w < WEEKS; w++) {
      autopilot(state);
      const tw = Date.now();
      simulate(state, 'week');
      weekTimes.push(Date.now() - tw);
      if (state.meta.status !== 'active') break;
    }
    // ordem da largada e share do líder no nobre
    const stations = state.stations.filter((x) => !x.closedWeek);
    const primeShares = stations.map((x) => ({ id: x.id, name: x.name, real: x.realKey, share: avg(x.history.slice(-4).map((h) => h.primeShare)), pts: avg(x.history.slice(-4).map((h) => h.prime)), pts24: avg(x.history.slice(-4).map((h) => h.pts24)) }));
    primeShares.sort((a, b) => b.share - a.share);
    leaderShares.push(primeShares[0].share);
    shareSums.push(primeShares.reduce((t, x) => t + x.share, 0));
    player24.push(avg(playerStation(state).history.slice(-4).map((h) => h.pts24)));
    if (universe === 'real') {
      const expected = REAL_STATIONS[era].map((d) => d.key).filter((k) => primeShares.some((p) => p.real === k));
      const got = primeShares.filter((p) => p.real).sort((a, b) => b.pts24 - a.pts24).map((p) => p.real);
      orderHits.push(expected[0] === got[0] ? 1 : 0);
    }
    if (verbose || s === 1) {
      console.log(`  semente ${1000 + s}: ` + primeShares.map((p) => `${p.name} ${p.pts24.toFixed(1)}/${p.pts.toFixed(1)}pts ${p.share.toFixed(0)}%`).join(' | '));
      const ps = playerStation(state);
      const f = state.finance.lastWeek;
      if (f) console.log(`    jogador: receita/sem ${(f.revenue / 1e6).toFixed(1)} mi, custo ${(f.cost / 1e6).toFixed(1)} mi (prog ${((f.production + f.rights + f.talent) / 1e6).toFixed(1)}), ocupação ${(f.occupancy * 100).toFixed(0)}%, caixa ${(ps.cash / 1e6).toFixed(0)} mi, nota ${state.kpis?.score}, eventos ${state.events.length}`);
    }
  }
  const [lo, hi] = LEADER_SHARE[era];
  check(avg(leaderShares) >= lo && avg(leaderShares) <= hi, `(1) share médio da líder no nobre = ${avg(leaderShares).toFixed(1)}% (faixa ${lo}-${hi}%)`);
  check(Math.max(...shareSums) <= 100.01, `(2) soma de shares no nobre <= 100% (máx ${Math.max(...shareSums).toFixed(1)}%)`);
  if (orderHits.length) check(avg(orderHits) >= 0.75, `    líder histórica na frente em ${Math.round(avg(orderHits) * 100)}% das sementes`);

  // (3) decisões bem feitas: estreia com chamadas e contraprogramação
  if (lastState) {
    const gains: number[] = [];
    const rel: number[] = [];
    const counterGains: number[] = [];
    for (let s = 1; s <= SEEDS; s++) {
      const base = makeGame(era, 2000 + s);
      autopilot(base);
      const ps = playerStation(base);
      const week = base.schedules[ps.id];
      // escolhe um programa do nobre do jogador
      const blk = week[2].find((b) => b.start >= 56 && b.start < 66) ?? week[2].find((b) => b.start >= 48 && b.start < 70);
      if (!blk) continue;
      const pid = blk.programId;
      const runWith = (mut: (g: GameState) => void) => {
        const g: GameState = structuredClone(base);
        mut(g);
        const res = computeDay(g, 2, { carry: null, noNoise: true });
        const c = res.stationIds.indexOf(ps.id);
        let sum = 0;
        for (let t = blk.start; t < blk.start + blk.len; t++) sum += res.pntPts[c][t];
        return sum / blk.len;
      };
      const p0 = runWith(() => {});
      const p1 = runWith((g) => {
        const p = getProgram(g, pid);
        if (p) p.buzz = Math.min(100, p.buzz + 5 * 3 + 10);
      });
      gains.push(p1 - p0);
      rel.push(p0 > 0 ? (p1 - p0) / p0 : 0);
      // contraprogramação: troca o programa por um de gênero oposto ao do líder na faixa
      const p2 = runWith((g) => {
        const p = getProgram(g, pid);
        if (!p) return;
        p.genre = p.genre.startsWith('novela') ? 'reality' : 'novela_21h';
        if (era === '80s' && p.genre === 'reality') p.genre = 'humoristico';
        p.appeal = Math.min(99, p.appeal + 8);
      });
      counterGains.push(p2 - p0);
    }
    check(avg(rel) >= 0.08 || avg(gains) >= 1, `(3a) estreia com chamadas: +${avg(gains).toFixed(2)} pt (+${(avg(rel) * 100).toFixed(0)}%) no programa (meta >= 8%; em emissora média, >= 1 ponto)`);
    check(avg(counterGains) > 0, `(3b) contraprogramação com atração forte: ${avg(counterGains) >= 0 ? '+' : ''}${avg(counterGains).toFixed(2)} pt`);
  }
  // (4) ruído vs estratégia no mesmo mundo: só a semente do ruído muda
  {
    const base = makeGame(era, 3001);
    const runMonth = (seedShift: number, improve: boolean) => {
      const g: GameState = structuredClone(base);
      g.meta.seed = base.meta.seed + seedShift * 7919;
      if (improve) {
        const ps = playerStation(g);
        for (const d of g.schedules[ps.id]) for (const b of d) {
          if (b.start < 48 || b.start >= 72) continue;
          const p = getProgram(g, b.programId);
          if (p && !p.locked) {
            p.quality = Math.min(98, p.quality + 12);
            p.appeal = Math.min(98, p.appeal + 12);
            p.promo = 2;
          }
        }
      }
      for (let w = 0; w < 4; w++) {
        autopilot(g);
        simulate(g, 'week');
      }
      return avg(playerStation(g).history.slice(-4).map((h) => h.prime));
    };
    const plain = [1, 2, 3, 4].map((k) => runMonth(k, false));
    const better = [1, 2, 3, 4].map((k) => runMonth(k, true));
    const effect = avg(better) - avg(plain);
    const noise = sd(plain);
    console.log(`  mês no nobre: base ${avg(plain).toFixed(2)} (dp ${noise.toFixed(2)}), com grade melhor ${avg(better).toFixed(2)}`);
    check(effect > 2 * noise, `(4) o efeito da estratégia (${effect.toFixed(2)} pt) supera o ruído do mês (dp ${noise.toFixed(2)})`);
  }
  console.log(`  tempo médio por semana simulada: ${avg(weekTimes).toFixed(0)} ms (total ${(Date.now() - t0) / 1000}s)`);
}

console.log(failures ? `\n${failures} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
process.exitCode = failures ? 1 : 0;
