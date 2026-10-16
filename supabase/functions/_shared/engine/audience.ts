// Motor de audiência (seção 9): TLE × escolha logit multinomial × herança.
// Determinístico: depende só do estado, da grade e da semente.

import { ERAS, eraIndex } from './catalog/eras.ts';
import { GENRES, genreFit } from './catalog/genres.ts';
import { MARKETS, MARKET_WEIGHTS, SEGMENTS, segmentWeights, TLE_CURVE } from './catalog/markets.ts';
import { rngFor } from './rng.ts';
import { cloneWeek, copaSlotsForDate, dayPlanWithOverlays, slotArray } from './schedule.ts';
import { activeStations, difficultyMult, getProgram, talentStrength } from './state.ts';
import type { Block, GameState, Program, Station } from './types.ts';
import { addDays, bandOfSlot, dayCalendar, dayType, isPrimeSlot, monthOf, slotClockMinutes, SLOTS_PER_DAY } from './time.ts';

// pesos padrão da seção 9.3
export const W = { q: 0.8, a: 1.6, g: 1.0, b: 0.6, h: 0.7, f: 0.9, t: 0.5 };
const STATION_POWER_W = 0.7;
const REGIONAL_W = 1.1;
const NOISE_SCALE = 0.11;

export interface DayResult {
  date: string;
  day: number;
  stationIds: string[];
  slotPrograms: (string | null)[][]; // [estação][slot]
  marketPts: number[][][]; // [praça][estação][slot]
  marketTle: number[][]; // [praça][slot] em pontos (0-100)
  pntPts: number[][]; // [estação][slot]
  pntTle: number[];
  carry: number[][][];
  factors: Record<string, ProgramFactors>;
}

export interface ProgramFactors {
  q: number;
  a: number;
  g: number;
  b: number;
  h: number;
  f: number;
  t: number;
  station: number;
  noise: number;
  outside: number;
  slots: number;
}

export interface DayOptions {
  carry: number[][][] | null;
  liveDecisions?: { programId: string; decisions: string[] }[];
  pntOnly?: boolean; // prévia rápida (uma praça virtual)
  noiseKey?: string;
  schedules?: Record<string, Block[][]>;
  noNoise?: boolean;
}

export function lifeCurveFactor(p: Program): number {
  const g = GENRES[p.genre];
  if (!p.episodes.total) return 1;
  const x = Math.min(1.2, p.episodes.aired / p.episodes.total);
  if (g.id.startsWith('novela')) {
    if (x < 0.05) return 1.0;
    if (x < 0.25) return 0.95;
    if (x < 0.85) return 0.95 + 0.15 * ((x - 0.25) / 0.6);
    if (x < 0.97) return 1.12;
    if (x <= 1.0) return 1.3;
    return 1.0; // esticada além do planejado
  }
  if (g.id === 'reality' || g.id === 'talent_show') {
    if (x < 0.1) return 1.05;
    if (x < 0.88) return 0.97;
    if (x < 0.98) return 1.18;
    return 1.35;
  }
  if (g.id === 'serie_nacional' || g.id === 'documentario') {
    if (x < 0.1) return 1.05;
    if (x > 0.9) return 1.1;
  }
  return 1;
}

function tempModUtility(p: Program, week: number, beta: number): number {
  let u = 0;
  for (const m of p.tempMods) if (m.untilWeek >= week) u += Math.log(Math.max(0.2, m.mult)) / beta;
  return u;
}

function stationModUtility(state: GameState, st: Station, beta: number): number {
  const v = state.flags[`stmod_${st.id}`];
  const until = state.flags[`stmod_until_${st.id}`];
  if (typeof v === 'number' && typeof until === 'number' && until >= state.meta.weekIndex) return Math.log(v) / beta;
  return 0;
}

function sundayBoost(state: GameState, p: Program, day: number): number {
  if (day !== 6 || (p.genre !== 'auditorio' && p.genre !== 'game_show')) return 0;
  const st = state.stations.find((s) => s.isPlayer);
  if (!st || p.stationId !== st.id) return 0;
  let u = 0;
  const t = state.flags.domingo_turbinado;
  if (typeof t === 'number' && t > 0) u += 0.12;
  const a = state.flags.domingo_apelativo;
  if (typeof a === 'number' && a > 0) u += 0.18;
  return u;
}

// habitualidade efetiva nesta semana (mudar de horário zera o hábito na hora)
export function effectiveHabit(p: Program, currentKey: string): number {
  if (!p.habitKey || p.habitKey !== currentKey) return 0;
  return Math.min(8, p.habitWeeks) / 8;
}

export function computeDay(state: GameState, day: number, opts: DayOptions): DayResult {
  const era = ERAS[state.meta.era];
  const P = era.params;
  const beta = P.beta;
  const date = addDays(state.meta.date, day);
  const dt = dayType(day);
  const cal = dayCalendar(date);
  const month = monthOf(date);
  const weekIdx = state.meta.weekIndex;
  const stations = activeStations(state);
  const S = stations.length;
  const eIdx = eraIndex(state.meta.era);
  const noiseSd = P.noiseSd * NOISE_SCALE * difficultyMult(state, 'noise');
  const schedules = opts.schedules ?? state.schedules;

  // grade do dia por estação (com HGPE/Copa)
  const slotPrograms: (string | null)[][] = stations.map((st) =>
    dayPlanWithOverlays(state, st.id, day, schedules[st.id] ?? cloneWeek([[], [], [], [], [], [], []])),
  );

  // chaves de hábito da semana corrente
  const habitKeys = new Map<string, string>();
  for (const st of stations) {
    const week = schedules[st.id];
    if (!week) continue;
    const progs = new Set<string>();
    for (const d of week) for (const b of d) progs.add(b.programId);
    for (const id of progs) {
      const byStart = new Map<number, number[]>();
      week.forEach((dd, di) => {
        for (const b of dd) {
          if (b.programId !== id) continue;
          const arr = byStart.get(b.start) ?? [];
          if (!arr.includes(di)) arr.push(di);
          byStart.set(b.start, arr);
        }
      });
      habitKeys.set(id, [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([s0, ds]) => `${ds.sort().join('')}@${s0}`).join('|'));
    }
  }

  // utilidade base por programa no dia
  interface PU {
    base: number;
    appeal: number[]; // por segmento
    group: string;
    genre: Program['genre'];
    noise: number;
    parts: { q: number; b: number; h: number; f: number; t: number };
    appealRaw: number;
    station: number;
  }
  const puCache = new Map<string, PU>();
  const powerW = STATION_POWER_W * (1 - 0.1 * eIdx);
  const stationTermBase = stations.map((st) => powerW * st.power + (st.brand - 1) * 0.8 + (st.kind === 'pay' ? Math.log(Math.max(0.01, st.reach)) : 0) + stationModUtility(state, st, beta));

  const live = new Map<string, string[]>();
  for (const l of opts.liveDecisions ?? []) live.set(l.programId, l.decisions);

  function programUtility(pid: string, stIdx: number): PU {
    const key = `${pid}|${stIdx}`;
    const cached = puCache.get(key);
    if (cached) return cached;
    const p = getProgram(state, pid);
    let pu: PU;
    if (!p) {
      pu = { base: -1, appeal: SEGMENTS.map(() => 0), group: 'sistema', genre: 'tapa_buraco', noise: 0, parts: { q: 0, b: 0, h: 0, f: 0, t: 0 }, appealRaw: 0, station: stationTermBase[stIdx] };
    } else {
      const g = GENRES[p.genre];
      const q = W.q * Math.max(0, p.quality / 100 - 0.04 * p.merchLevel);
      const b = W.b * (p.buzz / 100);
      const h = W.h * effectiveHabit(p, habitKeys.get(pid) ?? '');
      const f = W.f * (p.fatigue / 100);
      const t = W.t * talentStrength(state, p) + (p.talentIds.length === 0 && p.flags.rivalTalent ? W.t * Number(p.flags.rivalTalent) : 0);
      const rng = rngFor(state.meta.seed, 'noise', opts.noiseKey ?? '', weekIdx, day, pid);
      const rngW = rngFor(state.meta.seed, 'wnoise', opts.noiseKey ?? '', weekIdx, pid);
      const noise = opts.noNoise ? 0 : rng.normal(0, noiseSd) + rngW.normal(0, noiseSd * 0.55);
      let mods = tempModUtility(p, weekIdx, beta) + sundayBoost(state, p, day);
      if (p.liveBoost) mods += p.liveBoost;
      const appealRaw = (p.appeal / 100) * lifeCurveFactor(p);
      const appeal = SEGMENTS.map((s) => W.a * appealRaw * p.profile[s]);
      pu = { base: q + b + h - f + t + noise + mods, appeal, group: g.group, genre: p.genre, noise, parts: { q, b, h, f, t }, appealRaw, station: stationTermBase[stIdx] };
    }
    puCache.set(key, pu);
    return pu;
  }

  // ajuste de decisões ao vivo (sala de controle)
  function liveAdj(pid: string, slot: number, startSlot: number, endSlot: number): number {
    const d = live.get(pid);
    if (!d) return 0;
    let u = 0;
    for (const dec of d) {
      if (dec === 'segurar_intervalo') u += Math.log(1.04) / beta;
      if (dec === 'esticar_bloco' && slot >= endSlot - 1) u += Math.log(1.08) / beta;
      if (dec === 'chamada_proximo' && slot >= endSlot - 1) u -= Math.log(1.01) / beta;
      if (dec === 'plantao' && slot === startSlot + 2) u -= Math.log(1.06) / beta;
    }
    return u;
  }

  // fronteiras de cada bloco por estação (para ajustes ao vivo)
  const blockBounds: Map<string, [number, number]>[] = slotPrograms.map((slots) => {
    const m = new Map<string, [number, number]>();
    slots.forEach((id, s) => {
      if (!id) return;
      const cur = m.get(id);
      if (!cur) m.set(id, [s, s + 1]);
      else cur[1] = s + 1;
    });
    return m;
  });

  // curva de TLE do dia
  const curve = TLE_CURVE[dt];
  const copa = copaSlotsForDate(state, date);
  const copaMult: number[] = new Array(SLOTS_PER_DAY).fill(0);
  for (const c of copa) {
    const peak = c.stage >= 7 ? 1.25 : c.stage >= 5 ? 1.15 : 1.05;
    for (let i = 0; i < 9; i++) if (c.slot + i < SLOTS_PER_DAY) copaMult[c.slot + i] = Math.max(copaMult[c.slot + i], peak);
  }
  const pIdx = playerIdx(stations);
  let playerTleMod = 1;
  const tleFlag = state.flags.tle_mult;
  if (typeof tleFlag === 'number' && Number(state.flags.tle_until ?? -1) >= weekIdx) playerTleMod = tleFlag;

  const marketsIdx = opts.pntOnly ? [-1] : MARKETS.map((_, i) => i);
  const segCount = SEGMENTS.length;
  const marketPts: number[][][] = [];
  const marketTle: number[][] = [];
  const pntPts: number[][] = stations.map(() => new Array(SLOTS_PER_DAY).fill(0));
  const pntTle: number[] = new Array(SLOTS_PER_DAY).fill(0);
  const carryOut: number[][][] = [];
  const factors: Record<string, ProgramFactors> = {};

  const A0base = P.outsideUtil;
  const outsideSeg = SEGMENTS.map((s) => {
    if (s.startsWith('jovem')) return P.youngOutside;
    if (s === 'criancas') return P.youngOutside * 0.6;
    if (s === 'adulto_ab') return P.youngOutside * 0.4;
    if (s.startsWith('maduro')) return -0.25;
    return P.youngOutside * 0.2;
  });
  const rIn = 0.82 - 0.02 * eIdx;
  const rBase = P.retentionBase;

  for (const mIdx of marketsIdx) {
    const mk = mIdx >= 0 ? MARKETS[mIdx] : null;
    const abIndex = mk ? mk.abIndex : 1;
    const lunch = mk ? mk.lunchBoost : 1;
    const stTerm = stations.map((st, i) => {
      const reg = mk ? st.regional[mIdx] ?? 1 : st.regional.reduce((a, v, j) => a + v * MARKET_WEIGHTS[j], 0);
      return stationTermBase[i] + REGIONAL_W * (reg - 1);
    });
    const marketNoise = stations.map((st) => (opts.noNoise || !mk ? 0 : rngFor(state.meta.seed, 'mnoise', weekIdx, day, st.id, mIdx).normal(0, noiseSd * 0.45)));
    // V[c][s]
    let V: number[][];
    const carryIn = opts.carry && mIdx >= 0 ? opts.carry[mIdx] : opts.carry && mIdx < 0 ? opts.carry[0] : null;
    const havePrev = !!carryIn && carryIn.length === S + 1;
    V = havePrev ? carryIn!.map((r) => r.slice()) : stations.map(() => new Array(segCount).fill(0)).concat([new Array(segCount).fill(0)]);
    const ptsM: number[][] = stations.map(() => new Array(SLOTS_PER_DAY).fill(0));
    const tleM: number[] = new Array(SLOTS_PER_DAY).fill(0);
    const expU = new Array(S + 1).fill(0);

    for (let t = 0; t < SLOTS_PER_DAY; t++) {
      const band = bandOfSlot(t);
      const hour = Math.floor(slotClockMinutes(t) / 60);
      let tle = P.tlePrime * curve[t] * cal.tleMult * (1 - P.digitalEscape);
      if (band === 'meio_dia') tle *= lunch;
      if (isPrimeSlot(t)) tle *= cal.primeMult;
      if (copaMult[t] > 0) tle = Math.max(tle, P.tlePrime * (1 - P.digitalEscape) * 0.95) * copaMult[t];
      tle = Math.min(0.92, tle);
      tleM[t] = tle * 100;
      const segW = segmentWeights(hour, dt, P.kidsTV, abIndex);
      const first = t === 0 && !havePrev;
      for (let s = 0; s < segCount; s++) {
        const tleS = tle * segW[s];
        let sumExp = 0;
        for (let c = 0; c < S; c++) {
          const pid = slotPrograms[c][t];
          let u: number;
          if (!pid) {
            u = -1.2 + stTerm[c];
          } else {
            const pu = programUtility(pid, c);
            const fit = W.g * genreFit(pu.genre, band, dt);
            u = pu.base + pu.appeal[s] + fit + stTerm[c] + marketNoise[c];
            if (live.size) {
              const bb = blockBounds[c].get(pid);
              if (bb) u += liveAdj(pid, t, bb[0], bb[1]);
            }
            if (c === pIdx && playerTleMod !== 1) u += Math.log(playerTleMod) / beta;
          }
          const e = Math.exp(beta * u);
          expU[c] = e;
          sumExp += e;
        }
        const e0 = Math.exp(beta * (A0base + outsideSeg[s]));
        expU[S] = e0;
        sumExp += e0;
        let total = 0;
        for (let c = 0; c <= S; c++) {
          const pi = expU[c] / sumExp;
          let r: number;
          if (first) r = 0;
          else if (c === S) r = 0.6;
          else {
            const cur = slotPrograms[c][t];
            const prev = t > 0 ? slotPrograms[c][t - 1] : null;
            if (!cur) r = 0.2;
            else if (cur === prev || (t === 0 && havePrev)) r = rIn;
            else {
              const g1 = prev ? programUtility(prev, c).group : '';
              const g2 = programUtility(cur, c).group;
              r = rBase + (g1 && g1 === g2 ? 0.08 : 0);
            }
          }
          const v = r * V[c][s] + (1 - r) * pi * tleS;
          V[c][s] = v;
          total += v;
        }
        const scale = total > 0 ? tleS / total : 0;
        for (let c = 0; c <= S; c++) {
          V[c][s] *= scale;
          if (c < S) ptsM[c][t] += V[c][s] * 100;
        }
      }
    }
    const weight = mIdx >= 0 ? MARKET_WEIGHTS[mIdx] : 1;
    for (let c = 0; c < S; c++) for (let t = 0; t < SLOTS_PER_DAY; t++) pntPts[c][t] += ptsM[c][t] * weight;
    for (let t = 0; t < SLOTS_PER_DAY; t++) pntTle[t] += tleM[t] * weight;
    marketPts.push(ptsM);
    marketTle.push(tleM);
    carryOut.push(V);
  }

  // fatores explicativos por programa (média nos slots, segmento ponderado no PNT)
  stations.forEach((st, c) => {
    const slots = slotPrograms[c];
    for (let t = 0; t < SLOTS_PER_DAY; t++) {
      const pid = slots[t];
      if (!pid) continue;
      const pu = programUtility(pid, c);
      const band = bandOfSlot(t);
      const hour = Math.floor(slotClockMinutes(t) / 60);
      const segW = segmentWeights(hour, dt, P.kidsTV, 1);
      let a = 0;
      let out = 0;
      for (let s = 0; s < segCount; s++) {
        a += pu.appeal[s] * segW[s];
        out += (A0base + outsideSeg[s]) * segW[s];
      }
      const f = factors[pid] ?? { q: 0, a: 0, g: 0, b: 0, h: 0, f: 0, t: 0, station: 0, noise: 0, outside: 0, slots: 0 };
      f.q += pu.parts.q;
      f.a += a;
      f.g += W.g * genreFit(pu.genre, band, dt);
      f.b += pu.parts.b;
      f.h += pu.parts.h;
      f.f += pu.parts.f;
      f.t += pu.parts.t;
      f.station += pu.station;
      f.noise += pu.noise;
      f.outside += out;
      f.slots += 1;
      factors[pid] = f;
    }
  });

  return {
    date,
    day,
    stationIds: stations.map((s) => s.id),
    slotPrograms,
    marketPts,
    marketTle,
    pntPts,
    pntTle,
    carry: carryOut,
    factors,
  };
}

function playerIdx(stations: Station[]): number {
  return stations.findIndex((s) => s.isPlayer);
}

// agrega por bloco de programa: média de pontos e share de cada exibição no dia
export interface Airing {
  stationId: string;
  programId: string;
  start: number;
  len: number;
  pts: number; // PNT
  share: number;
  peak: number;
  min: number;
  marketPts: number[];
}

export function airingsOfDay(res: DayResult): Airing[] {
  const out: Airing[] = [];
  res.stationIds.forEach((sid, c) => {
    const slots = res.slotPrograms[c];
    let t = 0;
    while (t < SLOTS_PER_DAY) {
      const pid = slots[t];
      if (!pid) {
        t++;
        continue;
      }
      let e = t;
      while (e < SLOTS_PER_DAY && slots[e] === pid) e++;
      let sum = 0;
      let sumTle = 0;
      let peak = 0;
      let min = Infinity;
      for (let k = t; k < e; k++) {
        sum += res.pntPts[c][k];
        sumTle += res.pntTle[k];
        peak = Math.max(peak, res.pntPts[c][k]);
        min = Math.min(min, res.pntPts[c][k]);
      }
      const n = e - t;
      const marketPts = res.marketPts.map((m) => {
        let s2 = 0;
        for (let k = t; k < e; k++) s2 += m[c][k];
        return s2 / n;
      });
      out.push({ stationId: sid, programId: pid, start: t, len: n, pts: sum / n, share: sumTle > 0 ? (sum / sumTle) * 100 : 0, peak, min, marketPts });
      t = e;
    }
  });
  return out;
}

export function emptySlotsCount(week: Block[][]): number {
  let n = 0;
  for (const d of week) n += slotArray(d).filter((x) => !x).length;
  return n;
}
