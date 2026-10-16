// Emissoras concorrentes (seção 11): decisões por regras no código, nunca pelo LLM.

import { ARCHETYPES, resolveGenre } from './catalog/archetypes.ts';
import { GENRES } from './catalog/genres.ts';
import { rngFor } from './rng.ts';
import type { Rng } from './rng.ts';
import { blockAt, blocksFromSlots, clearRange, placeBlock, slotArray } from './schedule.ts';
import { genreOkFor, makeCtx, makeProgram } from './setup.ts';
import { difficultyMult, getProgram, playerStation, rivals } from './state.ts';
import type { BandId, DayType, GameState, GenreId, PendingRivalMove, Program, RivalMoveKind, Station } from './types.ts';
import { BAND_BY_ID, BANDS, clockToSlot, monthOf } from './time.ts';

export interface CompetitorActionOut {
  week: number;
  date: string;
  stationId: string;
  kind: string;
  text: string;
  public: boolean;
}

const OPPOSITE: Record<string, string[]> = {
  drama: ['variedade', 'humor', 'reality', 'filme', 'jornalismo'],
  humor: ['drama', 'jornalismo', 'filme'],
  variedade: ['drama', 'filme', 'jornalismo'],
  reality: ['drama', 'filme', 'humor'],
  jornalismo: ['drama', 'variedade', 'filme'],
  esporte: ['drama', 'filme', 'variedade'],
  filme: ['drama', 'variedade', 'reality'],
  infantil: ['variedade', 'jornalismo'],
  documental: ['drama', 'variedade'],
  arrendado: ['filme', 'variedade'],
  especial: ['drama'],
  sistema: ['drama', 'filme'],
};

function bandCoreSlot(band: BandId): number {
  const b = BAND_BY_ID[band];
  const mid = (b.from + b.to) / 2;
  const hh = Math.floor(mid / 60) % 24;
  const mm = Math.floor(mid % 60 / 15) * 15;
  return clockToSlot(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
}

function daysOf(dt: DayType): number[] {
  return dt === 'weekday' ? [0, 1, 2, 3, 4] : dt === 'saturday' ? [5] : [6];
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function shareTrend(st: Station, key: string): { recent: number; prev: number } {
  const h = st.ai.bandHistory[key] ?? [];
  return { recent: avg(h.slice(-4)), prev: avg(h.slice(-8, -4)) };
}

function programInBand(state: GameState, st: Station, band: BandId, dt: DayType): Program | null {
  const week = state.schedules[st.id];
  if (!week) return null;
  const day = daysOf(dt)[0];
  const blk = blockAt(week[day], bandCoreSlot(band));
  return blk ? getProgram(state, blk.programId) ?? null : null;
}

function newRivalProgram(state: GameState, st: Station, g: GenreId, rng: Rng, minutes: number, shift = 0): Program {
  const ctx = makeCtx(state, rng);
  const p = makeProgram(ctx, st, g, { minutes, status: 'ready', qualityShift: shift, appealShift: shift + 2, label: GENRES[g].name });
  if (p.episodes.total) p.episodes.aired = 0;
  p.fatigue = 0;
  p.createdWeek = state.meta.weekIndex;
  return p;
}

function pickReplacement(state: GameState, st: Station, rng: Rng, avoidGroup: string | null, minutes: number, preferGenre?: GenreId): Program {
  const reserve = st.ai.reserve.map((id) => getProgram(state, id)).filter((p): p is Program => !!p && p.status === 'ready');
  let candidates = reserve;
  if (avoidGroup) {
    const opp = OPPOSITE[avoidGroup] ?? [];
    const filtered = reserve.filter((p) => opp.includes(GENRES[p.genre].group));
    if (filtered.length) candidates = filtered;
  }
  if (preferGenre) {
    const pref = candidates.filter((p) => p.genre === preferGenre);
    if (pref.length) candidates = pref;
  }
  if (candidates.length) {
    const best = candidates.sort((a, b) => b.quality + b.appeal - (a.quality + a.appeal))[0];
    st.ai.reserve = st.ai.reserve.filter((id) => id !== best.id);
    return best;
  }
  const arch = ARCHETYPES[st.archetype];
  const pool: string[] = avoidGroup
    ? ['novela_18h', 'game_show', 'filme', 'humoristico', 'reality|talk_show', 'auditorio']
    : ['filme', 'game_show', 'talk_show'];
  let g = resolveGenre(rng.pick(pool), (x) => genreOkFor(state, st, x));
  if (avoidGroup && GENRES[g].group === avoidGroup) g = 'filme';
  if (!genreOkFor(state, st, g)) g = 'filme';
  return newRivalProgram(state, st, preferGenre && genreOkFor(state, st, preferGenre) ? preferGenre : g, rng, minutes, arch.ai.budget > 0.8 ? 4 : 0);
}

function replaceInBand(state: GameState, st: Station, band: BandId, dt: DayType, newP: Program): Program | null {
  const week = state.schedules[st.id];
  const old = programInBand(state, st, band, dt);
  if (!old || old.locked) return null;
  for (const d of daysOf(dt)) {
    const slots = slotArray(week[d]);
    for (let s = 0; s < slots.length; s++) if (slots[s] === old.id) slots[s] = newP.id;
    week[d] = blocksFromSlots(slots);
  }
  newP.status = 'on_air';
  if (newP.premiereWeek === null) newP.premiereWeek = state.meta.weekIndex;
  const stillAirs = week.some((d) => d.some((b) => b.programId === old.id));
  if (!stillAirs) {
    old.status = old.episodes.total && old.episodes.aired >= old.episodes.total ? 'ended' : 'ready';
    if (old.status === 'ready' && old.quality + old.appeal > 90) st.ai.reserve.push(old.id);
  }
  return old;
}

function textFor(kind: RivalMoveKind, st: Station, band: BandId, dt: DayType, newP: Program | null, oldP: Program | null, target: Station | null): string {
  const bandName = BAND_BY_ID[band].name.toLowerCase();
  const dayName = dt === 'weekday' ? 'de segunda a sexta' : dt === 'saturday' ? 'no sábado' : 'no domingo';
  const np = newP ? `"${newP.title}"` : 'uma nova atração';
  switch (kind) {
    case 'contraprogramar':
      return `${st.name} contraprogramou a faixa ${bandName} ${dayName}: tirou ${oldP ? `"${oldP.title}"` : 'o programa da faixa'} e colocou ${np}${target ? ` para brigar com a ${target.name}` : ''}.`;
    case 'antecipar_estreia':
      return `${st.name} antecipou a estreia de ${np} na faixa ${bandName} ${dayName}.`;
    case 'esticar_sucesso':
      return `${st.name} decidiu esticar ${np}, sucesso da faixa ${bandName}.`;
    case 'cortar_custos':
      return `${st.name} cortou custos: ${oldP ? `"${oldP.title}"` : 'um programa caro'} saiu e entrou ${np} na faixa ${bandName}.`;
    case 'arrendar_faixa':
      return `${st.name} arrendou a faixa ${bandName} ${dayName} para ${np}.`;
    case 'estreia_sazonal':
      return `${st.name} estreou ${np} na faixa ${bandName} ${dayName}, abrindo a nova temporada.`;
    case 'substituir_encerrado':
      return `${st.name} estreou ${np} no lugar de ${oldP ? `"${oldP.title}"` : 'um programa encerrado'}.`;
    case 'contratar_talento':
      return `${st.name} está assediando talentos da concorrência${target ? `, inclusive da ${target.name}` : ''}.`;
  }
}

// troca programas encerrados (fim de novela/reality) imediatamente
function replaceEnded(state: GameState, st: Station, rng: Rng, out: CompetitorActionOut[]): void {
  const week = state.schedules[st.id];
  if (!week) return;
  const seen = new Set<string>();
  for (let d = 0; d < 7; d++) {
    for (const b of [...week[d]]) {
      if (seen.has(b.programId)) continue;
      seen.add(b.programId);
      const p = getProgram(state, b.programId);
      if (!p || p.locked) continue;
      const ended = p.status === 'ended' || (p.episodes.total !== null && p.episodes.aired >= p.episodes.total && !p.isRerun) || (p.rights?.exhibitionsLeft !== null && p.rights?.exhibitionsLeft !== undefined && p.rights.exhibitionsLeft <= 0);
      if (!ended) continue;
      let replacement: Program;
      if (p.isRerun || p.origin === 'archive') {
        p.episodes.aired = 0;
        continue;
      }
      if (p.rights && p.rights.exhibitionsLeft !== null && p.rights.exhibitionsLeft <= 0) {
        p.rights.exhibitionsLeft = p.genre === 'filme' ? rng.int(120, 220) : (p.episodes.total ?? 60) * 2;
        p.quality = Math.max(20, p.quality + rng.int(-6, 6));
        p.appeal = Math.max(20, p.appeal + rng.int(-6, 6));
        p.fatigue = Math.max(0, p.fatigue - 20);
        continue;
      }
      // séries compradas e documentários: nova temporada, sem alarde
      if (p.origin === 'acquired' || p.genre === 'serie_estrangeira' || p.genre === 'documentario') {
        p.episodes.aired = 0;
        p.episodes.total = p.episodes.planned ?? p.episodes.total;
        p.fatigue = Math.min(100, p.fatigue + 4);
        continue;
      }
      // novela/reality/série encerrada: entra a substituta do mesmo gênero
      const reserveSame = st.ai.reserve.map((id) => getProgram(state, id)).find((x) => x && x.genre === p.genre && x.status === 'ready');
      if (reserveSame) {
        replacement = reserveSame;
        st.ai.reserve = st.ai.reserve.filter((id) => id !== reserveSame.id);
      } else {
        replacement = newRivalProgram(state, st, p.genre, rng, p.durStd, rng.int(-4, 6));
      }
      for (let dd = 0; dd < 7; dd++) week[dd] = week[dd].map((x) => (x.programId === p.id ? { ...x, programId: replacement.id } : x));
      replacement.status = 'on_air';
      replacement.premiereWeek = state.meta.weekIndex;
      replacement.buzz = Math.min(100, replacement.buzz + 20);
      replacement.habitKey = p.habitKey;
      replacement.habitWeeks = Math.min(4, p.habitWeeks);
      p.status = 'ended';
      const relevant = ['drama', 'reality', 'variedade', 'humor'].includes(GENRES[p.genre].group);
      out.push({ week: state.meta.weekIndex, date: state.meta.date, stationId: st.id, kind: 'substituir_encerrado', text: textFor('substituir_encerrado', st, 'nobre', 'weekday', replacement, p, null), public: relevant });
    }
  }
}

export function rivalWeekly(state: GameState): CompetitorActionOut[] {
  const out: CompetitorActionOut[] = [];
  const week = state.meta.weekIndex;
  const ps = playerStation(state);
  for (const st of rivals(state)) {
    const rng = rngFor(state.meta.seed, 'rival', week, st.id);
    const arch = ARCHETYPES[st.archetype].ai;
    replaceEnded(state, st, rng, out);
    if (arch.reactivity <= 0) continue;
    // estreias sazonais em março e agosto
    const month = monthOf(state.meta.date);
    if ((month === 3 || month === 8) && rng.chance(0.18 * arch.aggression) && st.ai.pending.length === 0) {
      const band: BandId = rng.pick(['nobre', 'pos_nobre', 'pre_nobre', 'vespertino']);
      st.ai.pending.push({ dueWeek: week + rng.int(1, 3), kind: 'estreia_sazonal', band, dayType: 'weekday', targetStationId: null, note: 'estreia de temporada' });
    }
    if (st.ai.pending.length >= 2 || week - st.ai.lastMoveWeek < 4) continue;
    // avalia perdas por faixa (queda > 15% em 4 semanas)
    let worst: { band: BandId; dt: DayType; drop: number } | null = null;
    for (const b of BANDS) {
      for (const dt of ['weekday', 'saturday', 'sunday'] as DayType[]) {
        const { recent, prev } = shareTrend(st, `${b.id}|${dt}`);
        if (prev <= 0.5) continue;
        const drop = (prev - recent) / prev;
        const weight = b.weight * (dt === 'weekday' ? 1 : 0.6);
        if (drop > 0.15 && (!worst || drop * weight > worst.drop)) worst = { band: b.id, dt, drop: drop * weight };
      }
    }
    const lowCash = st.cash < 0;
    if (!worst) {
      if (lowCash && arch.lease > 0 && rng.chance(arch.lease * 0.15)) {
        st.ai.pending.push({ dueWeek: week + rng.int(arch.delay[0], arch.delay[1]), kind: 'arrendar_faixa', band: 'manha', dayType: 'weekday', targetStationId: null, note: 'caixa negativo' });
      }
      continue;
    }
    if (!rng.chance(arch.reactivity * difficultyMult(state, 'rival') * 0.6)) continue;
    // quem ganhou o público dessa faixa?
    let gainer: Station | null = null;
    let bestGain = 0;
    for (const other of state.stations) {
      if (other.id === st.id || other.closedWeek) continue;
      const { recent, prev } = shareTrend(other, `${worst.band}|${worst.dt}`);
      if (recent - prev > bestGain) {
        bestGain = recent - prev;
        gainer = other;
      }
    }
    const weights: [RivalMoveKind, number][] = [
      ['contraprogramar', arch.counter * 2],
      ['antecipar_estreia', arch.aggression * 1.5],
      ['contratar_talento', gainer?.isPlayer ? arch.poach : 0],
      ['cortar_custos', lowCash ? 1.2 : 0.1],
      ['arrendar_faixa', lowCash ? arch.lease : 0],
    ];
    const kind = rng.weighted(weights, (w) => w[1])?.[0] ?? 'contraprogramar';
    const delayMult = state.meta.difficulty === 'lenda' ? 0.6 : state.meta.difficulty === 'estagiario' ? 1.3 : 1;
    const due = week + Math.max(1, Math.round(rng.int(arch.delay[0], arch.delay[1]) * delayMult));
    const move: PendingRivalMove = { dueWeek: kind === 'contratar_talento' ? week : due, kind, band: worst.band, dayType: worst.dt, targetStationId: gainer?.id ?? null, note: `queda de ${Math.round(worst.drop * 100)}%` };
    st.ai.pending.push(move);
    st.ai.lastMoveWeek = week;
  }
  // aplica movimentos vencidos
  for (const st of rivals(state)) {
    const due = st.ai.pending.filter((m) => m.dueWeek <= week);
    st.ai.pending = st.ai.pending.filter((m) => m.dueWeek > week);
    for (const m of due) {
      const rng = rngFor(state.meta.seed, 'rivalmove', week, st.id, m.kind, m.band);
      const res = applyMove(state, st, m, rng);
      if (res) out.push({ week, date: state.meta.date, stationId: st.id, kind: m.kind, text: res.text, public: res.public });
    }
  }
  void ps;
  return out;
}

function applyMove(state: GameState, st: Station, m: PendingRivalMove, rng: Rng): { text: string; public: boolean } | null {
  const target = m.targetStationId ? state.stations.find((s) => s.id === m.targetStationId) ?? null : null;
  const current = programInBand(state, st, m.band, m.dayType);
  const minutes = current ? Math.max(30, current.durStd) : 60;
  switch (m.kind) {
    case 'contraprogramar': {
      const targetProg = target ? programInBand(state, target, m.band, m.dayType) : null;
      const avoid = targetProg ? GENRES[targetProg.genre].group : null;
      const np = pickReplacement(state, st, rng, avoid, minutes);
      const old = replaceInBand(state, st, m.band, m.dayType, np);
      if (!old) return null;
      return { text: textFor('contraprogramar', st, m.band, m.dayType, np, old, target), public: true };
    }
    case 'estreia_sazonal':
    case 'antecipar_estreia': {
      const np = pickReplacement(state, st, rng, null, minutes);
      np.buzz = Math.min(100, np.buzz + 20);
      const old = replaceInBand(state, st, m.band, m.dayType, np);
      if (!old) return null;
      return { text: textFor(m.kind, st, m.band, m.dayType, np, old, target), public: true };
    }
    case 'esticar_sucesso': {
      if (!current || !current.episodes.total) return null;
      current.episodes.total += 24;
      current.fatigue += 5;
      return { text: textFor('esticar_sucesso', st, m.band, m.dayType, current, null, null), public: true };
    }
    case 'cortar_custos': {
      const week = state.schedules[st.id];
      let worst: Program | null = null;
      for (const d of week) for (const b of d) {
        const p = getProgram(state, b.programId);
        if (!p || p.locked || p.origin === 'leased') continue;
        const last = p.stats[p.stats.length - 1];
        const eff = last ? last.cost / Math.max(0.2, last.pts) : 0;
        if (!worst || eff > (worst.stats.at(-1)?.cost ?? 0) / Math.max(0.2, worst.stats.at(-1)?.pts ?? 1)) worst = p;
      }
      if (!worst) return null;
      const np = newRivalProgram(state, st, 'filme', rng, minutes, -6);
      np.isRerun = true;
      np.origin = 'archive';
      np.costPerEp = Math.round(np.costPerEp * 0.3);
      for (let d = 0; d < 7; d++) week[d] = week[d].map((b) => (b.programId === worst!.id ? { ...b, programId: np.id } : b));
      np.status = 'on_air';
      worst.status = 'ready';
      return { text: textFor('cortar_custos', st, m.band, m.dayType, np, worst, null), public: true };
    }
    case 'arrendar_faixa': {
      const g: GenreId = rng.chance(0.6) ? 'religioso' : 'televendas';
      const np = newRivalProgram(state, st, g, rng, 120, 0);
      const week = state.schedules[st.id];
      for (const d of [0, 1, 2, 3, 4]) {
        week[d] = clearRange(week[d], 4, 8);
        week[d] = placeBlock(week[d], np.id, 4, 8);
      }
      np.status = 'on_air';
      return { text: textFor('arrendar_faixa', st, 'manha_cedo', 'weekday', np, null, null), public: true };
    }
    case 'contratar_talento': {
      // o assédio vira evento para o jogador (talento_assediado), disparado pelo motor de eventos
      state.flags[`poach_${st.id}`] = state.meta.weekIndex;
      if (current) current.flags.rivalTalent = Math.min(0.95, Number(current.flags.rivalTalent ?? 0.3) + 0.08);
      return { text: textFor('contratar_talento', st, m.band, m.dayType, null, null, target), public: false };
    }
    default:
      return null;
  }
}

export function rivalStructure(st: Station, weeklyRevenue: number): number {
  const ratio = st.archetype === 'em_crise' ? 0.45 : st.archetype === 'publica_educativa' ? 0.2 : 0.28;
  return Math.round(weeklyRevenue * ratio);
}
