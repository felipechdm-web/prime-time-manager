// Curvas minuto a minuto (seção 9.6), momentos ao vivo e Sala de Controle.

import { computeDay } from './audience.ts';
import { GENRES } from './catalog/genres.ts';
import type { CurveKind } from './catalog/genres.ts';
import { rngFor } from './rng.ts';
import { getProgram, playerStation } from './state.ts';
import type { GameState, LiveMoment } from './types.ts';
import { addDays, COPAS, copaMatches, slotClockMinutes, yearOf } from './time.ts';
import { brazilMaxStage, hasCopaRights, programAirings, copaProgramId } from './schedule.ts';
import { competitionOf, fixtureByCode, matchEvents, matchTitle, teamName } from './sports.ts';
import { sportsProgramIds } from './sportsTv.ts';

// curva normalizada (média ~1) para um programa de N minutos
export function minuteCurve(kind: CurveKind, minutes: number, seed: number): number[] {
  const rng = rngFor(seed, 'curve', kind, minutes);
  const c: number[] = [];
  const breakEvery = minutes >= 90 ? 25 : 15;
  for (let m = 0; m < minutes; m++) {
    const x = m / Math.max(1, minutes - 1);
    let v = 1;
    switch (kind) {
      case 'novela':
        v = 0.9 + 0.08 * x + (m >= minutes - 10 ? 0.14 * ((m - (minutes - 10)) / 10) : 0);
        break;
      case 'futebol': {
        if (m < 10) v = 0.78 + m * 0.02;
        else if (m < 55) v = 1.0 + 0.04 * Math.sin(m / 3);
        else if (m < 70) v = 0.84;
        else if (m < minutes - 10) v = 1.04 + 0.06 * ((m - 70) / Math.max(1, minutes - 80));
        else v = 0.9;
        break;
      }
      case 'auditorio':
        v = 0.92 + 0.13 * Math.max(0, Math.sin((m / Math.max(30, minutes / 3)) * Math.PI));
        break;
      case 'jornal':
        v = 0.97 + 0.05 * x;
        break;
      case 'reality':
        v = 0.9 + 0.1 * x + (m >= minutes - 8 ? 0.15 : 0);
        break;
      case 'filme':
        v = 0.9 + 0.12 * Math.min(1, x * 1.6);
        break;
      default:
        v = 1;
    }
    // intervalos comerciais: queda proporcional
    const inBreak = m > 5 && m < minutes - 3 && m % breakEvery >= breakEvery - 3;
    if (inBreak && kind !== 'futebol') v *= 0.86;
    v *= 1 + rng.normal(0, 0.012);
    c.push(v);
  }
  const mean = c.reduce((s, x) => s + x, 0) / c.length;
  return c.map((x) => x / mean);
}

export function breakMinutes(kind: CurveKind, minutes: number): number[] {
  const breakEvery = minutes >= 90 ? 25 : 15;
  const out: number[] = [];
  for (let m = 6; m < minutes - 3; m++) if (m % breakEvery === breakEvery - 3) out.push(m);
  if (kind === 'futebol') return [55];
  return out;
}

// momentos que podem abrir a Sala de Controle nesta semana
export function computeLiveMoments(state: GameState): LiveMoment[] {
  const ps = playerStation(state);
  const week = state.schedules[ps.id];
  const out: LiveMoment[] = [];
  const seen = new Set<string>();
  // esporte real: cada transmissão do jogador é um momento ao vivo (o jogo vem antes dos outros momentos)
  const sports: LiveMoment[] = [];
  for (const w of state.sports?.windowsWeek === state.meta.weekIndex ? state.sports.windows ?? [] : []) {
    if (w.station !== ps.id || w.skipped) continue;
    const f = fixtureByCode(state, w.main);
    if (!f) continue;
    sports.push({ day: w.day, programId: sportsProgramIds(ps.id, w.main).match, stationId: ps.id, reason: matchTitle(state, f), startSlot: w.start, len: f.slots, done: false, sport: true });
  }
  // Copa
  for (let d = 0; d < 7; d++) {
    const date = addDays(state.meta.date, d);
    const y = yearOf(date);
    if (COPAS[y] && hasCopaRights(state, ps.id, y)) {
      for (const m of copaMatches(y, brazilMaxStage(state, y))) {
        if (m.date === date) out.push({ day: d, programId: copaProgramId(ps.id, y), stationId: ps.id, reason: `Copa do Mundo: ${m.label}`, startSlot: m.slot, len: 9, done: false });
      }
    }
  }
  for (const p of state.programs) {
    if (p.stationId !== ps.id || seen.has(p.id)) continue;
    if (p.status !== 'on_air' && p.status !== 'ready') continue;
    const airs = programAirings(week, p.id);
    if (!airs.length) continue;
    // estreia
    if (p.stats.length === 0 && p.premiereWeek === null && GENRES[p.genre].group !== 'sistema' && p.origin !== 'leased') {
      const a = airs[0];
      out.push({ day: a.day, programId: p.id, stationId: ps.id, reason: `Estreia de "${p.title}"`, startSlot: a.start, len: a.len, done: false });
      seen.add(p.id);
      continue;
    }
    // final
    if (p.episodes.total && !p.isRerun) {
      const left = p.episodes.total - p.episodes.aired;
      if (left > 0 && left <= airs.length) {
        const a = airs[left - 1];
        out.push({ day: a.day, programId: p.id, stationId: ps.id, reason: `Último capítulo de "${p.title}"`, startSlot: a.start, len: a.len, done: false });
        seen.add(p.id);
      }
    }
  }
  if (out.length < 1) {
    // futebol ou guerra do domingo
    const sunday = week[6].find((b) => {
      const p = getProgram(state, b.programId);
      return p && (p.genre === 'auditorio' || p.genre === 'futebol') && slotClockMinutes(b.start) >= 13 * 60 && slotClockMinutes(b.start) < 18 * 60;
    });
    if (sunday) {
      const p = getProgram(state, sunday.programId)!;
      out.push({ day: 6, programId: p.id, stationId: ps.id, reason: p.genre === 'futebol' ? `Futebol de domingo: "${p.title}"` : `Guerra do domingo: "${p.title}"`, startSlot: sunday.start, len: sunday.len, done: false });
    }
  }
  const others = out.sort((a, b) => a.day - b.day).slice(0, 2);
  if (!sports.length) return others;
  const sportDays = new Set(sports.map((m) => m.day));
  return [...sports.sort((a, b) => a.day - b.day || a.startSlot - b.startSlot), ...others.filter((m) => !sportDays.has(m.day))].sort((a, b) => a.day - b.day).slice(0, 5);
}

// ===== jogo ao vivo: lances do motor viram picos no minuto a minuto (seção 8C.4) =====
export interface LivePlay { minute: number; kind: string; text: string; score: [number, number] }
export interface LiveMatch { home: string; away: string; competition: string; phase: string; score: number[]; plays: LivePlay[]; regional: boolean }

// minuto do jogo -> minuto da transmissão (15 min de intervalo; 5 min antes da prorrogação)
function broadcastMinute(x: number): number {
  if (x <= 45) return x;
  if (x <= 90) return x + 15;
  return x + 20;
}

const PLAY_AMP: Record<string, number> = { gol: 0.08, gol_penalti: 0.08, virada: 0.1, penaltis: 0.18, polemica: 0.04, expulsao: 0.03, penalti_perdido: 0.04, fim_prorrogacao: 0.05 };

function matchLive(state: GameState, programId: string, minutes: number): { curve: number[]; rivalCurve: number[]; match: LiveMatch } | null {
  const p = getProgram(state, programId);
  const code = p && !p.flags.sportsRole ? p.flags.fixture : null;
  const f = typeof code === 'string' ? fixtureByCode(state, code) : null;
  if (!f || !f.away) return null;
  const events = f.score ? matchEvents(state, f) : [];
  const plays: LivePlay[] = [];
  let h = 0;
  let a = 0;
  for (const e of events) {
    if (e.kind === 'gol' || e.kind === 'gol_penalti') { if (e.team === 'home') h++; else a++; }
    const m = Math.min(minutes - 1, broadcastMinute(e.minute));
    plays.push({ minute: m, kind: e.kind, text: e.text, score: [h, a] });
  }
  // curva do jogo: abertura, 1º tempo, intervalo, 2º tempo crescendo, prorrogação e pênaltis
  const rng = rngFor(state.meta.seed, 'curva_jogo', f.code);
  const base: number[] = [];
  for (let m = 0; m < minutes; m++) {
    let v = m < 8 ? 0.85 + m * 0.02 : m < 45 ? 1 : m < 60 ? 0.84 : m < 105 ? 1.02 + 0.06 * ((m - 60) / 45) : 1.12;
    v *= 1 + rng.normal(0, 0.01);
    base.push(v);
  }
  const boost = new Array(minutes).fill(0);
  for (const pl of plays) {
    let amp = PLAY_AMP[pl.kind] ?? 0;
    if ((pl.kind === 'gol' || pl.kind === 'gol_penalti') && pl.minute >= 95) amp += 0.04; // gol no fim do jogo
    for (let m = pl.minute; m < minutes; m++) boost[m] += amp * Math.exp(-(m - pl.minute) / 5);
  }
  const raw = base.map((v, m) => v * (1 + boost[m]));
  const mean = raw.reduce((s, x) => s + x, 0) / raw.length;
  const curve = raw.map((x) => x / mean);
  const rivalCurve = boost.map((b) => 1 - 0.3 * b); // quando o jogo pega fogo, os rivais perdem um pouco
  const comp = competitionOf(state, f.comp);
  const fixtures = typeof p!.flags.fixtures === 'string' ? String(p!.flags.fixtures).split('|').filter(Boolean) : [];
  return {
    curve, rivalCurve,
    match: { home: teamName(state, f.home), away: teamName(state, f.away), competition: comp?.name ?? '', phase: f.phaseName, score: f.score ?? [], plays, regional: new Set(fixtures).size > 1 },
  };
}

export interface LiveSeries {
  programId: string;
  title: string;
  genre: string;
  day: number;
  date: string;
  startSlot: number;
  len: number;
  minutes: { m: number; clock: string; values: Record<string, number> }[];
  stations: { id: string; name: string; color: string; program: string }[];
  breaks: number[];
  decisionPoints: { minute: number; options: { id: string; label: string; hint: string }[] }[];
  playerStationId: string;
  match?: LiveMatch; // jogo do esporte real: placar e lances calculados pelo motor
}

export const LIVE_OPTIONS = [
  { id: 'segurar_intervalo', label: 'Segurar o intervalo', hint: 'audiência sobe um pouco, receita do bloco cai' },
  { id: 'esticar_bloco', label: 'Esticar o bloco final', hint: 'segura o público no fim; o próximo programa começa mais tarde' },
  { id: 'chamada_proximo', label: 'Entrar com chamada do próximo', hint: 'buzz para o próximo programa; perde um pouco agora' },
  { id: 'plantao', label: 'Chamar plantão jornalístico', hint: 'credibilidade e Jornalismo ganham; audiência oscila' },
];

export function liveProjection(state: GameState, moment: LiveMoment): LiveSeries {
  const wp = state.weekProgress;
  const res = computeDay(state, moment.day, { carry: wp.day === moment.day ? wp.carry : null });
  const ps = playerStation(state);
  const p = getProgram(state, moment.programId);
  const kind = p ? GENRES[p.genre].curve : 'flat';
  // jogo com prorrogação ou pênaltis dura mais do que o previsto no começo da semana
  const fx = p && typeof p.flags.fixture === 'string' && !p.flags.sportsRole ? fixtureByCode(state, p.flags.fixture) : null;
  const len = fx ? fx.slots + (fx.score && fx.score.length >= 4 && fx.score[2] >= 0 ? 1 : 0) : moment.len;
  const minutesTotal = len * 15;
  const ml = matchLive(state, moment.programId, minutesTotal);
  const stations = res.stationIds.map((sid, c) => {
    const st = state.stations.find((s) => s.id === sid)!;
    const progId = res.slotPrograms[c][moment.startSlot] ?? '';
    const prog = progId ? getProgram(state, progId) : undefined;
    let curve = minuteCurve(prog ? GENRES[prog.genre].curve : 'flat', minutesTotal, state.meta.seed + c);
    if (ml) curve = sid === ps.id ? ml.curve : curve.map((v, m) => v * ml.rivalCurve[m]);
    return { id: sid, name: st.name, color: st.color, program: prog?.title ?? '—', curve, c };
  });
  const minutes: LiveSeries['minutes'] = [];
  for (let m = 0; m < minutesTotal; m++) {
    const slot = moment.startSlot + Math.floor(m / 15);
    const values: Record<string, number> = {};
    for (const s of stations) {
      const base = res.pntPts[s.c][Math.min(95, slot)];
      values[s.id] = Math.round(base * s.curve[m] * 100) / 100;
    }
    const clockMin = slotClockMinutes(moment.startSlot) + m;
    const hh = Math.floor(clockMin / 60) % 24;
    const mm = clockMin % 60;
    minutes.push({ m, clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, values });
  }
  const brk = ml ? [45] : breakMinutes(kind, minutesTotal);
  const dps: LiveSeries['decisionPoints'] = [];
  const firstBreak = brk[0] ?? Math.floor(minutesTotal / 3);
  dps.push({ minute: Math.max(2, firstBreak - 2), options: LIVE_OPTIONS.filter((o) => o.id === 'segurar_intervalo' || o.id === 'plantao') });
  dps.push({ minute: Math.max(firstBreak + 2, minutesTotal - 12), options: LIVE_OPTIONS.filter((o) => o.id === 'esticar_bloco' || o.id === 'chamada_proximo') });
  return {
    programId: moment.programId,
    title: p?.title ?? 'Transmissão',
    genre: p?.genre ?? 'futebol',
    day: moment.day,
    date: addDays(state.meta.date, moment.day),
    startSlot: moment.startSlot,
    len,
    minutes,
    stations: stations.map(({ id, name, color, program }) => ({ id, name, color, program })),
    breaks: brk,
    decisionPoints: dps,
    playerStationId: ps.id,
    ...(ml ? { match: ml.match } : {}),
  };
}

// efeito visual aproximado das decisões (o número oficial vem do motor)
export function applyLiveDecisionToValue(decisions: string[], minute: number, total: number, value: number): number {
  let v = value;
  for (const d of decisions) {
    if (d === 'segurar_intervalo') v *= 1.035;
    if (d === 'esticar_bloco' && minute >= total - 15) v *= 1.07;
    if (d === 'chamada_proximo' && minute >= total - 15) v *= 0.99;
    if (d === 'plantao' && minute >= 30 && minute < 36) v *= 0.95;
  }
  return v;
}
