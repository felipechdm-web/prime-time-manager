// Motor comercial e financeiro (seção 10): inventário, preço, ocupação, cotas e custos.

import { ERAS } from './catalog/eras.ts';
import { GENRES } from './catalog/genres.ts';
import { SEGMENTS, SEGMENT_AD_VALUE } from './catalog/markets.ts';
import { clamp } from './rng.ts';
import { programAirings } from './schedule.ts';
import { getProgram, npcByRole } from './state.ts';
import type { BandId, GameState, Program, Station, WeekFinance } from './types.ts';
import { AD_SEASON, BAND_BY_ID, bandOfSlot, monthOf } from './time.ts';

// base de segmento usada para estimar a composição do público de um programa
const SEG_BASE = [0.13, 0.05, 0.12, 0.09, 0.21, 0.11, 0.29];

export function cppFor(state: GameState, band: BandId): number {
  const P = ERAS[state.meta.era].params;
  return P.cppBase * BAND_BY_ID[band].weight * P.universeScale;
}

export function audienceQuality(p: Program): number {
  let num = 0;
  let den = 0;
  SEGMENTS.forEach((s, i) => {
    const w = p.profile[s] * SEG_BASE[i];
    num += w * SEGMENT_AD_VALUE[s];
    den += w;
  });
  return clamp(den > 0 ? num / den : 1, 0.7, 1.4);
}

export function brandMult(st: Station): number {
  return 0.8 + 0.4 * (st.reputation.market / 100);
}

export function mainBand(state: GameState, p: Program): BandId {
  const week = state.schedules[p.stationId];
  const counts = new Map<BandId, number>();
  if (week) {
    for (const a of programAirings(week, p.id)) {
      for (let i = 0; i < a.len; i++) {
        const b = bandOfSlot(a.start + i);
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
    }
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const g = GENRES[p.genre];
  const order: BandId[] = ['madrugada', 'manha_cedo', 'manha', 'meio_dia', 'vespertino', 'pre_nobre', 'nobre', 'pos_nobre'];
  let best = 0;
  for (let i = 1; i < 8; i++) if (g.fit[i] > g.fit[best]) best = i;
  return order[best];
}

export function referencePoints(state: GameState, p: Program): number {
  const recent = p.stats.slice(-4);
  if (recent.length) return recent.reduce((s, x) => s + x.pts, 0) / recent.length;
  // estimativa para programas sem histórico: média da emissora na faixa
  const st = state.stations.find((s) => s.id === p.stationId);
  const band = mainBand(state, p);
  const hist = st?.ai.bandHistory[`pts_${band}`];
  const base = hist && hist.length ? hist[hist.length - 1] : 2;
  return Math.max(0.3, base * (0.6 + (p.appeal / 100) * 0.6));
}

export function recomputePrice(state: GameState, p: Program): void {
  const st = state.stations.find((s) => s.id === p.stationId);
  if (!st) return;
  const g = GENRES[p.genre];
  if (g.leased || g.group === 'sistema') {
    p.price30s = 0;
    return;
  }
  const band = mainBand(state, p);
  const pts = referencePoints(state, p);
  const payPremium = st.kind === 'pay' ? 2.2 : 1;
  p.price30s = Math.round(cppFor(state, band) * pts * audienceQuality(p) * brandMult(st) * p.tableMult * payPremium);
}

export function weekTrend(st: Station): number {
  const h = st.history;
  if (h.length < 5) return 0;
  const last = h.slice(-4).reduce((s, x) => s + x.pts24, 0) / 4;
  const prev = h.slice(-8, -4);
  if (!prev.length) return 0;
  const pv = prev.reduce((s, x) => s + x.pts24, 0) / prev.length;
  return pv > 0 ? (last - pv) / pv : 0;
}

// ocupação e desconto da semana (seção 10.2)
export function occupancyFor(state: GameState, st: Station): { occ: number; disc: number } {
  const month = monthOf(state.meta.date);
  const season = AD_SEASON[month - 1];
  const rep = 0.85 + 0.3 * (st.reputation.market / 100);
  let tableMult = 1;
  let maxDisc = 0.6;
  let comm = 1;
  let mods = 0;
  if (st.isPlayer) {
    tableMult = state.finance.tableMult;
    maxDisc = state.finance.maxDiscount;
    for (const pm of state.finance.priceMods) if (pm.untilWeek >= state.meta.weekIndex) tableMult *= pm.mult;
    const marta = npcByRole(state, 'comercial');
    if (marta) comm = 1 + marta.mood / 500 + (marta.trust - 50) / 800;
    for (const om of state.finance.occupancyMods) if (om.untilWeek >= state.meta.weekIndex) mods += om.delta;
    if (state.player.background === 'publicitario') comm += 0.04;
    if (state.player.background === 'jornalista') comm -= 0.02;
  }
  const priceFactor = Math.pow(1 / tableMult, 1.3);
  let occ = 0.8 * season * rep * priceFactor * comm + mods;
  const trend = weekTrend(st);
  let needed = 0.3 + 0.5 * Math.max(0, -trend) + Math.max(0, tableMult - 1) * 0.6;
  if (state.meta.difficulty === 'lenda' && st.isPlayer) needed += 0.03;
  const disc = Math.min(needed, maxDisc);
  if (maxDisc < needed) occ *= Math.max(0.4, 1 - (needed - maxDisc) * 1.6);
  return { occ: clamp(occ, 0.2, 0.97), disc: clamp(disc, 0, 0.6) };
}

export function effectivePrice(state: GameState, st: Station, p: Program): number {
  let mult = 1;
  if (st.isPlayer) {
    mult = state.finance.tableMult;
    for (const pm of state.finance.priceMods) if (pm.untilWeek >= state.meta.weekIndex) mult *= pm.mult;
    if (state.player.background === 'publicitario') mult *= 1.1;
  }
  return p.price30s * mult;
}

export function airingCost(state: GameState, p: Program, lenSlots: number): { production: number; rights: number } {
  const g = GENRES[p.genre];
  const minutes = lenSlots * 15;
  if (g.group === 'sistema') {
    if (p.genre === 'tapa_buraco') return { production: 8000 * (minutes / 60), rights: 0 };
    return { production: 0, rights: 0 };
  }
  if (p.origin === 'leased') return { production: 0, rights: 0 };
  if (p.isRerun || p.origin === 'archive') return { production: 0, rights: p.costPerEp * 0.06 * clamp(minutes / Math.max(15, p.durStd), 0.5, 2) };
  if (p.origin === 'acquired' || p.origin === 'sports') return { production: 0, rights: p.costPerEp * clamp(minutes / Math.max(15, p.durStd), 0.6, 1.6) };
  const scale = clamp(minutes / Math.max(15, p.durStd), 0.5, 2.2);
  const base = p.costPerEp * scale;
  if (p.origin === 'coprod') return { production: base * 0.55, rights: 0 };
  return { production: base, rights: 0 };
}

export interface AiringEcon {
  adRevenue: number;
  merch: number;
  lease: number;
  production: number;
  rights: number;
}

export function airingEconomics(
  state: GameState,
  st: Station,
  p: Program,
  lenSlots: number,
  occ: number,
  disc: number,
  dayAdMult: number,
): AiringEcon {
  const g = GENRES[p.genre];
  const hours = (lenSlots * 15) / 60;
  const cost = airingCost(state, p, lenSlots);
  const out: AiringEcon = { adRevenue: 0, merch: 0, lease: 0, production: cost.production, rights: cost.rights };
  if (p.genre === 'janela_local' || p.genre === 'hgpe') return out;
  if (p.origin === 'leased' || g.leased) {
    out.lease = p.leaseWeeklyPerHour * hours;
    return out;
  }
  const adMinutes = st.isPlayer ? state.finance.adMinutes : 12;
  const spots = adMinutes * 2 * hours;
  let price = effectivePrice(state, st, p);
  if (g.kids && (state.meta.era === '10s' || state.meta.era === 'now')) price *= 0.55;
  if (st.kind === 'pay') price *= 1;
  out.adRevenue = spots * price * occ * (1 - disc) * dayAdMult;
  if (p.merchLevel > 0) out.merch = p.merchLevel * price * 1.1 * Math.min(1, occ + 0.15) * Math.max(1, hours);
  return out;
}

// fechamento financeiro da semana para uma estação
export function closeStationFinance(state: GameState, st: Station): WeekFinance {
  const wp = state.weekProgress;
  const e = wp.econ[st.id] ?? [0, 0, 0, 0, 0, 0];
  const acquisitions = e[5] ?? 0;
  const occ = wp.occ[st.id] ?? [0.7, 0.3];
  let talent = 0;
  for (const c of state.contracts) if (c.stationId === st.id && c.status === 'active') talent += c.salaryWeekly;
  let quota = 0;
  let compensation = 0;
  if (st.isPlayer) {
    for (const d of state.deals) {
      if (d.status !== 'active') continue;
      if (d.startWeek > state.meta.weekIndex || d.endWeek < state.meta.weekIndex) continue;
      quota += d.weeklyValue;
      const acc = wp.progAcc[d.programId];
      const pts = acc && acc[2] > 0 ? acc[0] / acc[2] : 0;
      if (d.guaranteedPoints > 0 && pts < d.guaranteedPoints) {
        const gap = d.guaranteedPoints > 0 ? (d.guaranteedPoints - pts) / d.guaranteedPoints : 1;
        compensation += d.weeklyValue * Math.min(1, gap * 1.5) * 0.5;
        d.shortfallWeeks += 1;
      }
    }
  }
  let promo = 0;
  if (st.isPlayer) {
    for (const p of state.programs) if (p.stationId === st.id && p.promo > 0) promo += p.promo * 0.01 * e[0];
  }
  const fines = st.isPlayer ? wp.fines : 0;
  const other = (st.isPlayer ? Math.max(0, wp.eventCash) : 0) + (st.subscriptionWeekly ?? 0);
  const eventCost = st.isPlayer ? Math.max(0, -wp.eventCash) : 0;
  const revenue = e[0] + e[1] + e[2] + quota + other;
  const programming = e[3] + e[4] + talent + promo + acquisitions;
  const structure = st.weeklyStructure;
  const cost = programming + structure + fines + compensation + eventCost;
  const budgetWeek = st.isPlayer ? state.finance.annualBudget / 52 : 0;
  return {
    revenue,
    adRevenue: e[0],
    quota,
    merch: e[1],
    lease: e[2],
    other,
    cost,
    production: e[3],
    rights: e[4],
    acquisitions,
    talent,
    promo,
    fines: fines + eventCost,
    compensation,
    structure,
    occupancy: occ[0],
    avgDiscount: occ[1],
    margin: revenue - programming,
    budgetWeek,
  };
}

// custo semanal projetado da grade (para validação de orçamento)
export function projectedWeekCost(state: GameState, stationId: string): number {
  const week = state.schedules[stationId];
  if (!week) return 0;
  let total = 0;
  for (let d = 0; d < 7; d++) {
    for (const b of week[d]) {
      const p = getProgram(state, b.programId);
      if (!p) continue;
      const c = airingCost(state, p, b.len);
      total += c.production + c.rights;
    }
  }
  for (const c of state.contracts) if (c.stationId === stationId && c.status === 'active') total += c.salaryWeekly;
  return total;
}

export function leaseRate(state: GameState, band: BandId): number {
  // receita por hora arrendada (R$ 2026), maior nas madrugadas e manhãs de emissoras pequenas
  const P = ERAS[state.meta.era].params;
  const base: Record<BandId, number> = {
    madrugada: 48000,
    manha_cedo: 40000,
    manha: 35000,
    meio_dia: 30000,
    vespertino: 32000,
    pre_nobre: 45000,
    nobre: 75000,
    pos_nobre: 45000,
  };
  return base[band] * P.universeScale;
}
