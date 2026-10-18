// Loop de jogo (seção 6): execução diária, fechamento da semana e ciclos maiores.

import { airingsOfDay, computeDay } from './audience.ts';
import type { DayResult } from './audience.ts';
import { REAL_STATIONS } from './catalog/eras.ts';
import { GENRES } from './catalog/genres.ts';
import { MARKETS } from './catalog/markets.ts';
import { airingEconomics, closeStationFinance, occupancyFor, recomputePrice } from './commercial.ts';
import { applyDelayed, drawWeekEvents, expireEvents, fireEvent, progressArcs, talentLeaves } from './eventsEngine.ts';
import { annualScore, computeKpis, verdictFor } from './kpis.ts';
import { computeLiveMoments } from './live.ts';
import { devProgress, refreshOffers, resolveAuctions } from './market.ts';
import { processContracts } from './negotiation.ts';
import { advanceSports, planCalendarChanges } from './sports.ts';
import { assignBroadcasts, closeSportsWeek, decisiveBroadcast, HABIT_LOSS_PER_DISPLACEMENT, sellSportsCotas, weekDisplacements } from './sportsTv.ts';
import { money } from './money.ts';
import { boletimFallback, dayFallback, evaluationFallback } from './narrative.ts';
import { buildWeekReport, PA, programResultsFromAcc } from './report.ts';
import { clamp, round, rngFor } from './rng.ts';
import { rivalStructure, rivalWeekly } from './rivals.ts';
import type { CompetitorActionOut } from './rivals.ts';
import { cloneWeek, habitKeyFor, programsInWeek, slotArray } from './schedule.ts';
import { addRealStation, freshWeekProgress, ratingAllowed, SCENARIOS, setupCopaYear } from './setup.ts';
import {
  activeStations, avgWeeklyRevenue, difficultyMult, getProgram, npcById, npcByRole, playerStation, politicalCapital,
  pushTimeline, rivals,
} from './state.ts';
import type { GameState, InboxDraft, KpiSet, NpcRole, Station, WeekFinance, WeekReport } from './types.ts';
import {
  addDays, BANDS, bandOfSlot, COPAS, dayCalendar, dayType, firstMondayOfYear, formatDate, hgpeWindow, inHgpe, isPrimeSlot,
  MONTH_NAMES, monthOf, SLOTS_PER_DAY, yearOf,
} from './time.ts';

export interface RatingSlotRow {
  week: number;
  day: number;
  date: string;
  market: string;
  data: { stations: Record<string, number[]>; tle: number[] };
}

export interface SimOutputs {
  ratingSlots: RatingSlotRow[];
  reports: { week: number; kind: 'week' | 'day' | 'month' | 'quarter' | 'year'; day: number | null; data: WeekReport | Record<string, unknown> }[];
  ledger: { week: number; date: string; stationId: string; kind: string; amount: number }[];
  competitorActions: CompetitorActionOut[];
  kpiSnapshots: { periodType: string; periodStart: string; kpis: KpiSet & { label: string } }[];
  weeklyStats: { week: number; data: Record<string, unknown> }[];
  notes: string[];
  weekClosed: boolean;
  daysSimulated: number[];
  endGame: { status: 'fired' | 'retired' | 'promoted'; reason: string } | null;
}

export function newOutputs(): SimOutputs {
  return { ratingSlots: [], reports: [], ledger: [], competitorActions: [], kpiSnapshots: [], weeklyStats: [], notes: [], weekClosed: false, daysSimulated: [], endGame: null };
}

function inbox(state: GameState, d: InboxDraft): void {
  state.pendingInbox.push(d);
}

// ===== Execução =====
function beginExecution(state: GameState): void {
  const wp = state.weekProgress;
  for (const st of activeStations(state)) {
    const o = occupancyFor(state, st);
    wp.occ[st.id] = [o.occ, o.disc];
  }
  const ps = playerStation(state);
  for (const st of activeStations(state)) {
    const ids = programsInWeek(state.schedules[st.id] ?? []);
    for (const id of ids) {
      const p = getProgram(state, id);
      if (!p) continue;
      if (p.status === 'ready' || p.status === 'archive') p.status = 'on_air';
      if (p.stats.length === 0 && p.premiereWeek === null && GENRES[p.genre].group !== 'sistema') {
        p.premiereWeek = state.meta.weekIndex;
        p.buzz = clamp(p.buzz + 10, 0, 100);
      }
      if (st.id === ps.id && p.promo > 0) p.buzz = clamp(p.buzz + 5 * p.promo, 0, 100);
    }
  }
}

export function simulateNextDay(state: GameState, out: SimOutputs, live?: { programId: string; decisions: string[] }): void {
  const wp = state.weekProgress;
  if (wp.day >= 7) return;
  if (wp.day === 0) beginExecution(state);
  const day = wp.day;
  const decisions = live ? [{ programId: live.programId, decisions: live.decisions }] : [];
  for (const l of wp.liveDecisions) if (l.day === day && !live) decisions.push({ programId: l.programId, decisions: l.decisions });
  if (live) wp.liveDecisions.push({ day, programId: live.programId, decisions: live.decisions });
  const order = activeStations(state).map((s) => s.id).join(',');
  const carry = wp.stationOrder.join(',') === order ? wp.carry : null;
  // esporte real: os jogos do dia já têm placar quando o dia vai ao ar (prorrogação e pênaltis estouram a grade)
  if (state.sports) advanceSports(state, addDays(state.meta.date, day + 1));
  const res = computeDay(state, day, { carry, liveDecisions: decisions });
  accumulateDay(state, res, out, day);
  wp.carry = res.carry.map((m) => m.map((r) => r.map((v) => round(v, 6))));
  wp.stationOrder = res.stationIds;
  wp.day += 1;
  out.daysSimulated.push(day);
  // decisões ao vivo com efeito posterior
  for (const d of decisions) {
    if (d.decisions.includes('chamada_proximo')) {
      const st = playerStation(state);
      const week = state.schedules[st.id];
      const blocks = week[day] ?? [];
      const idx = blocks.findIndex((b) => b.programId === d.programId);
      const next = idx >= 0 ? blocks[idx + 1] : null;
      const np = next ? getProgram(state, next.programId) : null;
      if (np) np.buzz = clamp(np.buzz + 6, 0, 100);
    }
    if (d.decisions.includes('plantao')) {
      const h = npcByRole(state, 'jornalismo');
      if (h) h.mood = clamp(h.mood + 6, -100, 100);
      playerStation(state).reputation.critics = clamp(playerStation(state).reputation.critics + 1, 0, 100);
    }
  }
}

function accumulateDay(state: GameState, res: DayResult, out: SimOutputs, day: number): void {
  const wp = state.weekProgress;
  const dt = dayType(day);
  const date = res.date;
  const cal = dayCalendar(date);
  const ps = playerStation(state);
  const year = yearOf(date);
  const S = res.stationIds.length;
  // posição por slot
  const rank: number[][] = res.stationIds.map(() => new Array(SLOTS_PER_DAY).fill(1));
  for (let t = 0; t < SLOTS_PER_DAY; t++) {
    for (let c = 0; c < S; c++) {
      let r = 1;
      for (let k = 0; k < S; k++) if (k !== c && res.pntPts[k][t] > res.pntPts[c][t]) r++;
      rank[c][t] = r;
    }
  }
  const avgRev = avgWeeklyRevenue(state);
  for (const a of airingsOfDay(res)) {
    const p = getProgram(state, a.programId);
    const st = state.stations.find((s) => s.id === a.stationId);
    if (!p || !st) continue;
    let acc = wp.progAcc[a.programId];
    if (!acc) {
      acc = new Array(PA.MK + MARKETS.length).fill(0);
      acc[PA.MIN] = 999;
      wp.progAcc[a.programId] = acc;
    }
    const c = res.stationIds.indexOf(a.stationId);
    let rs = 0;
    for (let t = a.start; t < a.start + a.len; t++) rs += rank[c][t];
    acc[PA.PTS] += a.pts;
    acc[PA.SHARE] += a.share;
    acc[PA.N] += 1;
    acc[PA.PEAK] = Math.max(acc[PA.PEAK], a.peak);
    acc[PA.MIN] = Math.min(acc[PA.MIN], a.min);
    acc[PA.RANK] += rs / a.len;
    a.marketPts.forEach((v, i) => (acc![PA.MK + i] += v));
    // episódios e direitos
    if (p.episodes.total !== null) {
      p.episodes.aired += 1;
      if (p.isRerun && p.episodes.aired >= p.episodes.total) p.episodes.aired = 0;
    }
    if (p.rights && p.rights.exhibitionsLeft !== null) p.rights.exhibitionsLeft = Math.max(0, p.rights.exhibitionsLeft - 1);
    p.totals.airings += 1;
    p.totals.peakPts = Math.max(p.totals.peakPts, a.peak);
    // economia da exibição
    const occ = wp.occ[st.id] ?? [0.7, 0.3];
    const econ = airingEconomics(state, st, p, a.len, occ[0], occ[1], cal.adMult);
    const e = wp.econ[st.id] ?? [0, 0, 0, 0, 0, 0];
    e[0] += econ.adRevenue;
    e[1] += econ.merch;
    e[2] += econ.lease;
    e[3] += econ.production;
    e[4] += econ.rights;
    wp.econ[st.id] = e;
    const pe = wp.progEcon[a.programId] ?? [0, 0];
    pe[0] += econ.adRevenue + econ.merch + econ.lease;
    pe[1] += econ.production + econ.rights;
    wp.progEcon[a.programId] = pe;
    // classificação indicativa (seção 14)
    if (st.id === ps.id && GENRES[p.genre].group !== 'sistema') {
      let violation = false;
      for (let t = a.start; t < a.start + a.len; t++) if (!ratingAllowed(p.rating, t)) violation = true;
      if (violation) {
        state.flags[`rv_${p.id}`] = state.meta.weekIndex;
        if (!wp.ratingViolations.includes(p.id)) wp.ratingViolations.push(p.id);
        if (year < 2016) wp.fines += 0.004 * avgRev;
        else {
          ps.reputation.public = clamp(ps.reputation.public - 0.3, 0, 100);
          ps.reputation.critics = clamp(ps.reputation.critics - 0.2, 0, 100);
        }
      }
    }
  }
  // faixas, 24h, nobre, praças
  res.stationIds.forEach((sid, c) => {
    let sum = 0;
    let sumTle = 0;
    let prime = 0;
    let primeTle = 0;
    for (let t = 0; t < SLOTS_PER_DAY; t++) {
      const v = res.pntPts[c][t];
      sum += v;
      sumTle += res.pntTle[t];
      if (isPrimeSlot(t)) {
        prime += v;
        primeTle += res.pntTle[t];
      }
      const key = `${sid}|${bandOfSlot(t)}|${dt}`;
      const b = wp.bandAcc[key] ?? [0, 0, 0];
      b[0] += v;
      b[1] += res.pntTle[t] > 0 ? (v / res.pntTle[t]) * 100 : 0;
      b[2] += 1;
      wp.bandAcc[key] = b;
    }
    const dacc = wp.dayAcc[sid] ?? new Array(7).fill(0);
    dacc[day] = sum / SLOTS_PER_DAY;
    wp.dayAcc[sid] = dacc;
    const pacc = wp.primeAcc[sid] ?? new Array(7).fill(0);
    pacc[day] = prime / 24;
    wp.primeAcc[sid] = pacc;
    const sacc = wp.shareAcc[sid] ?? new Array(14).fill(0);
    sacc[day] = sumTle > 0 ? (sum / sumTle) * 100 : 0;
    sacc[7 + day] = primeTle > 0 ? (prime / primeTle) * 100 : 0;
    wp.shareAcc[sid] = sacc;
    const macc = wp.marketAcc[sid] ?? new Array(MARKETS.length).fill(0);
    const mpacc = wp.marketPrimeAcc[sid] ?? new Array(MARKETS.length).fill(0);
    res.marketPts.forEach((m, i) => {
      let s1 = 0;
      let s2 = 0;
      for (let t = 0; t < SLOTS_PER_DAY; t++) {
        s1 += m[c][t];
        if (isPrimeSlot(t)) s2 += m[c][t];
      }
      macc[i] += s1 / SLOTS_PER_DAY;
      mpacc[i] += s2 / 24;
    });
    wp.marketAcc[sid] = macc;
    wp.marketPrimeAcc[sid] = mpacc;
  });
  // fatores explicativos (só programas do jogador)
  for (const [pid, f] of Object.entries(res.factors)) {
    const p = getProgram(state, pid);
    if (!p || p.stationId !== ps.id) continue;
    const arr = wp.factors[pid] ?? new Array(11).fill(0);
    const vals = [f.q, f.a, f.g, f.b, f.h, f.f, f.t, f.station, f.noise, f.outside, f.slots];
    vals.forEach((v, i) => (arr[i] += v));
    wp.factors[pid] = arr;
  }
  // linhas de audiência por slot (PNT + 15 praças)
  const mk = (market: string, ptsArr: number[][], tle: number[]): RatingSlotRow => ({
    week: state.meta.weekIndex,
    day,
    date,
    market,
    data: {
      stations: Object.fromEntries(res.stationIds.map((sid, c) => [sid, ptsArr[c].map((v) => round(v, 2))])),
      tle: tle.map((v) => round(v, 2)),
    },
  });
  out.ratingSlots.push(mk('PNT', res.pntPts, res.pntTle));
  res.marketPts.forEach((m, i) => out.ratingSlots.push(mk(MARKETS[i].code, m, res.marketTle[i])));
  // boletim do dia
  const r = dayReport(state, res, day);
  out.reports.push({ week: state.meta.weekIndex, kind: 'day', day, data: r });
}

function dayReport(state: GameState, res: DayResult, day: number): WeekReport {
  const ps = playerStation(state);
  const stations24 = res.stationIds.map((sid, c) => {
    const sum = res.pntPts[c].reduce((s, v) => s + v, 0);
    const tle = res.pntTle.reduce((s, v) => s + v, 0);
    return { stationId: sid, pts: round(sum / SLOTS_PER_DAY, 1), share: round(tle > 0 ? (sum / tle) * 100 : 0, 1) };
  }).sort((a, b) => b.pts - a.pts);
  const stationsPrime = res.stationIds.map((sid, c) => {
    let s = 0;
    let tl = 0;
    for (let t = 48; t < 72; t++) {
      s += res.pntPts[c][t];
      tl += res.pntTle[t];
    }
    return { stationId: sid, pts: round(s / 24, 1), share: round(tl > 0 ? (s / tl) * 100 : 0, 1) };
  }).sort((a, b) => b.pts - a.pts);
  const airs = airingsOfDay(res);
  const programs = airs
    .filter((a) => a.stationId === ps.id)
    .map((a) => {
      const p = getProgram(state, a.programId);
      return {
        programId: a.programId, stationId: a.stationId, title: p?.title ?? '', genre: p?.genre ?? 'tapa_buraco', slotLabel: '',
        pts: round(a.pts, 1), share: round(a.share, 1), rank: 1, delta4w: null, airings: 1, markets: a.marketPts.map((v) => round(v, 1)),
      };
    })
    .filter((x) => GENRES[x.genre].group !== 'sistema')
    .sort((a, b) => b.pts - a.pts);
  const r: WeekReport = {
    week: state.meta.weekIndex, dateFrom: res.date, dateTo: res.date, kind: 'day', day,
    stations24, stationsPrime, bands: [], daily: [], programs, topPrograms: [], markets: [], finance: null,
    alerts: [], competitorMoves: [], records: [], headlines: [], narrative: [], narrated: false, liveAvailable: [], closings: [],
  };
  r.narrative = dayFallback(state, r);
  return r;
}

// ===== Fechamento da semana =====
export function closeWeek(state: GameState, out: SimOutputs, opts: { warmup?: boolean } = {}): void {
  const wp = state.weekProgress;
  const week = state.meta.weekIndex;
  const ps = playerStation(state);
  const stations = activeStations(state);
  const warm = !!opts.warmup;
  const report = warm ? null : buildWeekReport(state, 'week');

  // esporte real: jogos exibidos, prorrogações, obrigações (antes das finanças, por causa das multas) e deslocamentos
  const sportsMoves = new Map<string, number>();
  if (state.sports && !warm) {
    const sw = closeSportsWeek(state);
    wp.fines += sw.fines;
    for (const n of sw.notes) inbox(state, { fromNpc: 'npc_comercial', subject: 'Esporte na grade', body: n, requiresAction: false, eventId: null, kind: 'mensagem' });
    for (const st of stations) {
      const plans = (state.schedules[st.id] ?? []).map((d) => slotArray(d));
      for (const [id, n] of weekDisplacements(state, st.id, plans)) sportsMoves.set(id, (sportsMoves.get(id) ?? 0) + n);
    }
  }

  // finanças por estação
  const finances = new Map<string, WeekFinance>();
  for (const st of stations) {
    const f = closeStationFinance(state, st);
    finances.set(st.id, f);
    const d = wp.dayAcc[st.id] ?? [];
    const pr = wp.primeAcc[st.id] ?? [];
    const sh = wp.shareAcc[st.id] ?? [];
    const pts24 = d.length ? d.reduce((s, x) => s + x, 0) / 7 : 0;
    const prime = pr.length ? pr.reduce((s, x) => s + x, 0) / 7 : 0;
    const share24 = sh.length ? sh.slice(0, 7).reduce((s, x) => s + x, 0) / 7 : 0;
    const primeShare = sh.length ? sh.slice(7).reduce((s, x) => s + x, 0) / 7 : 0;
    st.history.push({ w: week, pts24: round(pts24, 2), prime: round(prime, 2), share24: round(share24, 1), primeShare: round(primeShare, 1), rev: Math.round(f.revenue), cost: Math.round(f.cost) });
    if (st.history.length > 60) st.history.splice(0, st.history.length - 60);
    st.cash += f.revenue - f.cost;
    // histórico por faixa para a IA e para preços
    for (const b of BANDS) {
      let allP = 0;
      let allN = 0;
      for (const dt of ['weekday', 'saturday', 'sunday']) {
        const a = wp.bandAcc[`${st.id}|${b.id}|${dt}`];
        if (!a) continue;
        const key = `${b.id}|${dt}`;
        const h = st.ai.bandHistory[key] ?? [];
        h.push(round(a[1] / Math.max(1, a[2]), 2));
        if (h.length > 12) h.shift();
        st.ai.bandHistory[key] = h;
        allP += a[0];
        allN += a[2];
      }
      const ph = st.ai.bandHistory[`pts_${b.id}`] ?? [];
      ph.push(round(allP / Math.max(1, allN), 2));
      if (ph.length > 12) ph.shift();
      st.ai.bandHistory[`pts_${b.id}`] = ph;
    }
  }
  // posição do jogador por faixa
  const ranks: Record<string, number> = {};
  for (const b of BANDS) {
    const vals = stations.map((st) => {
      let s = 0;
      let n = 0;
      for (const dt of ['weekday', 'saturday', 'sunday']) {
        const a = wp.bandAcc[`${st.id}|${b.id}|${dt}`];
        if (a) {
          s += a[0];
          n += a[2];
        }
      }
      return { id: st.id, v: n ? s / n : 0 };
    }).sort((a, b2) => b2.v - a.v);
    ranks[b.id] = vals.findIndex((x) => x.id === ps.id) + 1;
  }
  state.lastBandRanks = ranks;

  // estatísticas dos programas
  const progResults = programResultsFromAcc(state);
  const resById = new Map(progResults.map((r) => [r.programId, r]));
  const recordsMsgs: string[] = [];
  for (const p of state.programs) {
    const r = resById.get(p.id);
    const pe = wp.progEcon[p.id] ?? [0, 0];
    const airedNow = !!r;
    if (r) {
      const fxs = wp.factors[p.id];
      const fx = fxs && fxs[10] > 0 ? fxs.slice(0, 10).map((v) => round(v / fxs[10], 3)) : undefined;
      p.stats.push({ w: week, pts: r.pts, share: r.share, rank: r.rank, rev: Math.round(pe[0]), cost: Math.round(pe[1]), n: r.airings, fx });
      const keep = p.stationId === ps.id ? 26 : 10;
      if (p.stats.length > keep) p.stats.splice(0, p.stats.length - keep);
      p.totals.revenue += pe[0];
      p.totals.cost += pe[1];
      const g = GENRES[p.genre];
      p.fatigue = clamp(p.fatigue + g.fatiguePerEp * r.airings * (p.isRerun ? 1.5 : 1), 0, 100);
      if (p.merchLevel > 0) p.buzz = clamp(p.buzz - 1.5 * p.merchLevel, 0, 100);
      // recorde da casa (jogador)
      if (!warm && p.stationId === ps.id && g.group !== 'sistema') {
        const rec = state.records.find((x) => x.key === 'programa');
        if (!rec || r.pts > rec.value) {
          if (rec && week > 0) {
            recordsMsgs.push(`Recorde da casa: "${p.title}" marcou ${r.pts.toLocaleString('pt-BR')} pontos.`);
            p.flags.recordWeek = week;
          }
          state.records = state.records.filter((x) => x.key !== 'programa');
          state.records.push({ key: 'programa', label: `Maior média semanal de um programa: "${p.title}"`, value: r.pts, week, programId: p.id });
        }
      }
    } else {
      p.fatigue = clamp(p.fatigue - 1.5, 0, 100);
    }
    p.buzz = clamp(p.buzz * 0.85, 0, 100);
    p.promo = 0;
    p.tempMods = p.tempMods.filter((m) => m.untilWeek > week);
    p.liveBoost = 0;
    // hábito
    const sched = state.schedules[p.stationId];
    if (sched && airedNow && GENRES[p.genre].group !== 'sistema') {
      const key = habitKeyFor(sched, p.id);
      if (key === p.habitKey) p.habitWeeks = Math.min(8, p.habitWeeks + 1);
      else {
        if (p.habitKey && p.stats.length > 1) p.movesRecent.push(week);
        p.habitKey = key;
        p.habitWeeks = 1;
      }
      p.movesRecent = p.movesRecent.filter((w) => w >= week - 8);
    }
    // deslocado por jogos: cada deslocamento custa parte do hábito (seção 8C.5)
    const moved = sportsMoves.get(p.id);
    if (moved) p.habitWeeks = Math.max(0, p.habitWeeks - HABIT_LOSS_PER_DISPLACEMENT * moved);
    // ciclo de vida
    if (airedNow && p.episodes.total !== null && !p.isRerun && p.episodes.aired >= p.episodes.total) {
      p.status = 'ended';
      if (!warm && p.stationId === ps.id) {
        inbox(state, { fromNpc: 'npc_bia', subject: `"${p.title}" chegou ao fim`, body: `O último episódio de "${p.title}" foi ao ar. A faixa precisa de um substituto antes de colocar a próxima semana no ar.`, requiresAction: true, eventId: null, kind: 'alerta' });
        pushTimeline(state, `"${p.title}" terminou (média final ${p.stats.at(-1)?.pts.toLocaleString('pt-BR')} pts).`, 'programa');
      }
    }
    if (p.rights && p.rights.exhibitionsLeft !== null && p.rights.exhibitionsLeft <= 0 && p.status !== 'ended' && p.origin !== 'archive') {
      p.status = 'ended';
      if (!warm && p.stationId === ps.id) inbox(state, { fromNpc: 'npc_juridico', subject: `Direitos de "${p.title}" esgotados`, body: `As exibições contratadas de "${p.title}" acabaram. Ele precisa sair da grade.`, requiresAction: true, eventId: null, kind: 'alerta' });
    }
    if (!airedNow && p.status === 'on_air') p.status = p.isRerun || p.origin === 'archive' ? 'archive' : 'ready';
  }

  // finanças do jogador
  const pf = finances.get(ps.id)!;
  state.finance.lastWeek = pf;
  if (!warm) {
    state.finance.ytdRevenue += pf.revenue;
    state.finance.ytdCost += pf.production + pf.rights + pf.talent + pf.promo + pf.acquisitions;
    state.finance.ytdStructure += pf.structure;
    state.ytd.weeks += 1;
    state.ytd.pts24 += ps.history.at(-1)?.pts24 ?? 0;
    state.ytd.prime += ps.history.at(-1)?.prime ?? 0;
    const progCost = pf.production + pf.rights + pf.talent + pf.promo + pf.acquisitions;
    if (progCost > pf.budgetWeek * 1.1) state.finance.weeksOverBudget += 1;
    else state.finance.weeksOverBudget = Math.max(0, state.finance.weeksOverBudget - 1);
    const kinds: [string, number][] = [
      ['publicidade', pf.adRevenue], ['cotas', pf.quota], ['merchandising', pf.merch], ['arrendamento', pf.lease], ['outras_receitas', pf.other],
      ['producao', -pf.production], ['direitos', -pf.rights], ['aquisicoes', -pf.acquisitions], ['talentos', -pf.talent], ['chamadas', -pf.promo],
      ['multas', -pf.fines], ['compensacoes', -pf.compensation], ['estrutura', -pf.structure],
    ];
    for (const [kind, amount] of kinds) if (Math.abs(amount) > 0.5) out.ledger.push({ week, date: state.meta.date, stationId: ps.id, kind, amount: Math.round(amount) });
  }

  if (!warm) {
    // concorrência (antes, guarda o que foi ao ar para o jogador ver com uma semana de atraso)
    state.rivalSnapshot = Object.fromEntries(rivals(state).map((s) => [s.id, cloneWeek(state.schedules[s.id] ?? [])]));
    const actions = rivalWeekly(state);
    out.competitorActions.push(...actions);
    // recordes semanais
    const r24 = state.records.find((x) => x.key === 'semana24');
    const my24 = ps.history.at(-1)?.pts24 ?? 0;
    if (!r24 || my24 > r24.value) {
      if (r24) recordsMsgs.push(`Melhor semana da gestão nas 24 horas: ${my24.toLocaleString('pt-BR')} pontos.`);
      state.records = state.records.filter((x) => x.key !== 'semana24');
      state.records.push({ key: 'semana24', label: 'Melhor média semanal 24h', value: my24, week });
    }
    const rr = state.records.find((x) => x.key === 'receita');
    if (!rr || pf.revenue > rr.value) {
      state.records = state.records.filter((x) => x.key !== 'receita');
      state.records.push({ key: 'receita', label: 'Maior faturamento semanal', value: pf.revenue, week });
    }
    // conquistas
    const primeRank = [...stations].sort((a, b) => (b.history.at(-1)?.prime ?? 0) - (a.history.at(-1)?.prime ?? 0)).findIndex((s) => s.id === ps.id) + 1;
    if (primeRank === 1) achieve(state, 'lider_nobre', 'Líder do horário nobre');
    if (primeRank <= 2) achieve(state, 'top2_nobre', 'Entre as duas maiores do nobre');
    if (ranks.vespertino === 1 && (wp.bandAcc[`${ps.id}|vespertino|sunday`])) achieve(state, 'domingo', 'Venceu a tarde de domingo');
    // reações dos NPCs aos números
    npcWeeklyReactions(state, pf);
    // boletim
    if (report) {
      report.finance = pf;
      report.competitorMoves = actions.filter((a) => a.public).map((a) => ({ stationId: a.stationId, text: a.text }));
      report.records = recordsMsgs;
      report.alerts = weekAlerts(state, pf);
      const fb = boletimFallback(state, report);
      report.narrative = fb.narrative;
      report.headlines = fb.headlines;
    }
    // estatísticas semanais compactas (para histórico além de 4 semanas)
    out.weeklyStats.push({
      week,
      data: {
        programs: Object.fromEntries(progResults.map((r) => [r.programId, { s: r.stationId, t: r.title, p: r.pts, sh: r.share, n: r.airings, m: r.markets }])),
        stations: Object.fromEntries(stations.map((s) => [s.id, s.history.at(-1)])),
      },
    });
  }

  // avanço do tempo
  const prevDate = state.meta.date;
  state.meta.weekIndex += 1;
  if (!warm) state.meta.date = addDays(prevDate, 7);
  state.weekProgress = freshWeekProgress();

  if (warm) return;

  const newDate = state.meta.date;
  if (state.sports) advanceSports(state, newDate); // esporte real: placares dos jogos da semana que passou
  const closings: string[] = [];
  if (monthOf(newDate) !== monthOf(prevDate)) closings.push(...closeMonth(state, out, prevDate));
  if (yearOf(newDate) !== yearOf(prevDate)) closings.push(...closeYear(state, out, yearOf(prevDate)));
  realLineupChanges(state, out);
  state.kpis = computeKpis(state);
  // abaixo da meta?
  const below = (ps.history.at(-1)?.pts24 ?? 0) < state.targets.aud24 * 0.97 || state.kpis.revenueVsTarget < 0.95;
  state.weeksBelowTarget = below ? state.weeksBelowTarget + 1 : 0;
  const pres = npcByRole(state, 'presidente');
  if (pres) {
    if (state.weeksBelowTarget >= 3) pres.patience = clamp(pres.patience - 5 / difficultyMult(state, 'patience'), 0, 100);
    else pres.patience = clamp(pres.patience + 1.5, 0, 100);
  }
  if (report) {
    report.closings = closings;
    out.reports.push({ week, kind: 'week', day: null, data: report });
  }
  if (state.meta.status === 'active' && yearOf(newDate) > state.meta.startYear + 10) {
    state.meta.status = 'retired';
    out.endGame = { status: 'retired', reason: 'Fim do mandato: dez anos à frente da programação.' };
  }
}

function achieve(state: GameState, id: string, label: string): void {
  if (state.achievements.some((a) => a.id === id)) return;
  state.achievements.push({ id, label, week: state.meta.weekIndex });
  pushTimeline(state, `Conquista: ${label}`, 'conquista');
}

function weekAlerts(state: GameState, pf: WeekFinance): WeekReport['alerts'] {
  const alerts: WeekReport['alerts'] = [];
  if (pf.compensation > 0) alerts.push({ level: 'warn', text: `Cotas abaixo da entrega mínima: ${money(state.meta.era, pf.compensation)} em compensações.` });
  if (state.finance.weeksOverBudget >= 2) alerts.push({ level: 'warn', text: 'Custo de programação acima da verba há mais de uma semana.' });
  if (state.weekProgress.ratingViolations.length) alerts.push({ level: 'warn', text: 'Programa exibido fora do horário da classificação indicativa.' });
  const ps = playerStation(state);
  for (const c of state.contracts) {
    if (c.stationId !== ps.id || c.status !== 'active') continue;
    const left = c.endWeek - state.meta.weekIndex;
    if (left > 0 && left <= 4) {
      const n = npcById(state, c.npcId);
      if (n) alerts.push({ level: 'info', text: `Contrato de ${n.name} vence em ${left} semana(s).` });
    }
  }
  return alerts;
}

function npcWeeklyReactions(state: GameState, pf: WeekFinance): void {
  const ps = playerStation(state);
  for (const n of state.npcs) {
    if (n.stationId !== ps.id) continue;
    n.mood = Math.round(n.mood * 0.9);
  }
  const marta = npcByRole(state, 'comercial');
  if (marta) {
    if (pf.occupancy < 0.7) marta.mood = clamp(marta.mood - 4, -100, 100);
    else if (pf.occupancy > 0.85) marta.mood = clamp(marta.mood + 2, -100, 100);
    const weeklyTarget = state.finance.annualRevenueTarget / 52;
    if (weeklyTarget > 0) {
      const r = pf.revenue / weeklyTarget;
      if (r > 1.05) marta.trust = clamp(marta.trust + 0.6, 0, 100);
      if (r < 0.9) marta.trust = clamp(marta.trust - 0.6, 0, 100);
    }
  }
  // talentos reagem ao desempenho e ao espaço na grade
  const week = state.schedules[ps.id];
  const onGrid = programsInWeek(week);
  for (const p of state.programs) {
    if (p.stationId !== ps.id) continue;
    for (const tid of p.talentIds) {
      const n = npcById(state, tid);
      if (!n) continue;
      const last = p.stats.at(-1);
      if (!onGrid.has(p.id)) n.mood = clamp(n.mood - 4, -100, 100);
      else if (last && last.w === state.meta.weekIndex - 0 && last.rank === 1) n.mood = clamp(n.mood + 3, -100, 100);
      else if (last && last.rank >= 4) n.mood = clamp(n.mood - 1, -100, 100);
    }
  }
  // contratos com horário garantido
  for (const c of state.contracts) {
    if (c.stationId !== ps.id || c.status !== 'active' || !c.guaranteed?.programId) continue;
    if (!onGrid.has(c.guaranteed.programId)) {
      const n = npcById(state, c.npcId);
      if (n) {
        n.mood = clamp(n.mood - 8, -100, 100);
        n.trust = clamp(n.trust - 3, 0, 100);
      }
    }
  }
  // pedidos de reunião com prazo
  for (const n of state.npcs) {
    if (n.stationId !== ps.id) continue;
    const keep = [];
    for (const r of n.requests) {
      if (r.dueWeek < state.meta.weekIndex + 1 && (n.lastMetWeek ?? -99) < r.createdWeek) {
        n.mood = clamp(n.mood + r.penalty.mood, -100, 100);
        n.trust = clamp(n.trust + r.penalty.trust, 0, 100);
        pushTimeline(state, `${n.name} se sentiu ignorado(a): o pedido "${r.text}" ficou sem resposta.`, 'pessoas');
      } else if ((n.lastMetWeek ?? -99) < r.createdWeek) keep.push(r);
    }
    n.requests = keep;
  }
}

// ===== Ciclos maiores =====
function closeMonth(state: GameState, out: SimOutputs, prevDate: string): string[] {
  const month = monthOf(prevDate);
  const year = yearOf(prevDate);
  const k = computeKpis(state);
  state.kpis = k;
  const label = `${MONTH_NAMES[month - 1]} de ${year}`;
  state.monthScores.push({ month: `${year}-${String(month).padStart(2, '0')}`, score: k.score });
  if (state.monthScores.length > 140) state.monthScores.shift();
  out.kpiSnapshots.push({ periodType: 'month', periodStart: `${year}-${String(month).padStart(2, '0')}-01`, kpis: { ...k, label } });
  const pres = npcByRole(state, 'presidente');
  const pm = difficultyMult(state, 'patience');
  if (pres) {
    if (k.score >= 60) pres.trust = clamp(pres.trust + 3, 0, 100);
    else if (k.score < 35) pres.trust = clamp(pres.trust - 7 / pm, 0, 100);
    else if (k.score < 45) pres.trust = clamp(pres.trust - 4 / pm, 0, 100);
    if (state.player.background === 'herdeiro') pres.trust = clamp(pres.trust + 1, 0, 100);
  }
  const marta = npcByRole(state, 'comercial');
  if (marta) {
    if (k.revenueVsTarget >= 1) marta.trust = clamp(marta.trust + 3, 0, 100);
    else if (k.revenueVsTarget < 0.9) marta.trust = clamp(marta.trust - 4, 0, 100);
  }
  const notes = [`Fechamento de ${label}: nota ${k.score}/100, faturamento ${Math.round(k.revenueVsTarget * 100)}% da meta acumulada.`];
  out.reports.push({ week: state.meta.weekIndex - 1, kind: 'month', day: null, data: { label, kpis: k, narrative: evaluationFallback(state, k.score, label) } });
  inbox(state, {
    fromNpc: 'npc_presidente',
    subject: `Fechamento de ${label}`,
    body: `${evaluationFallback(state, k.score, label)[0].text}\n\nAudiência 24h: ${k.aud24.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts · Nobre: ${k.prime.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts · Faturamento: ${Math.round(k.revenueVsTarget * 100)}% da meta · Capital político: ${k.political}.`,
    requiresAction: false,
    eventId: null,
    kind: 'mensagem',
  });
  pushTimeline(state, notes[0], 'fechamento');
  if ([1, 4, 7, 10].includes(monthOf(state.meta.date))) notes.push(...closeQuarter(state, out, k));
  return notes;
}

function closeQuarter(state: GameState, out: SimOutputs, k: KpiSet): string[] {
  const notes: string[] = [];
  for (const p of state.programs) if (p.status === 'on_air') recomputePrice(state, p);
  notes.push('Tabela de preços reajustada pelo desempenho do trimestre.');
  const pol = politicalCapital(state);
  if (pol < 15) {
    const fire = k.score < 50 || state.meta.difficulty === 'lenda';
    if (fire) {
      state.meta.status = 'fired';
      out.endGame = { status: 'fired', reason: `Capital político em ${pol}: a presidência perdeu a confiança na reunião trimestral.` };
      pushTimeline(state, 'Demitido(a) na reunião trimestral.', 'carreira');
    } else {
      inbox(state, { fromNpc: 'npc_presidente', subject: 'Última chance', body: 'Seu capital político está no chão. Mais um trimestre assim e eu troco o diretor de programação.', requiresAction: false, eventId: null, kind: 'mensagem' });
    }
  } else if (pol < 30) {
    inbox(state, { fromNpc: 'npc_bia', subject: 'Rumores no corredor', body: 'Diretor, estão comentando que o presidente anda conversando com outros nomes para a sua cadeira. Capital político baixo.', requiresAction: false, eventId: null, kind: 'mensagem' });
  }
  state.finance.quarterBudget = state.finance.annualBudget / 4;
  out.kpiSnapshots.push({ periodType: 'quarter', periodStart: state.meta.date, kpis: { ...k, label: 'Trimestre' } });
  return notes;
}

function closeYear(state: GameState, out: SimOutputs, prevYear: number): string[] {
  const notes: string[] = [];
  const ps = playerStation(state);
  const score = annualScore(state);
  const verdict = verdictFor(score);
  state.evaluations.push({ year: prevYear, score, verdict });
  pushTimeline(state, `Avaliação anual de ${prevYear}: ${score}/100 — ${verdict}`, 'carreira');
  notes.push(`Avaliação anual de ${prevYear}: ${score}/100.`);
  out.reports.push({ week: state.meta.weekIndex - 1, kind: 'year', day: null, data: { year: prevYear, score, verdict, narrative: evaluationFallback(state, score, String(prevYear)) } });
  state.player.reputation = Math.round(clamp(state.player.reputation * 0.6 + score * 0.4, 0, 100));
  if (score < 40 && state.meta.status === 'active') {
    state.meta.status = 'fired';
    out.endGame = { status: 'fired', reason: `Avaliação anual de ${score}/100, abaixo do mínimo de 40.` };
  }
  const last2 = state.evaluations.slice(-2);
  if (last2.length === 2 && last2.every((e) => e.score >= 80)) {
    achieve(state, 'promocao', 'Convite para Diretor Geral');
    inbox(state, { fromNpc: 'npc_presidente', subject: 'Uma proposta', body: 'Dois anos seguidos acima de 80. Quero você como Diretor Geral. Pense com calma; por ora, siga cuidando da programação.', requiresAction: false, eventId: null, kind: 'mensagem' });
  }
  if (score >= 75) {
    const rv = rivals(state).sort((a, b) => b.power - a.power)[0];
    if (rv) inbox(state, { fromNpc: null, subject: `Convite da ${rv.name}`, body: `A ${rv.name} sondou você para assumir a programação de lá. Por enquanto, é só um café. (Aceitar transfere a carreira para outra emissora: use "Recomeçar em outra emissora" na tela Carreira.)`, requiresAction: false, eventId: null, kind: 'mensagem' });
  }
  // nova meta e verba
  const f = state.finance;
  const lastRevenue = f.ytdRevenue;
  const lastCost = f.ytdCost;
  const growth = 1.03 + (state.meta.difficulty === 'lenda' ? 0.02 : 0);
  f.annualRevenueTarget = Math.round(Math.max(lastRevenue, f.annualRevenueTarget * 0.95) * growth);
  const marginBeat = lastRevenue - lastCost > f.annualMarginTarget;
  f.annualBudget = Math.round(Math.max(lastCost, f.annualBudget * 0.95) * (marginBeat ? 1.08 : 1.0) + f.extraBudgetNextYear);
  f.annualMarginTarget = Math.round(f.annualRevenueTarget - f.annualBudget);
  f.extraBudgetNextYear = 0;
  f.ytdRevenue = 0;
  f.ytdCost = 0;
  f.ytdStructure = 0;
  state.ytd = { weeks: 0, pts24: 0, prime: 0 };
  state.targets.aud24 = round(Math.max(state.targets.aud24, (ps.history.slice(-8).reduce((s, x) => s + x.pts24, 0) / Math.max(1, ps.history.slice(-8).length))) * 1.02, 2);
  state.targets.prime = round(Math.max(state.targets.prime, (ps.history.slice(-8).reduce((s, x) => s + x.prime, 0) / Math.max(1, ps.history.slice(-8).length))) * 1.02, 2);
  notes.push(`Nova meta de faturamento: ${money(state.meta.era, f.annualRevenueTarget)}; verba de programação: ${money(state.meta.era, f.annualBudget)}.`);
  // líder ameaçada perde força ano a ano
  if (state.meta.scenario === 'lider_ameacada') {
    ps.power -= 0.035;
    const ch = rivals(state).sort((a, b) => b.power - a.power)[0];
    if (ch) ch.power += 0.025;
  }
  // direitos de futebol
  const newYear = prevYear + 1;
  if (ps.footballUntilYear && ps.footballUntilYear < newYear) {
    for (const p of state.programs) if (p.stationId === ps.id && p.genre === 'futebol' && p.origin === 'sports' && !p.flags.copa) p.status = 'ended';
    ps.footballUntilYear = null;
    inbox(state, { fromNpc: 'npc_juridico', subject: 'Fim dos direitos do campeonato', body: 'Os direitos de transmissão do campeonato terminaram. As faixas de futebol precisam de novos programas.', requiresAction: true, eventId: null, kind: 'alerta' });
  }
  setupCopaYear(state, newYear);
  // prêmio de fim de ano
  const best = state.programs.filter((p) => p.status === 'on_air' && GENRES[p.genre].group !== 'sistema').sort((a, b) => b.quality - a.quality)[0];
  if (best) {
    const st = state.stations.find((s) => s.id === best.stationId);
    if (best.stationId === ps.id) {
      achieve(state, `premio_${prevYear}`, `Troféu Antena de Ouro ${prevYear}: "${best.title}"`);
      ps.reputation.critics = clamp(ps.reputation.critics + 3, 0, 100);
    }
    notes.push(`Troféu Antena de Ouro ${prevYear}: "${best.title}" (${st?.name}).`);
  }
  return notes;
}

function realLineupChanges(state: GameState, out: SimOutputs): void {
  if (state.meta.universe !== 'real') return;
  const date = state.meta.date;
  for (const def of REAL_STATIONS[state.meta.era]) {
    const st = state.stations.find((s) => s.realKey === def.key);
    if (st && !st.isPlayer && def.until && date >= def.until && !st.closedWeek) {
      st.closedWeek = state.meta.weekIndex;
      out.competitorActions.push({ week: state.meta.weekIndex, date, stationId: st.id, kind: 'fechou', text: `${st.name} saiu do ar.`, public: true });
      pushTimeline(state, `${st.name} saiu do ar.`, 'mercado');
      fireEvent(state, 'rival_quebra', {}, { rival: st.name });
      for (const n of state.npcs) if (n.stationId === st.id) n.stationId = null;
    }
    if (!st && def.from && date >= def.from && (!def.until || date < def.until)) {
      const ns = addRealStation(state, def);
      out.competitorActions.push({ week: state.meta.weekIndex, date, stationId: ns.id, kind: 'estreou', text: `${ns.name} entrou no ar.`, public: true });
      pushTimeline(state, `${ns.name} entrou no ar.`, 'mercado');
    }
  }
}

// ===== Início da semana =====
export function startWeek(state: GameState, out: SimOutputs, opts: { quiet?: boolean } = {}): void {
  const week = state.meta.weekIndex;
  const ps = playerStation(state);
  state.agenda = { points: 20, meetings: 0, weekIndex: week };
  state.llm = { weekCalls: 0, weekIndex: week };
  out.notes.push(...expireEvents(state));
  const delayedNotes = applyDelayed(state);
  for (const n of delayedNotes) inbox(state, { fromNpc: 'npc_bia', subject: 'Consequência de uma decisão antiga', body: n, requiresAction: false, eventId: null, kind: 'mensagem' });
  // desenvolvimento
  const { ready } = devProgress(state);
  for (const p of ready) {
    if (p.stationId !== ps.id) continue;
    inbox(state, { fromNpc: 'npc_artistico', subject: `"${p.title}" está pronto para estrear`, body: `A produção de "${p.title}" terminou. Ele está no acervo, pronto para entrar na grade. Estreia com chamadas rende mais.`, requiresAction: false, eventId: null, kind: 'mensagem' });
    pushTimeline(state, `"${p.title}" ficou pronto para estrear.`, 'programa');
  }
  for (const n of resolveAuctions(state)) inbox(state, { fromNpc: 'npc_comercial', subject: 'Resultado do leilão', body: n, requiresAction: false, eventId: null, kind: 'mensagem' });
  // esporte real (v2): a liga muda horários e adia jogos; cada emissora escolhe os jogos da semana; cotas da temporada
  if (state.sports) {
    planCalendarChanges(state, state.meta.date);
    assignBroadcasts(state);
    for (const n of sellSportsCotas(state)) inbox(state, { fromNpc: 'npc_comercial', subject: 'Cotas do esporte', body: n, requiresAction: false, eventId: null, kind: 'mensagem' });
    const decisive = opts.quiet ? null : decisiveBroadcast(state);
    if (decisive) fireEvent(state, 'esporte_prorrogacao', {}, { jogo: decisive.title });
  }
  // contratos de direitos (v2): parcelas, horário prometido e vencimentos
  if (state.rightsContracts?.length) {
    const rc = processContracts(state);
    for (const n of rc.notes) inbox(state, { fromNpc: 'npc_juridico', subject: 'Contratos de direitos', body: n, requiresAction: false, eventId: null, kind: 'mensagem' });
  }
  // contratos
  for (const c of state.contracts) {
    if (c.status !== 'active') continue;
    const n = npcById(state, c.npcId);
    if (!n) continue;
    const left = c.endWeek - week;
    if (c.stationId === ps.id && left === 6 && !state.flags[`ren_${c.id}`]) {
      state.flags[`ren_${c.id}`] = week;
      fireEvent(state, 'renovacao_contrato', { talent: n });
    }
    if (left < 0) {
      c.status = 'ended';
      if (c.stationId === ps.id) {
        n.stationId = null;
        n.contractId = null;
        for (const p of state.programs) p.talentIds = p.talentIds.filter((x) => x !== n.id);
        inbox(state, { fromNpc: 'npc_juridico', subject: `Contrato de ${n.name} encerrado`, body: `O contrato de ${n.name} terminou sem renovação. ${n.name} está livre no mercado.`, requiresAction: false, eventId: null, kind: 'mensagem' });
      }
    }
  }
  if (!opts.quiet) {
    calendarEvents(state);
    poaching(state);
    if (week >= 1) drawWeekEvents(state);
    progressArcs(state);
    npcRequests(state);
  }
  refreshOffers(state);
  state.liveMoments = computeLiveMoments(state);
  for (const p of state.programs) if (p.status === 'on_air' && p.price30s <= 0) recomputePrice(state, p);
}

function calendarEvents(state: GameState): void {
  const date = state.meta.date;
  const month = monthOf(date);
  const day = parseInt(date.slice(8, 10), 10);
  const year = yearOf(date);
  const ps = playerStation(state);
  if (month === 3 && day <= 7 && state.flags[`upfront_${year}`] === undefined) {
    state.flags[`upfront_${year}`] = true;
    fireEvent(state, 'upfront', {});
  }
  if (COPAS[year] && !state.catalog?.sports && !state.flags[`copa_${year}_${ps.id}`] && state.flags[`copaoffer_${year}`] === undefined) {
    const start = COPAS[year].start;
    const weeksTo = (Date.parse(start) - Date.parse(date)) / (7 * 86400000);
    if (weeksTo <= 16 && weeksTo > 3) {
      state.flags[`copaoffer_${year}`] = true;
      fireEvent(state, 'copa_direitos', {});
    }
  }
  const next = addDays(date, 7);
  if (inHgpe(next) && !inHgpe(date) && hgpeWindow(year)) fireEvent(state, 'hgpe_aviso', {});
  if (month === 10 && day <= 7 && state.flags[`leilao_${year}`] === undefined) {
    state.flags[`leilao_${year}`] = true;
    fireEvent(state, 'leilao_futebol', {});
  }
  // aviso de fim de trama: só dramaturgia própria (dá para esticar), ~3 semanas antes, um por semana
  const showings = new Map<string, number>();
  for (const d of state.schedules[ps.id]) for (const b of d) showings.set(b.programId, (showings.get(b.programId) ?? 0) + 1);
  for (const p of state.programs) {
    if (p.stationId !== ps.id || p.status !== 'on_air' || !p.episodes.total || p.isRerun || p.flags.endingWarned) continue;
    if (p.origin !== 'own' || !(p.genre.startsWith('novela') || p.genre === 'serie_nacional')) continue;
    const left = p.episodes.total - p.episodes.aired;
    const perWeek = Math.max(1, showings.get(p.id) ?? 0);
    if (left > 0 && left <= perWeek * 3) {
      p.flags.endingWarned = true;
      fireEvent(state, 'novela_acabando', { program: p });
      break;
    }
  }
}

function poaching(state: GameState): void {
  const ps = playerStation(state);
  const rng = rngFor(state.meta.seed, 'poach', state.meta.weekIndex);
  for (const r of rivals(state)) {
    const flag = state.flags[`poach_${r.id}`];
    const recent = typeof flag === 'number' && flag >= state.meta.weekIndex - 1;
    const base = recent ? 0.6 : 0.03 * difficultyMult(state, 'rival');
    if (!rng.chance(base)) continue;
    const cands = state.npcs.filter((n) => {
      if (n.role !== 'talento' || n.stationId !== ps.id || !n.talent) return false;
      const c = state.contracts.find((x) => x.id === n.contractId && x.status === 'active');
      const months = c ? (c.endWeek - state.meta.weekIndex) / 4.33 : 0;
      return (months <= 6 || n.mood < -20) && n.talent.popularity >= 55;
    });
    if (!cands.length) continue;
    if (state.events.some((e) => !e.resolved && e.templateId === 'talento_assediado')) return;
    const t = rng.pick(cands);
    fireEvent(state, 'talento_assediado', { talent: t }, { rival: r.name, rivalId: r.id });
    state.flags[`poach_${r.id}`] = -1;
    return;
  }
}

function npcRequests(state: GameState): void {
  const rng = rngFor(state.meta.seed, 'requests', state.meta.weekIndex);
  const ps = playerStation(state);
  if (!rng.chance(0.55)) return;
  const roles: [NpcRole, string, { mood: number; trust: number }][] = [
    ['comercial', 'Preciso de 30 minutos com você sobre a política de descontos', { mood: -8, trust: -3 }],
    ['jornalismo', 'Quero discutir a cobertura especial da próxima semana', { mood: -8, trust: -3 }],
    ['artistico', 'Tenho um projeto novo para te mostrar', { mood: -6, trust: -2 }],
    ['promocao', 'Quero alinhar as chamadas das próximas estreias', { mood: -5, trust: -2 }],
    ['pesquisa', 'Tenho uma análise de público que você precisa ver', { mood: -4, trust: -2 }],
  ];
  const [role, text, penalty] = rng.pick(roles);
  const n = npcByRole(state, role);
  if (!n || n.requests.length) return;
  n.requests.push({ id: `rq_${state.meta.weekIndex}_${role}`, text, dueWeek: state.meta.weekIndex + 1, penalty, createdWeek: state.meta.weekIndex });
  inbox(state, { fromNpc: n.id, subject: 'Pedido de reunião', body: `${text}. Pode ser até o fim da semana que vem? — ${n.name}`, requiresAction: true, eventId: null, kind: 'pedido' });
  // talentos insatisfeitos também pedem conversa
  const unhappy = state.npcs.find((x) => x.role === 'talento' && x.stationId === ps.id && x.mood < -25 && !x.requests.length);
  if (unhappy && rng.chance(0.5)) {
    unhappy.requests.push({ id: `rq_${state.meta.weekIndex}_${unhappy.id}`, text: 'Quero conversar sobre o meu espaço na emissora', dueWeek: state.meta.weekIndex + 1, penalty: { mood: -10, trust: -5 }, createdWeek: state.meta.weekIndex });
    inbox(state, { fromNpc: unhappy.id, subject: 'Precisamos conversar', body: `Diretor, ando insatisfeito(a) com o meu espaço. Quero uma conversa até a semana que vem. — ${unhappy.name}`, requiresAction: true, eventId: null, kind: 'pedido' });
  }
}

// ===== Aquecimento e metas iniciais =====
export function runWarmup(state: GameState): void {
  const start = state.meta.date;
  const out = newOutputs();
  state.meta.weekIndex = -3;
  for (let w = 0; w < 3; w++) {
    for (let d = 0; d < 7; d++) simulateNextDay(state, out);
    closeWeek(state, out, { warmup: true });
    for (const p of state.programs) if (p.status === 'on_air' || p.stats.length) recomputePrice(state, p);
  }
  // descarta a primeira semana de aquecimento (sem tabela de preços ainda)
  for (const st of state.stations) st.history = st.history.filter((h) => h.w > -3);
  for (const p of state.programs) p.stats = p.stats.filter((s) => s.w > -3);
  state.meta.weekIndex = 0;
  state.meta.date = start;
  const ps = playerStation(state);
  const sc = SCENARIOS[state.meta.scenario];
  const cashWeeksByArch: Record<string, number> = { hegemonica: 50, popular_auditorio: 20, desafiante: 25, jornalistica_esportiva: 10, em_crise: -10, publica_educativa: 5, canal_pago: 10 };
  for (const st of state.stations) {
    const last = st.history.at(-1);
    const rev = last?.rev ?? 1_000_000;
    st.weeklyStructure = st.isPlayer ? Math.round(rev * (state.meta.scenario === 'emissora_crise' ? 0.5 : state.meta.scenario === 'rede_nova' ? 0.32 : 0.27)) : rivalStructure(st, rev);
    st.cash = Math.round(rev * (st.isPlayer ? sc.cashWeeks : cashWeeksByArch[st.archetype] ?? 10));
    // recalcula o histórico de custo com a estrutura
    for (const h of st.history) h.cost += st.weeklyStructure;
  }
  const pf = state.finance.lastWeek;
  const rev = pf?.revenue ?? 1_000_000;
  const progCost = pf ? pf.production + pf.rights + pf.talent + pf.promo : rev * 0.6;
  const budgetF: Record<string, number> = { lider_ameacada: 1.02, vice_ambiciosa: 1.06, emissora_crise: 0.97, rede_nova: 1.4, canal_pago: 1.02 };
  const growthF: Record<string, number> = { lider_ameacada: 1.02, vice_ambiciosa: 1.05, emissora_crise: 1.05, rede_nova: 1.12, canal_pago: 1.05 };
  const diffBudget = state.meta.difficulty === 'estagiario' ? 1.15 : state.meta.difficulty === 'lenda' ? 0.93 : 1;
  const diffGrowth = state.meta.difficulty === 'estagiario' ? 0.97 : state.meta.difficulty === 'lenda' ? 1.04 : 1;
  const sKey = state.meta.scenario;
  state.finance.annualBudget = Math.round(progCost * 52 * (budgetF[sKey] ?? 1) * diffBudget);
  state.finance.annualRevenueTarget = Math.round(rev * 52 * (growthF[sKey] ?? 1.04) * diffGrowth);
  state.finance.annualMarginTarget = Math.round(state.finance.annualRevenueTarget - state.finance.annualBudget);
  state.finance.quarterBudget = state.finance.annualBudget / 4;
  state.finance.ytdRevenue = 0;
  state.finance.ytdCost = 0;
  state.finance.ytdStructure = 0;
  state.finance.weeksOverBudget = 0;
  state.ytd = { weeks: 0, pts24: 0, prime: 0 };
  const audGrowth: Record<string, number> = { lider_ameacada: 1.0, vice_ambiciosa: 1.05, emissora_crise: 1.1, rede_nova: 1.2, canal_pago: 1.1 };
  const last = ps.history.at(-1);
  state.targets.aud24 = round((last?.pts24 ?? 1) * (audGrowth[sKey] ?? 1.05) * diffGrowth, 2);
  state.targets.prime = round((last?.prime ?? 1) * (audGrowth[sKey] ?? 1.05) * diffGrowth, 2);
  const rankT: Record<string, number> = { lider_ameacada: 1, vice_ambiciosa: 2, emissora_crise: 3, rede_nova: 4, canal_pago: 0 };
  state.targets.rankTarget = rankT[sKey] ?? 2;
  const descr: Record<string, string> = {
    lider_ameacada: 'Manter a liderança em pelo menos 6 das 8 faixas e segurar o faturamento.',
    vice_ambiciosa: 'Consolidar o 2º lugar, vencer a tarde de domingo e crescer 5% na audiência.',
    emissora_crise: 'Subir para o 3º lugar no nobre em até 2 anos e zerar o arrendamento no horário nobre.',
    rede_nova: 'Chegar ao 4º lugar nas 24 horas em até 2 anos sem estourar o dinheiro do investidor.',
    canal_pago: 'Crescer a audiência qualificada e a receita mista (assinatura + publicidade).',
  };
  state.targets.description = descr[sKey] ?? '';
  state.targets.revenue = state.finance.annualRevenueTarget;
  state.targets.margin = state.finance.annualMarginTarget;
  state.weekProgress = freshWeekProgress();
  state.kpis = computeKpis(state);
  state.lastReportWeek = null;
  state.rivalSnapshot = Object.fromEntries(rivals(state).map((s) => [s.id, cloneWeek(state.schedules[s.id] ?? [])]));
}

export function firstWeekSetup(state: GameState): SimOutputs {
  const out = newOutputs();
  startWeek(state, out, { quiet: true });
  return out;
}

// executa até fechar a semana (modo semana) ou só um dia (modo detalhado)
export function simulate(state: GameState, mode: 'day' | 'week', live?: { day: number; programId: string; decisions: string[] }): SimOutputs {
  const out = newOutputs();
  const wp = state.weekProgress;
  if (mode === 'day') {
    simulateNextDay(state, out, live && live.day === wp.day ? live : undefined);
  } else {
    while (state.weekProgress.day < 7) {
      const d = state.weekProgress.day;
      simulateNextDay(state, out, live && live.day === d ? live : undefined);
    }
  }
  if (state.weekProgress.day >= 7) {
    closeWeek(state, out);
    out.weekClosed = true;
    if (state.meta.status === 'active') startWeek(state, out);
  }
  return out;
}

export function weekNumberLabel(state: GameState): string {
  const year = yearOf(state.meta.date);
  const first = firstMondayOfYear(year);
  const n = Math.floor((Date.parse(state.meta.date) - Date.parse(first)) / (7 * 86400000)) + 1;
  return `Semana ${n} de ${year} (${formatDate(state.meta.date)})`;
}

export { talentLeaves };
