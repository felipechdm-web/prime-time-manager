// Acessores e utilidades sobre o GameState.

import { ERAS, eraForYear } from './catalog/eras.ts';
import { GENRES } from './catalog/genres.ts';
import type { EraParams } from './catalog/eras.ts';
import type { GameState, Npc, NpcRole, Program, Station } from './types.ts';
import { yearOf } from './time.ts';

export function nextId(state: GameState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}_${state.idCounter.toString(36)}`;
}

export function playerStation(state: GameState): Station {
  const s = state.stations.find((x) => x.isPlayer);
  if (!s) throw new Error('Emissora do jogador não encontrada');
  return s;
}

export function stationById(state: GameState, id: string): Station | undefined {
  return state.stations.find((s) => s.id === id);
}

export function activeStations(state: GameState): Station[] {
  return state.stations.filter((s) => !s.closedWeek);
}

export function rivals(state: GameState): Station[] {
  return activeStations(state).filter((s) => !s.isPlayer);
}

const programIndexCache = new WeakMap<Program[], Map<string, Program>>();

export function programMap(state: GameState): Map<string, Program> {
  let m = programIndexCache.get(state.programs);
  if (!m || m.size !== state.programs.length) {
    m = new Map(state.programs.map((p) => [p.id, p]));
    programIndexCache.set(state.programs, m);
  }
  return m;
}

export function getProgram(state: GameState, id: string): Program | undefined {
  const m = programMap(state);
  const p = m.get(id);
  if (p) return p;
  // cache pode estar desatualizado após inserções
  const found = state.programs.find((x) => x.id === id);
  if (found) programIndexCache.delete(state.programs);
  return found;
}

export function npcByRole(state: GameState, role: NpcRole): Npc | undefined {
  const ps = playerStation(state);
  return state.npcs.find((n) => n.role === role && n.stationId === ps.id);
}

export function npcById(state: GameState, id: string): Npc | undefined {
  return state.npcs.find((n) => n.id === id);
}

export function eraParams(state: GameState): EraParams {
  return ERAS[state.meta.era].params;
}

export function currentYear(state: GameState): number {
  return yearOf(state.meta.date);
}

export function difficultyMult(state: GameState, kind: 'noise' | 'negative' | 'rival' | 'patience'): number {
  const d = state.meta.difficulty;
  switch (kind) {
    case 'noise':
      return d === 'estagiario' ? 0.7 : d === 'lenda' ? 1.3 : 1;
    case 'negative':
      return d === 'estagiario' ? 0.75 : d === 'lenda' ? 1.35 : 1;
    case 'rival':
      return d === 'estagiario' ? 0.5 : d === 'lenda' ? 1.5 : 1;
    case 'patience':
      return d === 'estagiario' ? 1.3 : d === 'lenda' ? 0.75 : 1;
  }
}

export function avgWeeklyRevenue(state: GameState): number {
  const st = playerStation(state);
  const h = st.history.slice(-4);
  if (!h.length) return 1_000_000;
  return Math.max(200_000, h.reduce((s, x) => s + x.rev, 0) / h.length);
}

export function politicalCapital(state: GameState): number {
  const get = (r: NpcRole) => npcByRole(state, r)?.trust ?? 50;
  const team = (get('pesquisa') + get('assistente') + get('promocao') + get('juridico')) / 4;
  return Math.round((3 * get('presidente') + 2 * get('comercial') + get('jornalismo') + get('artistico') + team) / 8);
}

export function isPlayableGenre(g: string): boolean {
  return GENRES[g as keyof typeof GENRES]?.group !== 'sistema';
}

export function syncEra(state: GameState): boolean {
  const era = eraForYear(currentYear(state));
  if (era !== state.meta.era) {
    state.meta.era = era;
    return true;
  }
  return false;
}

export function pushTimeline(state: GameState, text: string, kind = 'info'): void {
  state.timeline.push({ week: state.meta.weekIndex, date: state.meta.date, text, kind });
  if (state.timeline.length > 400) state.timeline.splice(0, state.timeline.length - 400);
}

export function talentStrength(state: GameState, p: Program): number {
  if (!p.talentIds.length) return 0;
  let best = 0;
  for (const id of p.talentIds) {
    const n = npcById(state, id);
    if (!n || !n.talent) continue;
    const spec = n.talent.specialty.includes(p.genre) ? 1 : 0.75;
    const moodF = 1 + Math.max(-0.2, Math.min(0.1, n.mood / 300));
    const v = ((n.talent.carisma * 0.45 + n.talent.popularity * 0.55) / 100) * spec * moodF;
    if (v > best) best = v;
  }
  return best;
}
