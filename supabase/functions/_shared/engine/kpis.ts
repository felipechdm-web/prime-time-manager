// Indicadores, avaliação e carreira (seção 15).

import { clamp } from './rng.ts';
import { playerStation, politicalCapital } from './state.ts';
import type { GameState, KpiSet } from './types.ts';
import { yearOf } from './time.ts';

export const KPI_WEIGHTS = { aud24: 0.15, prime: 0.2, rank: 0.1, revenue: 0.25, margin: 0.1, reputation: 0.1, political: 0.1 };

function sub(ratio: number, offset: number): number {
  if (!isFinite(ratio)) return 50 + offset;
  return clamp(50 + offset + (ratio - 1) * 150, 0, 100);
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function weeksElapsedInYear(state: GameState): number {
  return Math.max(1, state.ytd.weeks);
}

export function computeKpis(state: GameState): KpiSet {
  const ps = playerStation(state);
  const h = ps.history.filter((x) => x.w >= 0).slice(-4);
  const hh = h.length ? h : ps.history.slice(-2);
  const aud24 = avg(hh.map((x) => x.pts24));
  const prime = avg(hh.map((x) => x.prime));
  const primeShare = avg(hh.map((x) => x.primeShare));
  const ranks = Object.values(state.lastBandRanks);
  const target = state.targets.rankTarget;
  const bandsTotal = ranks.length || 8;
  const bandsOk = target > 0 ? ranks.filter((r) => r <= target).length : Math.round(bandsTotal / 2);
  const weeks = weeksElapsedInYear(state);
  const lw = state.finance.lastWeek;
  // na virada do ano o acumulado zera: usa a última semana como referência
  const ytdRev = state.ytd.weeks > 0 ? state.finance.ytdRevenue : lw?.revenue ?? 0;
  const ytdCost = state.ytd.weeks > 0 ? state.finance.ytdCost : lw ? lw.production + lw.rights + lw.talent + lw.promo + lw.acquisitions : 0;
  const proratedRevenue = (state.finance.annualRevenueTarget * weeks) / 52;
  const revenueVsTarget = proratedRevenue > 0 ? ytdRev / proratedRevenue : 1;
  const margin = ytdRev - ytdCost;
  const reputation = (ps.reputation.critics + ps.reputation.public + ps.reputation.market) / 3;
  const political = politicalCapital(state);
  const k: KpiSet = { aud24, prime, primeShare, bandsOk, bandsTotal, revenueVsTarget, margin, reputation, political, score: 0 };
  k.score = scoreOf(state, k);
  return k;
}

export function scoreBreakdown(state: GameState, k: KpiSet): Record<keyof typeof KPI_WEIGHTS, number> {
  const off = state.meta.difficulty === 'estagiario' ? 8 : state.meta.difficulty === 'lenda' ? -5 : 0;
  const weeks = weeksElapsedInYear(state);
  const proratedMargin = (state.finance.annualMarginTarget * weeks) / 52;
  const marginRatio = proratedMargin > 0 ? k.margin / proratedMargin : k.margin >= 0 ? 1.1 : 0.7;
  return {
    aud24: sub(state.targets.aud24 > 0 ? k.aud24 / state.targets.aud24 : 1, off),
    prime: sub(state.targets.prime > 0 ? k.prime / state.targets.prime : 1, off),
    rank: state.targets.rankTarget > 0 ? clamp((k.bandsOk / Math.max(1, k.bandsTotal)) * 100 + off, 0, 100) : 50 + off,
    revenue: sub(k.revenueVsTarget, off),
    margin: sub(marginRatio, off),
    reputation: clamp(k.reputation + off, 0, 100),
    political: clamp(k.political + off, 0, 100),
  };
}

export function scoreOf(state: GameState, k: KpiSet): number {
  const b = scoreBreakdown(state, k);
  let s = 0;
  for (const key of Object.keys(KPI_WEIGHTS) as (keyof typeof KPI_WEIGHTS)[]) s += KPI_WEIGHTS[key] * b[key];
  return Math.round(s);
}

export function annualScore(state: GameState): number {
  const year = yearOf(state.meta.date) - 1;
  const scores = state.monthScores.filter((m) => m.month.startsWith(String(year))).map((m) => m.score);
  if (scores.length) return Math.round(avg(scores));
  return state.kpis?.score ?? 50;
}

export function verdictFor(score: number): string {
  if (score >= 80) return 'Excelente: o mercado inteiro comenta a sua gestão.';
  if (score >= 60) return 'Bom ano: metas no geral atingidas.';
  if (score >= 40) return 'Ano irregular: a presidência está de olho.';
  return 'Ano ruim: abaixo do aceitável para a presidência.';
}
