// Motor de eventos (seção 13): gatilhos, sorteio ponderado, aplicação de efeitos e arcos.

import { ADVERTISERS, COLUMNS } from './catalog/names.ts';
import { ARCS, EVENT_BY_ID, EVENT_TEMPLATES } from './catalog/events.ts';
import type { Cond, EventTemplate } from './catalog/events.ts';
import { GENRES } from './catalog/genres.ts';
import { ROLE_LABELS } from './catalog/npcs.ts';
import { mainBand } from './commercial.ts';
import { money } from './money.ts';
import { clamp, rngFor } from './rng.ts';
import type { Rng } from './rng.ts';
import { programsInWeek } from './schedule.ts';
import {
  avgWeeklyRevenue, difficultyMult, getProgram, nextId, npcById, npcByRole, playerStation, politicalCapital, pushTimeline, rivals,
} from './state.ts';
import type { EffectSet, GameEvent, GameState, InboxDraft, Npc, NpcRole, Program } from './types.ts';
import { monthOf, PRIME_BANDS, yearOf } from './time.ts';

interface EvalCtx {
  program?: Program;
  talent?: Npc;
}

const ROLES: NpcRole[] = ['presidente', 'comercial', 'jornalismo', 'artistico', 'pesquisa', 'assistente', 'promocao', 'juridico'];

function lastStat(p: Program) {
  return p.stats[p.stats.length - 1];
}

function delta4w(p: Program): number {
  if (p.stats.length < 3) return 0;
  const last = lastStat(p).pts;
  const prev = p.stats.slice(-5, -1);
  const avg = prev.reduce((s, x) => s + x.pts, 0) / prev.length;
  return last - avg;
}

function talentPrograms(state: GameState, n: Npc): Program[] {
  return state.programs.filter((p) => p.talentIds.includes(n.id) && p.status === 'on_air');
}

function playerHasGenre(state: GameState, pred: (p: Program, day: number, start: number) => boolean): boolean {
  const ps = playerStation(state);
  const week = state.schedules[ps.id];
  for (let d = 0; d < 7; d++) for (const b of week[d]) {
    const p = getProgram(state, b.programId);
    if (p && pred(p, d, b.start)) return true;
  }
  return false;
}

function topRevenueProgramId(state: GameState): string | null {
  const ps = playerStation(state);
  let best: Program | null = null;
  for (const p of state.programs) {
    if (p.stationId !== ps.id || p.status !== 'on_air') continue;
    const s = lastStat(p);
    if (!s) continue;
    if (!best || s.rev > (lastStat(best)?.rev ?? 0)) best = p;
  }
  return best?.id ?? null;
}

export function getPath(state: GameState, path: string, ctx: EvalCtx): unknown {
  const [root, ...rest] = path.split('.');
  const key = rest.join('.');
  const ps = playerStation(state);
  switch (root) {
    case 'game':
      switch (key) {
        case 'year':
        case 'yearIn':
          return yearOf(state.meta.date);
        case 'month':
          return monthOf(state.meta.date);
        case 'week':
          return state.meta.weekIndex;
        case 'era':
          return state.meta.era;
        case 'scenario':
        case 'scenarioIn':
          return state.meta.scenario;
        case 'universe':
          return state.meta.universe;
        case 'rivalInCrisis':
          return rivals(state).some((s) => s.archetype === 'em_crise' && s.cash < -(s.history.at(-1)?.rev ?? 1) * 20);
      }
      return undefined;
    case 'player': {
      const k = state.kpis;
      switch (key) {
        case 'rankPrime': {
          const ranking = [...state.stations].filter((s) => !s.closedWeek).sort((a, b) => (b.history.at(-1)?.prime ?? 0) - (a.history.at(-1)?.prime ?? 0));
          return ranking.findIndex((s) => s.id === ps.id) + 1;
        }
        case 'pts24':
          return ps.history.at(-1)?.pts24 ?? 0;
        case 'political':
          return politicalCapital(state);
        case 'occupancy':
          return state.finance.lastWeek?.occupancy ?? 0.75;
        case 'revVsTarget':
          return k?.revenueVsTarget ?? 1;
        case 'repPublic':
          return ps.reputation.public;
        case 'repCritics':
          return ps.reputation.critics;
        case 'repMarket':
          return ps.reputation.market;
        case 'hasSports':
          return !!ps.footballUntilYear && ps.footballUntilYear >= yearOf(state.meta.date);
        case 'hasReality':
          return playerHasGenre(state, (p) => p.genre === 'reality');
        case 'hasKids':
          return playerHasGenre(state, (p) => p.genre === 'infantil');
        case 'hasSundayShow':
          return playerHasGenre(state, (p, d, s) => d === 6 && (p.genre === 'auditorio' || p.genre === 'game_show') && s >= 24 && s < 56);
        case 'hasOwnNovela':
          return playerHasGenre(state, (p) => p.genre.startsWith('novela') && p.origin === 'own' && !p.isRerun);
        case 'hasNetwork':
          return ps.hasNetwork;
        case 'analyst':
          return state.research.analyst || !!state.flags.informante;
        case 'mbm':
          return state.research.mbm;
        case 'weeksBelow':
          return state.weeksBelowTarget;
      }
      return undefined;
    }
    case 'program': {
      const p = ctx.program;
      if (!p) return undefined;
      const s = lastStat(p);
      switch (key) {
        case 'genre':
          return p.genre;
        case 'group':
        case 'groupIn':
          return GENRES[p.genre].group;
        case 'rank':
          return s?.rank ?? 9;
        case 'pts':
          return s?.pts ?? 0;
        case 'share':
          return s?.share ?? 0;
        case 'delta4w':
          return delta4w(p);
        case 'weeksOnAir':
          return p.stats.length;
        case 'epsLeft':
          return p.episodes.total ? p.episodes.total - p.episodes.aired : 999;
        case 'isFinite':
          return p.episodes.total !== null;
        case 'isNovela':
          return p.genre.startsWith('novela') && !p.isRerun;
        case 'origin':
          return p.origin;
        case 'hasTalent':
          return p.talentIds.length > 0;
        case 'merch':
          return p.merchLevel;
        case 'quality':
          return p.quality;
        case 'fatigue':
          return p.fatigue;
        case 'buzz':
          return p.buzz;
        case 'commercial':
          return p.commercial;
        case 'ratingViolation':
          return state.flags[`rv_${p.id}`] === state.meta.weekIndex - 1;
        case 'isPrime':
          return PRIME_BANDS.includes(mainBand(state, p));
        case 'isTopRevenue':
          return topRevenueProgramId(state) === p.id;
        case 'inDevelopment':
          return p.status === 'development';
        case 'movesRecent':
          return p.movesRecent.filter((w) => w >= state.meta.weekIndex - 6).length;
        case 'isRecord':
          return p.flags.recordWeek === state.meta.weekIndex - 1;
        case 'status':
          return p.status;
      }
      return undefined;
    }
    case 'talent': {
      const n = ctx.talent;
      if (!n || !n.talent) return undefined;
      const c = state.contracts.find((x) => x.id === n.contractId && x.status === 'active');
      const progs = talentPrograms(state, n);
      switch (key) {
        case 'ego':
          return n.talent.ego;
        case 'mood':
          return n.mood;
        case 'loyalty':
          return n.loyalty;
        case 'popularity':
          return n.talent.popularity;
        case 'risk':
          return n.talent.risk;
        case 'monthsLeft':
          return c ? (c.endWeek - state.meta.weekIndex) / 4.33 : 0;
        case 'onAir':
          return progs.length > 0;
        case 'programRank':
          return progs.length ? Math.min(...progs.map((p) => lastStat(p)?.rank ?? 9)) : 9;
        case 'programIsNovela':
          return progs.some((p) => p.genre.startsWith('novela'));
        case 'archetypeIn':
          return n.talent.archetype;
      }
      return undefined;
    }
    case 'npc': {
      const [role, field] = rest;
      const n = npcByRole(state, role as NpcRole);
      if (!n) return undefined;
      return (n as unknown as Record<string, unknown>)[field];
    }
    case 'flag':
      return state.flags[key];
    case 'arc': {
      const a = state.arcs.find((x) => x.key === key);
      return a ? (a.done ? 99 : a.stage) : -1;
    }
  }
  return undefined;
}

export function evalCond(state: GameState, c: Cond, ctx: EvalCtx): boolean {
  const [path, op, val] = c;
  const v = getPath(state, path, ctx);
  switch (op) {
    case 'true':
      return !!v;
    case 'false':
      return !v;
    case 'eq':
      return v === val;
    case 'ne':
      return v !== val;
    case 'lte':
      return typeof v === 'number' && v <= (val as number);
    case 'lt':
      return typeof v === 'number' && v < (val as number);
    case 'gte':
      return typeof v === 'number' && v >= (val as number);
    case 'gt':
      return typeof v === 'number' && v > (val as number);
    case 'in':
      return Array.isArray(val) && (val as unknown[]).includes(v as never);
  }
  return false;
}

function eraOk(state: GameState, t: EventTemplate): boolean {
  if (t.eras !== 'all' && !t.eras.includes(state.meta.era)) return false;
  if (t.universe !== 'all' && !t.universe.includes(state.meta.universe)) return false;
  return true;
}

function cooldownOk(state: GameState, t: EventTemplate): boolean {
  const last = state.flags[`evcd_${t.id}`];
  if (typeof last === 'number') {
    if (t.oncePerGame) return false;
    if (t.cooldownWeeks && state.meta.weekIndex - last < t.cooldownWeeks) return false;
  }
  return true;
}

function candidates(state: GameState, t: EventTemplate): EvalCtx[] {
  const ps = playerStation(state);
  if (t.subject === 'program') {
    const needsDev = t.trigger.some((c) => c[0] === 'program.inDevelopment');
    return state.programs
      .filter((p) => p.stationId === ps.id && (needsDev ? p.status === 'development' : p.status === 'on_air') && GENRES[p.genre].group !== 'sistema' && p.origin !== 'leased')
      .map((p) => ({ program: p }));
  }
  if (t.subject === 'talent') {
    return state.npcs
      .filter((n) => n.role === 'talento' && n.stationId === ps.id && n.talent)
      .map((n) => ({ talent: n, program: talentPrograms(state, n)[0] }));
  }
  return [{}];
}

function eligibleContexts(state: GameState, t: EventTemplate): EvalCtx[] {
  return candidates(state, t).filter((ctx) => t.trigger.every((c) => evalCond(state, c, ctx)));
}

function pickAdvertiser(state: GameState, rng: Rng, p?: Program): string {
  const pool = ADVERTISERS.filter((a) => a.eras.includes(state.meta.era));
  if (p) {
    const liked = pool.filter((a) => a.likes.includes(p.genre));
    if (liked.length) return rng.pick(liked).name;
  }
  return rng.pick(pool).name;
}

function strongestRival(state: GameState): string {
  const rs = rivals(state).sort((a, b) => (b.history.at(-1)?.prime ?? 0) - (a.history.at(-1)?.prime ?? 0));
  return rs[0]?.name ?? 'concorrência';
}

export function fillText(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function describeEffects(state: GameState, eff: EffectSet, ctx: GameEvent['context']): string {
  const parts: string[] = [];
  const avg = avgWeeklyRevenue(state);
  const era = state.meta.era;
  const cash = (eff.cash ?? 0) + (eff.cashWeeks ?? 0) * avg;
  if (cash < 0) parts.push(`custo ≈ ${money(era, -cash)}`);
  if (cash > 0) parts.push(`receita ≈ ${money(era, cash)}`);
  if (eff.fine) parts.push(`multa ≈ ${money(era, eff.fine * avg)}`);
  if (eff.salaryPct) {
    const n = ctx.npcId ? npcById(state, ctx.npcId) : null;
    const c = n ? state.contracts.find((x) => x.id === n.contractId) : null;
    parts.push(`salário +${eff.salaryPct}%${c ? ` (${money(era, (c.salaryWeekly * eff.salaryPct) / 100)}/semana)` : ''}`);
  }
  if (eff.budget) parts.push(`verba anual ${eff.budget > 0 ? '+' : ''}${Math.round(eff.budget * 100)}%`);
  if (eff.talentLeaves) parts.push('o talento deixa a emissora');
  for (const n of eff.npc ?? []) {
    const name = n.target === 'context_talent' ? (ctx.npcId ? npcById(state, ctx.npcId)?.name.split(' ')[0] : 'talento') : npcByRole(state, n.target as NpcRole)?.name.split(' ')[0] ?? ROLE_LABELS[n.target as NpcRole];
    const v = (n.mood ?? 0) + (n.trust ?? 0) * 1.5 + (n.loyalty ?? 0) * 0.5 + (n.patience ?? 0) * 0.5;
    if (v !== 0) parts.push(`${name} ${v > 0 ? (v >= 12 ? '⬆⬆' : '⬆') : v <= -12 ? '⬇⬇' : '⬇'}`);
  }
  if (eff.program) {
    const pr = eff.program;
    const sum = (pr.buzz ?? 0) * 0.5 + (pr.quality ?? 0) + (pr.appeal ?? 0) + ((pr.mult ?? 1) - 1) * 100 - (pr.fatigue ?? 0) * 0.5;
    if (pr.endNow) parts.push('cancela o projeto');
    else if (pr.extendEps) parts.push(`+${pr.extendEps} capítulos`);
    else if (sum !== 0) parts.push(`programa ${sum > 0 ? '⬆' : '⬇'}`);
  }
  if (eff.reputation) {
    const r = eff.reputation;
    if (r.critics) parts.push(`crítica ${r.critics > 0 ? '⬆' : '⬇'}`);
    if (r.public) parts.push(`público ${r.public > 0 ? '⬆' : '⬇'}`);
    if (r.market) parts.push(`mercado ${r.market > 0 ? '⬆' : '⬇'}`);
  }
  if (eff.occupancy) parts.push(`ocupação ${eff.occupancy.delta > 0 ? '⬆' : '⬇'}`);
  if (eff.priceMult) parts.push(`tabela ${eff.priceMult > 1 ? '+' : ''}${Math.round((eff.priceMult - 1) * 100)}%`);
  if (eff.agenda) parts.push(`${-eff.agenda} pts de agenda`);
  if (eff.addOffer) parts.push('abre oferta no mercado');
  if (eff.allBuzz) parts.push(`buzz geral ${eff.allBuzz > 0 ? '⬆' : '⬇'}`);
  if (eff.tle) parts.push(`audiência ${eff.tle.mult > 1 ? '⬆' : '⬇'}`);
  if (eff.research) parts.push('pesquisa mais precisa');
  if (eff.delayed) parts.push('consequência futura');
  return parts.join(' · ') || 'sem efeito imediato';
}

export function fireEvent(state: GameState, templateId: string, ctx: EvalCtx, extra: Record<string, string | number> = {}): GameEvent | null {
  const t = EVENT_BY_ID[templateId];
  if (!t) return null;
  const rng = rngFor(state.meta.seed, 'event', state.meta.weekIndex, templateId);
  const ps = playerStation(state);
  const col = rng.pick(COLUMNS);
  const vars: Record<string, string | number> = {
    station: ps.name,
    rival: strongestRival(state),
    advertiser: pickAdvertiser(state, rng, ctx.program),
    column: col.column,
    year: yearOf(state.meta.date),
    ...extra,
  };
  if (ctx.program) vars.program = `"${ctx.program.title}"`;
  if (ctx.talent) vars.talent = ctx.talent.name;
  if (!vars.program && ctx.talent) {
    const tp = talentPrograms(state, ctx.talent)[0];
    vars.program = tp ? `"${tp.title}"` : 'o programa';
    if (tp) ctx.program = tp;
  }
  if (!vars.program) vars.program = 'o programa';
  if (!vars.talent) vars.talent = 'o talento';
  const evCtx: GameEvent['context'] = { programId: ctx.program?.id, npcId: ctx.talent?.id, vars };
  if (typeof extra.rivalId === 'string') evCtx.rivalId = extra.rivalId;
  let speaker: string | null = t.speaker;
  if (speaker === 'context_talent') speaker = ctx.talent?.id ?? 'npc_bia';
  const deadline = t.deadlineWeeks ?? (t.blocking ? 0 : 1);
  const ev: GameEvent = {
    id: nextId(state, 'ev'),
    templateId,
    category: t.category,
    title: t.title,
    severity: t.severity,
    tone: t.tone,
    firedWeek: state.meta.weekIndex,
    deadlineWeek: state.meta.weekIndex + deadline,
    blocking: !!t.blocking,
    context: evCtx,
    scene: fillText(t.scene, vars),
    narrated: false,
    speaker,
    options: t.options.map((o) => ({ id: o.id, label: o.label, hint: describeEffects(state, o.effects, evCtx), effects: o.effects })),
    defaultOption: t.defaultOption,
    resolved: false,
    chosen: null,
    outcome: null,
  };
  state.events.push(ev);
  state.flags[`evcd_${templateId}`] = state.meta.weekIndex;
  if (t.severity === 'grave') state.flags.lastGraveMonth = `${yearOf(state.meta.date)}-${monthOf(state.meta.date)}`;
  const tone = state.flags.toneCount as string | undefined;
  const [pos, total] = (tone ?? '0/0').split('/').map((x) => parseInt(x, 10));
  state.flags.toneCount = `${pos + (t.tone === 'positivo' ? 1 : 0)}/${total + 1}`;
  const from = speaker && npcById(state, speaker) ? speaker : null;
  const draft: InboxDraft = {
    fromNpc: from,
    subject: t.title,
    body: ev.scene,
    requiresAction: true,
    eventId: ev.id,
    kind: 'evento',
  };
  state.pendingInbox.push(draft);
  return ev;
}

// sorteio semanal (seção 13.4): 2-4 eventos médios/leves, no máximo 1 grave por mês, >=30% positivos
export function drawWeekEvents(state: GameState): GameEvent[] {
  const rng = rngFor(state.meta.seed, 'draw', state.meta.weekIndex);
  const fired: GameEvent[] = [];
  const base = state.meta.difficulty === 'lenda' ? 3.6 : state.meta.difficulty === 'estagiario' ? 2.6 : 3.2;
  const target = clamp(Math.round(rng.normal(base, 0.8)), 2, 5);
  const [pos, total] = String(state.flags.toneCount ?? '0/0').split('/').map((x) => parseInt(x, 10));
  const needPositive = total >= 4 && pos / total < 0.33;
  const graveKey = `${yearOf(state.meta.date)}-${monthOf(state.meta.date)}`;
  const graveBlocked = state.flags.lastGraveMonth === graveKey;
  const pool = EVENT_TEMPLATES.filter((t) => !t.calendar && t.baseProb > 0 && eraOk(state, t) && cooldownOk(state, t));
  const weighted: { t: EventTemplate; ctxs: EvalCtx[]; w: number }[] = [];
  for (const t of pool) {
    if (t.severity === 'grave' && graveBlocked) continue;
    const ctxs = eligibleContexts(state, t);
    if (!ctxs.length) continue;
    let w = t.baseProb;
    if (t.tone === 'negativo') w *= difficultyMult(state, 'negative');
    if (t.tone === 'positivo') w *= needPositive ? 4 : 1.7;
    weighted.push({ t, ctxs, w });
  }
  for (let i = 0; i < target && weighted.length; i++) {
    // cada evento é testado contra sua probabilidade (o "baralho" não força eventos improváveis)
    const pick = rng.weighted(weighted, (x) => x.w);
    if (!pick) break;
    weighted.splice(weighted.indexOf(pick), 1);
    if (!rng.chance(Math.min(0.95, 0.25 + pick.w * 6))) continue;
    if (pick.t.severity === 'grave' && state.flags.lastGraveMonth === graveKey) continue;
    const ctx = rng.pick(pick.ctxs);
    const ev = fireEvent(state, pick.t.id, ctx);
    if (ev) fired.push(ev);
  }
  return fired;
}

export function expireEvents(state: GameState): string[] {
  const notes: string[] = [];
  for (const ev of state.events) {
    if (ev.resolved) continue;
    if (state.meta.weekIndex > ev.deadlineWeek) {
      const r = resolveEvent(state, ev.id, ev.defaultOption, true);
      if (r) notes.push(`Sem resposta, "${ev.title}" foi resolvido por padrão: ${r.optionLabel}.`);
    }
  }
  // mantém só os eventos recentes no estado
  state.events = state.events.filter((e) => !e.resolved || state.meta.weekIndex - e.firedWeek < 12);
  return notes;
}

export interface ResolveResult {
  event: GameEvent;
  optionLabel: string;
  summary: string;
}

export function resolveEvent(state: GameState, eventId: string, optionId: string, auto = false): ResolveResult | null {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev || ev.resolved) return null;
  const opt = ev.options.find((o) => o.id === optionId) ?? ev.options.find((o) => o.id === ev.defaultOption);
  if (!opt) return null;
  const summary = applyEffects(state, opt.effects, ev.context, ev.templateId);
  ev.resolved = true;
  ev.chosen = opt.id;
  ev.outcome = `${auto ? 'Resolvido por omissão' : 'Decisão'}: ${opt.label}. ${summary}`;
  pushTimeline(state, `${ev.title} — ${opt.label}`, 'evento');
  return { event: ev, optionLabel: opt.label, summary };
}

function npcTarget(state: GameState, target: string, ctx: GameEvent['context']): Npc | undefined {
  if (target === 'context_talent') return ctx.npcId ? npcById(state, ctx.npcId) : undefined;
  if (ROLES.includes(target as NpcRole)) return npcByRole(state, target as NpcRole);
  return npcById(state, target);
}

export function applyEffects(state: GameState, eff: EffectSet, ctx: GameEvent['context'], source = ''): string {
  const ps = playerStation(state);
  const avg = avgWeeklyRevenue(state);
  const notes: string[] = [];
  const week = state.meta.weekIndex;
  const cash = (eff.cash ?? 0) + (eff.cashWeeks ?? 0) * avg;
  if (cash) {
    state.weekProgress.eventCash += cash;
    notes.push(cash > 0 ? `+${money(state.meta.era, cash)}` : `-${money(state.meta.era, -cash)}`);
  }
  if (eff.fine) {
    const f = eff.fine * avg;
    state.weekProgress.fines += f;
    notes.push(`multa de ${money(state.meta.era, f)}`);
  }
  if (eff.budget) {
    state.finance.annualBudget = Math.round(state.finance.annualBudget * (1 + eff.budget));
    notes.push(`verba anual ${eff.budget > 0 ? 'ampliada' : 'cortada'}`);
  }
  for (const n of eff.npc ?? []) {
    const npc = npcTarget(state, n.target, ctx);
    if (!npc) continue;
    if (n.mood) npc.mood = clamp(npc.mood + n.mood, -100, 100);
    if (n.trust) npc.trust = clamp(npc.trust + n.trust, 0, 100);
    if (n.loyalty) npc.loyalty = clamp(npc.loyalty + n.loyalty, 0, 100);
    if (n.patience) npc.patience = clamp(npc.patience + n.patience, 0, 100);
  }
  const prog = ctx.programId ? getProgram(state, ctx.programId) : undefined;
  if (eff.program && prog) {
    const pr = eff.program;
    if (pr.buzz) prog.buzz = clamp(prog.buzz + pr.buzz, 0, 100);
    if (pr.quality) prog.quality = clamp(prog.quality + pr.quality, 5, 99);
    if (pr.appeal) prog.appeal = clamp(prog.appeal + pr.appeal, 5, 99);
    if (pr.fatigue) prog.fatigue = clamp(prog.fatigue + pr.fatigue, 0, 100);
    if (pr.commercial) prog.commercial = clamp(prog.commercial + pr.commercial, 0, 100);
    if (pr.mult && pr.weeks) prog.tempMods.push({ mult: pr.mult, untilWeek: week + pr.weeks - 1 + (state.weekProgress.day > 0 ? 1 : 0), reason: source });
    if (pr.extendEps && prog.episodes.total) prog.episodes.total += pr.extendEps;
    if (pr.endNow) {
      prog.status = prog.status === 'development' ? 'ended' : 'ended';
      prog.dev = null;
      notes.push(`"${prog.title}" cancelado`);
    }
  }
  if (eff.reputation) {
    const r = eff.reputation;
    ps.reputation.critics = clamp(ps.reputation.critics + (r.critics ?? 0), 0, 100);
    ps.reputation.public = clamp(ps.reputation.public + (r.public ?? 0), 0, 100);
    ps.reputation.market = clamp(ps.reputation.market + (r.market ?? 0), 0, 100);
  }
  if (eff.salaryPct && ctx.npcId) {
    const npc = npcById(state, ctx.npcId);
    const c = npc ? state.contracts.find((x) => x.id === npc.contractId && x.status === 'active') : undefined;
    if (c) {
      c.salaryWeekly = Math.round(c.salaryWeekly * (1 + eff.salaryPct / 100));
      const extend = eff.flag?.renovou_longo ? 104 : 52;
      c.endWeek = Math.max(c.endWeek, week + extend);
      if (npc?.talent) npc.talent.askSalary = c.salaryWeekly;
    }
  }
  if (eff.talentLeaves && ctx.npcId) {
    const npc = npcById(state, ctx.npcId);
    if (npc) talentLeaves(state, npc, ctx.rivalId ?? null, notes);
  }
  if (eff.flag) {
    for (const [k, v] of Object.entries(eff.flag)) {
      if (k === 'dev_delay' && prog?.dev) {
        prog.dev.weeksLeft += Number(v);
        continue;
      }
      if (k === 'merch_up' && prog) {
        prog.merchLevel = Math.min(3, prog.merchLevel + 1);
        continue;
      }
      if (k === 'mbm') state.research.mbm = true;
      if (k === 'informante') state.flags.informante_until = week + 8;
      if (k === 'cancelou_recentemente') state.flags.cancelou_recentemente = week;
      state.flags[k] = v;
    }
  }
  if (eff.arcAdvance) {
    const a = state.arcs.find((x) => x.key === eff.arcAdvance && !x.done);
    if (a) {
      a.stage += 1;
      a.lastAdvanceWeek = week;
    }
  }
  if (eff.arcEnd) {
    const a = state.arcs.find((x) => x.key === eff.arcEnd);
    if (a) a.done = true;
  }
  if (eff.followup) state.delayed.push({ dueWeek: week + eff.followup.inWeeks, effects: { flag: { [`followup_${eff.followup.templateId}`]: true } }, note: 'followup', context: ctx });
  if (eff.delayed) state.delayed.push({ dueWeek: week + eff.delayed.inWeeks, effects: eff.delayed.effects, note: eff.delayed.note, context: ctx });
  if (eff.agenda) state.agenda.points = Math.max(0, state.agenda.points + eff.agenda);
  if (eff.priceMult) state.finance.priceMods.push({ mult: eff.priceMult, untilWeek: week + 26 });
  if (eff.occupancy) state.finance.occupancyMods.push({ delta: eff.occupancy.delta, untilWeek: week + eff.occupancy.weeks });
  if (eff.research) state.research.precision = clamp(state.research.precision + eff.research, 0, 100);
  if (eff.allBuzz) {
    for (const p of state.programs) if (p.stationId === ps.id && p.status === 'on_air') p.buzz = clamp(p.buzz + eff.allBuzz, 0, 100);
  }
  if (eff.tle) {
    state.flags.tle_mult = eff.tle.mult;
    state.flags.tle_until = week + eff.tle.weeks;
  }
  if (eff.rivalBoost) {
    state.flags[`stmod_${eff.rivalBoost.target}`] = eff.rivalBoost.mult;
    state.flags[`stmod_until_${eff.rivalBoost.target}`] = week + eff.rivalBoost.weeks;
  }
  if (eff.addOffer) {
    state.flags.pendingOffer = `${eff.addOffer}|${ctx.programId ?? ''}|${ctx.npcId ?? ''}`;
    const list = String(state.flags.pendingOffers ?? '');
    state.flags.pendingOffers = list ? `${list};${state.flags.pendingOffer}` : String(state.flags.pendingOffer);
    notes.push('nova oferta no Mercado');
  }
  return notes.join('; ');
}

export function talentLeaves(state: GameState, npc: Npc, rivalId: string | null, notes: string[] = []): void {
  const c = state.contracts.find((x) => x.id === npc.contractId);
  if (c) c.status = 'terminated';
  const rs = rivals(state);
  const dest = (rivalId && rs.find((s) => s.id === rivalId)) || rs.sort((a, b) => b.power - a.power)[1] || rs[0];
  npc.stationId = dest ? dest.id : null;
  npc.contractId = null;
  for (const p of state.programs) {
    if (p.talentIds.includes(npc.id) && p.stationId === playerStation(state).id) p.talentIds = p.talentIds.filter((x) => x !== npc.id);
  }
  if (dest) {
    // o talento reforça a concorrência
    const weekPlan = state.schedules[dest.id];
    if (weekPlan) {
      const ids = programsInWeek(weekPlan);
      const target = state.programs.find((p) => ids.has(p.id) && npc.talent?.specialty.includes(p.genre));
      if (target) {
        target.flags.rivalTalent = Math.min(0.95, Number(target.flags.rivalTalent ?? 0.3) + 0.15);
        target.buzz = Math.min(100, target.buzz + 10);
      }
    }
    notes.push(`${npc.name} foi para a ${dest.name}`);
    pushTimeline(state, `${npc.name} deixou a emissora e foi para a ${dest.name}.`, 'pessoas');
  } else {
    notes.push(`${npc.name} deixou a emissora`);
  }
}

// efeitos tardios vencidos
export function applyDelayed(state: GameState): string[] {
  const due = state.delayed.filter((d) => d.dueWeek <= state.meta.weekIndex);
  state.delayed = state.delayed.filter((d) => d.dueWeek > state.meta.weekIndex);
  const out: string[] = [];
  for (const d of due) {
    applyEffects(state, d.effects, d.context, 'delayed');
    if (d.note !== 'followup') out.push(d.note);
  }
  return out;
}

// ===== Arcos =====
export function progressArcs(state: GameState): void {
  const rng = rngFor(state.meta.seed, 'arcs', state.meta.weekIndex);
  for (const def of ARCS) {
    const a = state.arcs.find((x) => x.key === def.key);
    if (!a) {
      if (state.meta.weekIndex < 6) continue;
      if (state.arcs.filter((x) => !x.done).length >= 1) continue;
      if (!def.start.every((c) => evalCond(state, c, {}))) continue;
      if (rng.chance(def.startProb * (state.meta.difficulty === 'lenda' ? 1.4 : 1))) {
        state.arcs.push({ key: def.key, stage: 0, startedWeek: state.meta.weekIndex, lastAdvanceWeek: state.meta.weekIndex - def.weeksPerStage, done: false, data: {} });
      }
      continue;
    }
    if (a.done) continue;
    const pending = state.events.some((e) => !e.resolved && e.templateId.startsWith(`arc_`) && EVENT_BY_ID[e.templateId]?.arc?.key === def.key);
    if (pending) continue;
    if (a.stage >= def.stages.length) {
      a.done = true;
      continue;
    }
    if (state.meta.weekIndex - a.lastAdvanceWeek >= def.weeksPerStage) {
      const tid = def.stageEvents[a.stage];
      if (state.flags[`arcfired_${tid}`]) continue;
      state.flags[`arcfired_${tid}`] = state.meta.weekIndex;
      fireEvent(state, tid, {});
    }
  }
}

export function blockingEvents(state: GameState): GameEvent[] {
  return state.events.filter((e) => !e.resolved && e.blocking);
}

export function openEvents(state: GameState): GameEvent[] {
  return state.events.filter((e) => !e.resolved);
}
