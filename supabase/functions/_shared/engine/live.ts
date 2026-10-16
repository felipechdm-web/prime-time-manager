// Curvas minuto a minuto (seção 9.6), momentos ao vivo e Sala de Controle.

import { computeDay } from './audience.ts';
import { GENRES } from './catalog/genres.ts';
import type { CurveKind } from './catalog/genres.ts';
import { rngFor } from './rng.ts';
import { getProgram, playerStation } from './state.ts';
import type { GameState, LiveMoment } from './types.ts';
import { addDays, COPAS, copaMatches, slotClockMinutes, yearOf } from './time.ts';
import { brazilMaxStage, hasCopaRights, programAirings, copaProgramId } from './schedule.ts';

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
  return out.sort((a, b) => a.day - b.day).slice(0, 2);
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
  const minutesTotal = moment.len * 15;
  const stations = res.stationIds.map((sid, c) => {
    const st = state.stations.find((s) => s.id === sid)!;
    const progId = res.slotPrograms[c][moment.startSlot] ?? '';
    const prog = progId ? getProgram(state, progId) : undefined;
    return { id: sid, name: st.name, color: st.color, program: prog?.title ?? '—', curve: minuteCurve(prog ? GENRES[prog.genre].curve : 'flat', minutesTotal, state.meta.seed + c), c };
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
  const brk = breakMinutes(kind, minutesTotal);
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
    len: moment.len,
    minutes,
    stations: stations.map(({ id, name, color, program }) => ({ id, name, color, program })),
    breaks: brk,
    decisionPoints: dps,
    playerStationId: ps.id,
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
