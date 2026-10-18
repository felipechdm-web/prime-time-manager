// Manipulação da grade: blocos, encaixe, sobreposições obrigatórias (HGPE, Copa) e hábito.

import { GENRES } from './catalog/genres.ts';
import { getProgram, nextId } from './state.ts';
import type { Block, GameState, Program } from './types.ts';
import { addDays, copaMatches, COPAS, inHgpe, SLOTS_PER_DAY, yearOf } from './time.ts';
import { sportsDayPlan } from './sportsTv.ts';

export function emptyWeek(): Block[][] {
  return [[], [], [], [], [], [], []];
}

export function cloneWeek(w: Block[][]): Block[][] {
  return w.map((d) => d.map((b) => ({ ...b })));
}

export function slotArray(day: Block[]): (string | null)[] {
  const arr: (string | null)[] = new Array(SLOTS_PER_DAY).fill(null);
  for (const b of day) {
    for (let i = 0; i < b.len; i++) {
      const s = b.start + i;
      if (s >= 0 && s < SLOTS_PER_DAY) arr[s] = b.programId;
    }
  }
  return arr;
}

export function blocksFromSlots(slots: (string | null)[]): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (let s = 0; s < slots.length; s++) {
    const id = slots[s];
    if (cur && id === cur.programId) {
      cur.len++;
    } else {
      if (cur) out.push(cur);
      cur = id ? { programId: id, start: s, len: 1 } : null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// coloca um bloco substituindo o que estiver por baixo (programas cortados são divididos)
export function placeBlock(day: Block[], programId: string, start: number, len: number): Block[] {
  const slots = slotArray(day);
  const end = Math.min(SLOTS_PER_DAY, start + len);
  for (let s = Math.max(0, start); s < end; s++) slots[s] = programId;
  return blocksFromSlots(slots);
}

export function clearRange(day: Block[], start: number, len: number): Block[] {
  const slots = slotArray(day);
  for (let s = start; s < Math.min(SLOTS_PER_DAY, start + len); s++) slots[s] = null;
  return blocksFromSlots(slots);
}

export function blockAt(day: Block[], slot: number): Block | null {
  return day.find((b) => slot >= b.start && slot < b.start + b.len) ?? null;
}

export function programAirings(week: Block[][], programId: string): { day: number; start: number; len: number }[] {
  const out: { day: number; start: number; len: number }[] = [];
  week.forEach((d, day) => {
    for (const b of d) if (b.programId === programId) out.push({ day, start: b.start, len: b.len });
  });
  return out;
}

export function programsInWeek(week: Block[][]): Set<string> {
  const s = new Set<string>();
  for (const d of week) for (const b of d) s.add(b.programId);
  return s;
}

// assinatura do horário (dias + início) usada para medir hábito
export function habitKeyFor(week: Block[][], programId: string): string {
  const byStart = new Map<number, number[]>();
  week.forEach((d, day) => {
    for (const b of d) {
      if (b.programId !== programId) continue;
      const arr = byStart.get(b.start) ?? [];
      if (!arr.includes(day)) arr.push(day);
      byStart.set(b.start, arr);
    }
  });
  const parts = [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([st, days]) => `${days.sort().join('')}@${st}`);
  return parts.join('|');
}

export function isHorizontal(week: Block[][], programId: string): boolean {
  let count = 0;
  for (let d = 0; d < 5; d++) if (week[d].some((b) => b.programId === programId)) count++;
  return count >= 5;
}

// ===== Sobreposições obrigatórias =====
export const SYS_HGPE = 'sys_hgpe';

export function ensureSystemPrograms(state: GameState): void {
  if (!getProgram(state, SYS_HGPE)) {
    state.programs.push(systemProgram(SYS_HGPE, 'Horário Eleitoral Gratuito', 'hgpe', 'system', 6, 5));
  }
}

function systemProgram(id: string, title: string, genre: Program['genre'], stationId: string, quality: number, appeal: number): Program {
  const g = GENRES[genre];
  return {
    id, stationId, title, genre, origin: 'system', quality, appeal, profile: { ...g.profile }, rating: 'L',
    costPerEp: 0, durStd: g.dur[0], durMin: g.dur[1], durMax: g.dur[2], fatigue: 0, buzz: 0, habitWeeks: 8, habitKey: '',
    movesRecent: [], status: 'on_air', talentIds: [], commercial: 0, episodes: { total: null, aired: 0, planned: null },
    isRerun: false, merchLevel: 0, promo: 0, locked: true, leaseWeeklyPerHour: 0, rights: null, dev: null, tableMult: 1,
    price30s: 0, premiereWeek: null, createdWeek: 0, stats: [], totals: { revenue: 0, cost: 0, airings: 0, peakPts: 0 },
    tempMods: [], flags: {},
  };
}

export function copaProgramId(stationId: string, year: number): string {
  return `sys_copa_${year}_${stationId}`;
}

export function ensureCopaProgram(state: GameState, stationId: string, year: number): Program {
  const id = copaProgramId(stationId, year);
  let p = getProgram(state, id);
  if (!p) {
    p = systemProgram(id, `Copa do Mundo ${year}: jogo do Brasil`, 'futebol', stationId, 88, 99);
    p.origin = 'sports';
    p.locked = true;
    p.buzz = 90;
    p.commercial = 100;
    p.durStd = 120;
    p.flags.copa = year;
    state.programs.push(p);
  }
  return p;
}

export function hasCopaRights(state: GameState, stationId: string, year: number): boolean {
  return !!state.flags[`copa_${year}_${stationId}`];
}

export function brazilMaxStage(state: GameState, year: number): number {
  const c = COPAS[year];
  if (!c) return 0;
  const key = `copa_stage_${year}`;
  const v = state.flags[key];
  if (typeof v === 'number') return v;
  return 3;
}

// devolve a grade de um dia com as sobreposições obrigatórias aplicadas
export function dayPlanWithOverlays(state: GameState, stationId: string, day: number, week: Block[][], opts: { noSports?: boolean } = {}): (string | null)[] {
  const slots = slotArray(week[day] ?? []);
  const date = addDays(state.meta.date, day);
  const station = state.stations.find((s) => s.id === stationId);
  const year = yearOf(date);
  // Copa do Mundo para quem tem os direitos
  if (COPAS[year] && hasCopaRights(state, stationId, year)) {
    for (const m of copaMatches(year, brazilMaxStage(state, year))) {
      if (m.date !== date) continue;
      const p = ensureCopaProgram(state, stationId, year);
      for (let i = 0; i < 9; i++) if (m.slot + i < SLOTS_PER_DAY) slots[m.slot + i] = p.id;
    }
  }
  // esporte real (v2): jogos ao vivo no horário deles, com pré e pós-jogo; a programação vai para depois
  if (state.sports?.windows?.length && !opts.noSports) {
    const plan = sportsDayPlan(state, stationId, day, slots);
    for (let s = 0; s < SLOTS_PER_DAY; s++) slots[s] = plan.slots[s];
  }
  // HGPE: segunda a sábado, 13h e 20h30, só TV aberta
  if (station && station.kind === 'open' && day <= 5 && inHgpe(date)) {
    const len = year >= 2016 ? 1 : 3;
    for (const start of [28, 58]) for (let i = 0; i < len; i++) slots[start + i] = SYS_HGPE;
  }
  return slots;
}

export function copaSlotsForDate(state: GameState, date: string): { slot: number; stage: number }[] {
  const year = yearOf(date);
  if (!COPAS[year]) return [];
  return copaMatches(year, brazilMaxStage(state, year))
    .filter((m) => m.date === date)
    .map((m) => ({ slot: m.slot, stage: m.stage }));
}

export function newProgramId(state: GameState): string {
  return nextId(state, 'p');
}
