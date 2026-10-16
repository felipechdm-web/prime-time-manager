// Montagem do boletim semanal/diário a partir dos acumuladores da semana.

import { GENRES } from './catalog/genres.ts';
import { MARKETS } from './catalog/markets.ts';
import { programAirings } from './schedule.ts';
import { activeStations, getProgram, playerStation } from './state.ts';
import type { BandId, BandRanking, DayType, GameState, ProgramResult, WeekReport } from './types.ts';
import { addDays, BANDS, DAY_SHORT, slotLabel } from './time.ts';

export const PA = { PTS: 0, SHARE: 1, N: 2, PEAK: 3, MIN: 4, RANK: 5, MK: 6 };

export function slotLabelFor(state: GameState, programId: string): string {
  const p = getProgram(state, programId);
  if (!p) return '';
  const week = state.schedules[p.stationId];
  if (!week) return '';
  const airs = programAirings(week, programId);
  if (!airs.length) return 'fora da grade';
  const byStart = new Map<number, number[]>();
  for (const a of airs) {
    const arr = byStart.get(a.start) ?? [];
    if (!arr.includes(a.day)) arr.push(a.day);
    byStart.set(a.start, arr);
  }
  const parts: string[] = [];
  for (const [start, days] of [...byStart.entries()].sort((a, b) => b[1].length - a[1].length)) {
    days.sort();
    let d: string;
    const key = days.join('');
    if (key === '01234') d = 'seg-sex';
    else if (key === '012345') d = 'seg-sáb';
    else if (key === '0123456') d = 'diário';
    else if (days.length === 1) d = DAY_SHORT[days[0]];
    else d = days.map((x) => DAY_SHORT[x]).join(', ');
    parts.push(`${d} ${slotLabel(start)}`);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ');
}

function delta4w(state: GameState, programId: string, pts: number): number | null {
  const p = getProgram(state, programId);
  if (!p || p.stats.length < 2) return null;
  const prev = p.stats.slice(-4);
  const avg = prev.reduce((s, x) => s + x.pts, 0) / prev.length;
  return Math.round((pts - avg) * 10) / 10;
}

export function programResultsFromAcc(state: GameState, onlyStation?: string): ProgramResult[] {
  const wp = state.weekProgress;
  const out: ProgramResult[] = [];
  for (const [pid, acc] of Object.entries(wp.progAcc)) {
    const p = getProgram(state, pid);
    if (!p || acc[PA.N] <= 0) continue;
    if (onlyStation && p.stationId !== onlyStation) continue;
    if (GENRES[p.genre].group === 'sistema' && p.genre !== 'futebol') continue;
    const n = acc[PA.N];
    const pts = acc[PA.PTS] / n;
    out.push({
      programId: pid,
      stationId: p.stationId,
      title: p.title,
      genre: p.genre,
      slotLabel: slotLabelFor(state, pid),
      pts: Math.round(pts * 10) / 10,
      share: Math.round((acc[PA.SHARE] / n) * 10) / 10,
      rank: Math.max(1, Math.round(acc[PA.RANK] / n)),
      delta4w: delta4w(state, pid, pts),
      airings: n,
      markets: MARKETS.map((_, i) => Math.round(((acc[PA.MK + i] ?? 0) / n) * 10) / 10),
    });
  }
  return out;
}

export function bandRankings(state: GameState): BandRanking[] {
  const wp = state.weekProgress;
  const stations = activeStations(state);
  const out: BandRanking[] = [];
  const compute = (band: BandId, dts: DayType[], label: DayType | 'all') => {
    const ranking = stations.map((st) => {
      let sp = 0;
      let ss = 0;
      let n = 0;
      for (const dt of dts) {
        const a = wp.bandAcc[`${st.id}|${band}|${dt}`];
        if (!a) continue;
        sp += a[0];
        ss += a[1];
        n += a[2];
      }
      return { stationId: st.id, pts: n ? Math.round((sp / n) * 10) / 10 : 0, share: n ? Math.round((ss / n) * 10) / 10 : 0 };
    }).sort((a, b) => b.pts - a.pts);
    out.push({ band, dayType: label, ranking });
  };
  for (const b of BANDS) compute(b.id, ['weekday', 'saturday', 'sunday'], 'all');
  compute('vespertino', ['sunday'], 'sunday');
  compute('nobre', ['sunday'], 'sunday');
  return out;
}

export function buildWeekReport(state: GameState, kind: 'week' | 'day', day?: number): WeekReport {
  const wp = state.weekProgress;
  const stations = activeStations(state);
  const ps = playerStation(state);
  const daysDone = kind === 'day' && day !== undefined ? [day] : [0, 1, 2, 3, 4, 5, 6].filter((d) => d < wp.day || wp.day === 0 || wp.day >= 7);
  const avgOf = (arr: number[] | undefined, ds: number[]) => {
    if (!arr) return 0;
    const vals = ds.map((d) => arr[d]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
  };
  const stations24 = stations.map((st) => ({
    stationId: st.id,
    pts: Math.round(avgOf(wp.dayAcc[st.id], daysDone) * 10) / 10,
    share: Math.round(avgOf(wp.shareAcc[st.id]?.slice(0, 7), daysDone) * 10) / 10,
  })).sort((a, b) => b.pts - a.pts);
  const stationsPrime = stations.map((st) => ({
    stationId: st.id,
    pts: Math.round(avgOf(wp.primeAcc[st.id], daysDone) * 10) / 10,
    share: Math.round(avgOf(wp.shareAcc[st.id]?.slice(7, 14), daysDone) * 10) / 10,
  })).sort((a, b) => b.pts - a.pts);
  const daily = daysDone.map((d) => ({
    day: d,
    date: addDays(state.meta.date, d),
    pts: Object.fromEntries(stations.map((st) => [st.id, Math.round((wp.dayAcc[st.id]?.[d] ?? 0) * 10) / 10])),
    prime: Object.fromEntries(stations.map((st) => [st.id, Math.round((wp.primeAcc[st.id]?.[d] ?? 0) * 10) / 10])),
  }));
  const allProgs = programResultsFromAcc(state);
  const programs = allProgs.filter((p) => p.stationId === ps.id).sort((a, b) => b.pts - a.pts);
  const topPrograms = [...allProgs].sort((a, b) => b.pts - a.pts).slice(0, 12);
  const n = Math.max(1, daysDone.length);
  const markets = MARKETS.map((m, i) => ({
    market: m.code,
    pts: Object.fromEntries(stations.map((st) => [st.id, Math.round(((wp.marketAcc[st.id]?.[i] ?? 0) / n) * 10) / 10])),
    prime: Object.fromEntries(stations.map((st) => [st.id, Math.round(((wp.marketPrimeAcc[st.id]?.[i] ?? 0) / n) * 10) / 10])),
  }));
  return {
    week: state.meta.weekIndex,
    dateFrom: state.meta.date,
    dateTo: addDays(state.meta.date, 6),
    kind,
    day,
    stations24,
    stationsPrime,
    bands: bandRankings(state),
    daily,
    programs,
    topPrograms,
    markets,
    finance: null,
    alerts: [],
    competitorMoves: [],
    records: [],
    headlines: [],
    narrative: [],
    narrated: false,
    liveAvailable: [],
    closings: [],
  };
}
