// Criação do mundo de uma nova partida (seção 4): emissoras, acervo, grades, NPCs e contratos.

import { ARCHETYPES, GRID_TEMPLATES, resolveGenre, templateDay } from './catalog/archetypes.ts';
import type { TemplateBlock } from './catalog/archetypes.ts';
import { ERAS, REAL_STATIONS } from './catalog/eras.ts';
import { GENRES, genreAvailable, isFinite } from './catalog/genres.ts';
import { MARKETS, SEGMENTS } from './catalog/markets.ts';
import { FICTIONAL_STATIONS, personName, PLAYER_DEFAULT_STATION, programTitle, stageName } from './catalog/names.ts';
import { FIXED_NPCS, talentArchetypeForGenre } from './catalog/npcs.ts';
import { leaseRate } from './commercial.ts';
import { clamp, Rng, rngFor } from './rng.ts';
import { emptyWeek, ensureSystemPrograms, habitKeyFor, placeBlock, programAirings } from './schedule.ts';
import { nextId } from './state.ts';
import { availableAt, catalogGenre, exclusiveRight, parseDays, pickGrid, titleById } from './catalogWorld.ts';
import type {
  ArchetypeId, Background, Block, CatalogSnapshot, CatalogTitleSnap, Contract, DayType, Difficulty, EraId, GameState, GenreId, Npc, Program,
  RatingAge, ScenarioId, Station, Universe,
} from './types.ts';
import { bandOfSlot, clockToSlot, COPAS, firstMondayOfYear, slotClockMinutes } from './time.ts';

export interface NewGameInput {
  universe: Universe;
  era: EraId;
  startYear: number;
  scenario: ScenarioId;
  difficulty: Difficulty;
  seed: number;
  player: { name: string; background: Background; pronoun: 'o' | 'a' | 'e' };
  station: { mode: 'fictional' | 'real'; realKey?: string; name?: string; short?: string; color?: string };
  carry?: { reputation: number; careerStations: string[] };
  catalog?: CatalogSnapshot | null; // v2: catálogo real aprovado (só no modo real; sem ele, o mundo é gerado como antes)
}

export const SCENARIOS: Record<ScenarioId, { name: string; situation: string; difficulty: string; template: string; archetype: ArchetypeId; power: number; rep: [number, number, number]; cashWeeks: number }> = {
  lider_ameacada: { name: 'Líder ameaçada', situation: '1ª colocada, mas perdendo pontos ano a ano', difficulty: 'Média', template: 'hegemonica', archetype: 'hegemonica', power: 0.8, rep: [70, 72, 75], cashWeeks: 40 },
  vice_ambiciosa: { name: 'Vice ambiciosa', situation: '2ª colocada, dinheiro razoável, quer a liderança no domingo', difficulty: 'Média', template: 'popular_auditorio', archetype: 'popular_auditorio', power: 0.38, rep: [52, 66, 60], cashWeeks: 16 },
  emissora_crise: { name: 'Emissora em crise', situation: '4ª ou 5ª colocada, dívidas, grade cheia de arrendamento', difficulty: 'Difícil', template: 'em_crise', archetype: 'em_crise', power: -0.32, rep: [35, 40, 34], cashWeeks: -8 },
  rede_nova: { name: 'Rede recém-nascida', situation: 'Concessão nova, sem acervo, investidor exigente', difficulty: 'Muito difícil', template: 'rede_nova', archetype: 'desafiante', power: -0.55, rep: [45, 42, 40], cashWeeks: 45 },
  canal_pago: { name: 'Canal pago temático', situation: 'Nicho, receita mista (assinatura + publicidade)', difficulty: 'Média', template: 'canal_pago', archetype: 'canal_pago', power: 0.2, rep: [62, 50, 58], cashWeeks: 12 },
};

const ARCH_REP: Record<ArchetypeId, [number, number, number]> = {
  hegemonica: [75, 75, 80],
  popular_auditorio: [45, 70, 60],
  desafiante: [55, 60, 60],
  jornalistica_esportiva: [65, 50, 55],
  em_crise: [35, 40, 35],
  publica_educativa: [80, 50, 45],
  canal_pago: [60, 50, 55],
};

const RATING_ORDER: RatingAge[] = ['L', '10', '12', '14', '16', '18'];

// ajuste global de custos de produção (calibrado pelo scripts/calibrate.ts)
export const GLOBAL_COST_SCALE = 0.68;

export function maxRatingAt(slot: number): RatingAge {
  const m = slotClockMinutes(slot);
  if (m >= 23 * 60 || m < 6 * 60) return '18';
  if (m >= 22 * 60) return '16';
  if (m >= 21 * 60) return '14';
  if (m >= 20 * 60) return '12';
  return '10';
}

export function ratingAllowed(r: RatingAge, slot: number): boolean {
  return RATING_ORDER.indexOf(r) <= RATING_ORDER.indexOf(maxRatingAt(slot));
}

export interface Ctx {
  state: GameState;
  rng: Rng;
  usedTitles: Set<string>;
  era: EraId;
  year: number;
  universe: Universe;
}

export function makeCtx(state: GameState, rng: Rng): Ctx {
  return {
    state,
    rng,
    usedTitles: new Set(state.programs.map((p) => p.title)),
    era: state.meta.era,
    year: parseInt(state.meta.date.slice(0, 4), 10),
    universe: state.meta.universe,
  };
}

export function genreOkFor(state: GameState, st: Station, g: GenreId): boolean {
  return genreOk(makeCtx(state, new Rng(1)), st, g);
}

function blankState(input: NewGameInput): GameState {
  const date = firstMondayOfYear(input.startYear);
  return {
    meta: {
      universe: input.universe,
      era: input.era,
      startYear: input.startYear,
      scenario: input.scenario,
      difficulty: input.difficulty,
      seed: input.seed,
      weekIndex: 0,
      date,
      playerStationId: '',
      status: 'active',
      version: 1,
    },
    player: {
      name: input.player.name || 'Diretor',
      background: input.player.background,
      pronoun: input.player.pronoun,
      reputation: input.carry?.reputation ?? 50,
      careerStations: input.carry?.careerStations ?? [],
    },
    stations: [],
    programs: [],
    schedules: {},
    rivalSnapshot: {},
    npcs: [],
    contracts: [],
    deals: [],
    events: [],
    delayed: [],
    arcs: [],
    offers: [],
    finance: {
      annualBudget: 0,
      annualRevenueTarget: 0,
      annualMarginTarget: 0,
      ytdRevenue: 0,
      ytdCost: 0,
      ytdStructure: 0,
      qtdSpent: 0,
      quarterBudget: 0,
      tableMult: 1,
      maxDiscount: 0.35,
      adMinutes: 12,
      lastWeek: null,
      weeksOverBudget: 0,
      extraBudgetNextYear: 0,
      occupancyMods: [],
      priceMods: [],
    },
    agenda: { points: 20, meetings: 0, weekIndex: 0 },
    research: { precision: 40, analyst: false, mbm: false },
    flags: {},
    kpis: null,
    targets: { aud24: 0, prime: 0, rankTarget: 0, revenue: 0, margin: 0, description: '' },
    evaluations: [],
    records: [],
    achievements: [],
    timeline: [],
    weekProgress: freshWeekProgress(),
    liveMoments: [],
    lastReportWeek: null,
    weeksBelowTarget: 0,
    llm: { weekCalls: 0, weekIndex: 0 },
    tutorial: { step: 0, done: false },
    idCounter: 0,
    pendingInbox: [],
    alertsAck: [],
    lastBandRanks: {},
    monthScores: [],
    ytd: { weeks: 0, pts24: 0, prime: 0 },
  };
}

export function freshWeekProgress(): GameState['weekProgress'] {
  return {
    day: 0,
    carry: null,
    stationOrder: [],
    progAcc: {},
    bandAcc: {},
    dayAcc: {},
    primeAcc: {},
    shareAcc: {},
    marketAcc: {},
    marketPrimeAcc: {},
    econ: {},
    progEcon: {},
    occ: {},
    factors: {},
    liveDecisions: [],
    eventCash: 0,
    fines: 0,
    notes: [],
    ratingViolations: [],
  };
}

function makeStation(ctx: Ctx, opts: {
  name: string; short: string; color: string; isPlayer: boolean; archetype: ArchetypeId; isReal: boolean; power: number;
  regional: Partial<Record<string, number>> | null; kind?: 'open' | 'pay'; realKey?: string | null;
}): Station {
  const regional = MARKETS.map((m) => {
    if (opts.regional && opts.regional[m.code] !== undefined) return opts.regional[m.code] as number;
    return clamp(ctx.rng.normal(1, 0.1), 0.75, 1.25);
  });
  const rep = ARCH_REP[opts.archetype];
  const kind = opts.kind ?? 'open';
  const P = ERAS[ctx.era].params;
  return {
    id: nextId(ctx.state, 'st'),
    name: opts.name,
    short: opts.short,
    color: opts.color,
    isPlayer: opts.isPlayer,
    archetype: opts.archetype,
    isReal: opts.isReal,
    kind,
    reach: kind === 'pay' ? Math.max(0.04, P.payTvReach) : 1,
    regional,
    power: opts.power,
    brand: clamp(1 + opts.power * 0.12, 0.85, 1.15),
    reputation: { critics: rep[0], public: rep[1], market: rep[2] },
    cash: 0,
    weeklyStructure: 0,
    ai: { pending: [], lastMoveWeek: -99, bandHistory: {}, reserve: [] },
    hasNetwork: kind === 'open' && opts.archetype !== 'publica_educativa' && opts.archetype !== 'em_crise' && opts.archetype !== 'canal_pago',
    subscriptionWeekly: 0,
    footballUntilYear: null,
    realKey: opts.realKey ?? null,
    closedWeek: null,
    history: [],
  };
}

function genreOk(ctx: Ctx, st: Station, g: GenreId): boolean {
  if (!GENRES[g]) return false;
  if (!genreAvailable(g, ctx.era)) return false;
  const P = ERAS[ctx.era].params;
  if (g === 'infantil' && P.kidsTV < 0.6 && st.archetype !== 'publica_educativa') return false;
  if (g === 'futebol' && !st.footballUntilYear) return false;
  return true;
}

function pickRating(ctx: Ctx, g: GenreId, slot: number): RatingAge {
  const def = GENRES[g].rating;
  const max = maxRatingAt(slot);
  if (g === 'filme' || g === 'serie_estrangeira') {
    const allowed = RATING_ORDER.slice(0, RATING_ORDER.indexOf(max) + 1).filter((r) => r !== '18');
    return ctx.rng.pick(allowed.length ? allowed : ['L']);
  }
  return RATING_ORDER.indexOf(def) <= RATING_ORDER.indexOf(max) ? def : max;
}

export function genreCost(era: EraId, g: GenreId, quality: number, minutes: number, budgetLevel: number): number {
  const def = GENRES[g];
  const [lo, hi] = def.cost;
  if (hi <= 0) return 0;
  const qf = Math.pow(clamp((quality - 25) / 70, 0, 1), 1.2);
  const durF = clamp(minutes / def.dur[0], 0.4, 3);
  return Math.round((lo + (hi - lo) * qf) * durF * ERAS[era].params.costScale * (0.6 + 0.4 * budgetLevel) * GLOBAL_COST_SCALE);
}

export function makeProgram(ctx: Ctx, st: Station, g: GenreId, opts: {
  title?: string; label?: string; minutes: number; slot?: number; rerun?: boolean; status?: Program['status'];
  qualityShift?: number; appealShift?: number; origin?: Program['origin'];
}): Program {
  const rng = ctx.rng;
  const def = GENRES[g];
  const arch = ARCHETYPES[st.archetype].ai;
  let q = rng.normal(arch.qualityMean + st.power * 12 + (opts.qualityShift ?? 0), 7);
  let a = rng.normal(arch.appealMean + st.power * 16 + (opts.appealShift ?? 0), 7);
  switch (g) {
    case 'telejornal': q += 6; a -= 2; break;
    case 'policial': q -= 14; a += 4; break;
    case 'religioso': q = rng.range(20, 32); a = rng.range(14, 24); break;
    case 'televendas': q = rng.range(12, 22); a = rng.range(8, 16); break;
    case 'janela_local': q = 56; a = 50; break;
    case 'tapa_buraco': q = 15; a = 12; break;
    case 'documentario': q += 6; a -= 8; break;
    case 'infantil': if (st.archetype === 'publica_educativa') { q += 8; a += 14; } break;
    case 'novela_21h': q += 3; a += 3; break;
    default: break;
  }
  if (opts.rerun) { q -= 4; a -= 6; }
  q = clamp(Math.round(q), 8, 97);
  a = clamp(Math.round(a), 5, 97);
  const profile = { ...def.profile };
  for (const s of SEGMENTS) profile[s] = clamp(Math.round((profile[s] + rng.normal(0, 0.06)) * 100) / 100, 0.02, 1);
  const slot = opts.slot ?? 56;
  const origin: Program['origin'] = opts.origin ?? (def.leased ? 'leased'
    : opts.rerun ? 'archive'
    : g === 'filme' || g === 'serie_estrangeira' ? 'acquired'
    : g === 'futebol' ? 'sports'
    : def.group === 'sistema' ? 'system'
    : 'own');
  const minutes = Math.max(15, Math.round(opts.minutes / 15) * 15);
  const payDiscount = st.kind === 'pay' ? 0.22 : 1; // licenciamento de catálogo para TV paga é bem mais barato
  const cost = origin === 'leased' || def.group === 'sistema' ? (g === 'tapa_buraco' ? 8000 : 0) : Math.round(genreCost(ctx.era, g, q, minutes, arch.budget) * payDiscount);
  let episodes: Program['episodes'] = { total: null, aired: 0, planned: null };
  if (def.episodes) {
    const total = rng.int(def.episodes[0], def.episodes[1]);
    let aired = Math.floor(total * rng.range(0.05, 0.8));
    if (st.isPlayer && (opts.status ?? 'on_air') === 'on_air') aired = Math.min(aired, total - 40);
    if ((opts.status ?? 'on_air') !== 'on_air') aired = opts.rerun ? 0 : 0;
    episodes = { total, aired: Math.max(0, aired), planned: total };
  }
  const title = opts.title ?? (ctx.universe === 'real' && !st.isPlayer && opts.label ? opts.label.replace('*', '') : programTitle(rng, g, st.short, st.name, ctx.year, ctx.usedTitles));
  const p: Program = {
    id: nextId(ctx.state, 'p'),
    stationId: st.id,
    title,
    genre: g,
    origin,
    quality: q,
    appeal: a,
    profile,
    rating: pickRating(ctx, g, slot),
    costPerEp: cost,
    durStd: minutes,
    durMin: Math.max(15, minutes - 30),
    durMax: minutes + 30,
    fatigue: opts.rerun ? rng.range(30, 50) : def.episodes ? (episodes.aired / Math.max(1, episodes.total ?? 1)) * 12 : clamp(rng.normal(16, 7), 0, 40),
    buzz: clamp(rng.normal(25, 8), 5, 50),
    habitWeeks: 8,
    habitKey: '',
    movesRecent: [],
    status: opts.status ?? 'on_air',
    talentIds: [],
    commercial: clamp(Math.round(rng.normal(def.commercial, 8)), 0, 100),
    episodes,
    isRerun: !!opts.rerun,
    merchLevel: 0,
    promo: 0,
    locked: g === 'janela_local',
    leaseWeeklyPerHour: def.leased ? Math.round(leaseRate(ctx.state, bandOfSlot(slot)) * rng.range(0.8, 1.2)) : 0,
    rights: origin === 'acquired' ? { exhibitionsLeft: g === 'filme' ? rng.int(150, 260) : (episodes.total ?? 80) * 2, untilWeek: null } : null,
    dev: null,
    tableMult: 1,
    price30s: 0,
    label: opts.label?.replace('*', ''),
    premiereWeek: null,
    createdWeek: -20,
    stats: [],
    totals: { revenue: 0, cost: 0, airings: 0, peakPts: 0 },
    tempMods: [],
    flags: {},
  };
  if (!st.isPlayer && !def.leased && def.group !== 'sistema') {
    // talento abstrato dos concorrentes
    p.flags.rivalTalent = Math.round(clamp(0.3 + st.power * 0.3 + rng.normal(0, 0.08), 0, 0.9) * 100) / 100;
  }
  ctx.state.programs.push(p);
  return p;
}

function buildGrid(ctx: Ctx, st: Station, templateKey: string): Block[][] {
  const tpl = GRID_TEMPLATES[templateKey];
  const week = emptyWeek();
  const byLabel = new Map<string, Program>();
  const groups: { dt: DayType; days: number[] }[] = [
    { dt: 'weekday', days: [0, 1, 2, 3, 4] },
    { dt: 'saturday', days: [5] },
    { dt: 'sunday', days: [6] },
  ];
  const place = (blk: TemplateBlock, days: number[]) => {
    const [start, minutes, spec, label] = blk;
    let g = resolveGenre(spec, (x) => genreOk(ctx, st, x));
    if (g === 'janela_local' && !st.hasNetwork) g = 'telejornal';
    if (g === 'futebol' && !st.footballUntilYear) {
      if (blk[4]) return; // jogo de quarta: sem direitos, não sobrepõe
      g = genreOk(ctx, st, 'auditorio') ? 'auditorio' : 'filme';
    }
    if (!genreOk(ctx, st, g) && g !== 'janela_local' && g !== 'telejornal' && g !== 'tapa_buraco') {
      g = genreOk(ctx, st, 'filme') ? 'filme' : 'tapa_buraco';
    }
    const slot = clockToSlot(start);
    const len = Math.round(minutes / 15);
    const rerun = label.startsWith('*');
    const key = `${label.replace('*', '')}|${g}`;
    let p = byLabel.get(key);
    if (!p) {
      p = makeProgram(ctx, st, g, { label, minutes, slot, rerun });
      if (g === 'telejornal' && /noite/i.test(label) && slot >= 48 && slot < 66) p.locked = true;
      byLabel.set(key, p);
    }
    for (const d of days) week[d] = placeBlock(week[d], p.id, slot, len);
  };
  for (const grp of groups) {
    for (const blk of templateDay(tpl, grp.dt)) place(blk, grp.days);
  }
  for (const blk of tpl.overrides ?? []) place(blk, blk[4] ?? []);
  return week;
}

// ===== catálogo real (v2, seção 8A) =====

// Programa da partida a partir de um título real: atributos do catálogo (estimativas de jogo) sobre o sorteio padrão.
export function programFromCatalog(ctx: Ctx, st: Station, t: CatalogTitleSnap, opts: { minutes: number; slot?: number; status?: Program['status']; rerun?: boolean }): Program {
  const g = catalogGenre(t);
  const origin: Program['origin'] = t.kind === 'formato' || t.kind === 'reality' ? 'format' : t.country && /brasil/i.test(t.country) ? 'own' : 'acquired';
  const p = makeProgram(ctx, st, g, { title: t.titleBr, minutes: opts.minutes, slot: opts.slot, status: opts.status, rerun: opts.rerun, origin });
  p.catalogTitleId = t.id;
  if (typeof t.attrs.quality === 'number') p.quality = clamp(Math.round(t.attrs.quality), 8, 97);
  if (typeof t.attrs.appeal === 'number') p.appeal = clamp(Math.round(t.attrs.appeal), 5, 97);
  if (typeof t.attrs.fatigue === 'number') p.fatigue = clamp(t.attrs.fatigue, 0, 100);
  if (t.attrs.rating && RATING_ORDER.includes(t.attrs.rating as RatingAge)) p.rating = t.attrs.rating as RatingAge;
  if (GENRES[g].episodes && t.episodes) {
    const onAir = (opts.status ?? 'on_air') === 'on_air';
    const aired = onAir ? Math.floor(t.episodes * ctx.rng.range(0.1, 0.6)) : 0;
    p.episodes = { total: t.episodes, aired, planned: t.episodes };
  }
  if (origin === 'acquired') {
    p.rights = { exhibitionsLeft: g === 'filme' ? (t.episodes ?? 10) * (t.attrs.exibicoes_por_titulo ?? 3) : (t.episodes ?? 80) * 2, untilWeek: null };
  }
  return p;
}

// Grade real de uma emissora sobre a grade do modelo genérico: o modelo só preenche o que a grade real não cobre.
function overlayRealGrid(ctx: Ctx, st: Station, week: Block[][], grid: NonNullable<ReturnType<typeof pickGrid>>): Block[][] {
  const out = week.map((d) => d.map((b) => ({ ...b })));
  const byKey = new Map<string, Program>();
  for (const sl of grid.slots) {
    let g = sl.genero as GenreId;
    if (!(g in GENRES) || g === 'futebol') continue; // jogos entram com a Fase 6.4 (esporte)
    if (g === 'janela_local' && !st.hasNetwork) g = 'telejornal';
    const days = parseDays(sl.dias);
    const start = clockToSlot(sl.inicio);
    const len = Math.min((clockToSlot(sl.fim) - start + 96) % 96, 96 - start); // não atravessa as 6h
    if (!days.length || len <= 0) continue;
    const t = titleById(ctx.state, sl.catalog_title_id);
    const key = t ? `cat:${t.id}` : `${sl.titulo}|${g}`;
    let p = byKey.get(key);
    if (!p) {
      p = t ? programFromCatalog(ctx, st, t, { minutes: len * 15, slot: start }) : makeProgram(ctx, st, g, { title: sl.titulo, label: sl.titulo, minutes: len * 15, slot: start });
      if (t && sl.titulo) p.title = sl.titulo; // nome no ar (ex.: "BBB 26"); o vínculo com o catálogo fica em catalogTitleId
      if (g === 'telejornal' && start >= 48 && start < 66) p.locked = true; // telejornal principal protegido
      byKey.set(key, p);
    }
    for (const d of days) out[d] = placeBlock(out[d], p.id, start, len);
  }
  // sobras do modelo genérico com até 30 min entre dois programas reais viram parte do programa real vizinho
  const realIds = new Set([...byKey.values()].map((p) => p.id));
  for (let d = 0; d < out.length; d++) {
    for (const b of [...out[d]]) {
      if (realIds.has(b.programId) || b.len > 2) continue;
      const prev = out[d].find((x) => x.start + x.len === b.start && realIds.has(x.programId));
      const next = out[d].find((x) => x.start === b.start + b.len && realIds.has(x.programId));
      const host = prev ?? next;
      if (host) out[d] = placeBlock(out[d], host.programId, b.start, b.len);
    }
  }
  // programas do modelo genérico que ficaram sem horário saem da partida
  const used = new Set(out.flat().map((b) => b.programId));
  ctx.state.programs = ctx.state.programs.filter((p) => p.stationId !== st.id || p.status !== 'on_air' || used.has(p.id));
  return out;
}

// Acervo do jogador no Brasil real: o acervo real da emissora assumida, ou alguns enlatados reais baratos (seção 8A.2)
function playerCatalogAcervo(ctx: Ctx, ps: Station): void {
  const cat = ctx.state.catalog;
  if (!cat) return;
  const date = ctx.state.meta.date;
  const used = new Set(ctx.state.programs.map((p) => p.catalogTitleId).filter((x): x is string => !!x));
  const free = cat.titles.filter((t) => !used.has(t.id) && availableAt(t, date));
  const minutesOf = (t: CatalogTitleSnap) => t.durationMin ?? GENRES[catalogGenre(t)].dur[0];
  if (ps.realKey) {
    const own = free.filter((t) => exclusiveRight(ctx.state, t, date)?.stationKey === ps.realKey).slice(0, 4);
    for (const t of own) programFromCatalog(ctx, ps, t, { minutes: minutesOf(t), slot: 40, status: 'ready', rerun: true });
    return;
  }
  const score = (t: CatalogTitleSnap) => (t.attrs.quality ?? 60) + (t.attrs.appeal ?? 60) - (t.attrs.fatigue ?? 0);
  const cheap = free
    .filter((t) => ['serie', 'filme', 'pacote_filmes', 'desenho'].includes(t.kind) && !exclusiveRight(ctx.state, t, date))
    .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
    .slice(0, 3);
  for (const t of cheap) {
    const p = programFromCatalog(ctx, ps, t, { minutes: minutesOf(t), slot: 40, status: 'ready' });
    p.costPerEp = Math.round(p.costPerEp * 0.6);
  }
}

// A grade do jogador nunca começa com programa esgotado. O aquecimento (3 semanas simuladas antes da largada) mais as
// 2 primeiras semanas de jogo precisam caber nos episódios que restam: séries curtas exibidas várias vezes por semana
// (ex.: série nacional de 10 a 12 episódios na grade da líder) acabavam antes da largada e travavam o "Colocar no ar".
const RUNWAY_WEEKS = 5;
function ensurePlayerRunway(state: GameState, ps: Station): void {
  const week = state.schedules[ps.id];
  if (!week) return;
  for (const p of state.programs) {
    if (p.stationId !== ps.id || p.status !== 'on_air' || p.episodes.total === null) continue;
    const weekly = programAirings(week, p.id).length;
    if (!weekly) continue;
    const need = p.episodes.aired + weekly * RUNWAY_WEEKS;
    if (p.episodes.total < need) {
      p.episodes.total = need;
      p.episodes.planned = need;
    }
  }
}

const RESERVE_GENRES: Record<ArchetypeId, string[]> = {
  hegemonica: ['novela_21h', 'serie_nacional', 'humoristico', 'reality|game_show', 'novela_19h'],
  popular_auditorio: ['auditorio', 'game_show', 'novela_18h', 'talent_show|game_show'],
  desafiante: ['novela_biblica|novela_21h', 'reality|game_show', 'policial', 'novela_18h'],
  jornalistica_esportiva: ['talk_show', 'policial', 'mesa_redonda'],
  em_crise: ['filme', 'talk_show', 'game_show'],
  publica_educativa: [],
  canal_pago: ['serie_estrangeira', 'filme', 'serie_nacional'],
};

function addReserves(ctx: Ctx, st: Station): void {
  for (const spec of RESERVE_GENRES[st.archetype]) {
    const g = resolveGenre(spec, (x) => genreOk(ctx, st, x));
    if (!genreOk(ctx, st, g)) continue;
    const def = GENRES[g];
    const p = makeProgram(ctx, st, g, { minutes: def.dur[0], status: 'ready', qualityShift: 3, appealShift: 4 });
    if (p.episodes.total) p.episodes.aired = 0;
    st.ai.reserve.push(p.id);
  }
}

function playerExtras(ctx: Ctx, st: Station, scenario: ScenarioId): void {
  const rng = ctx.rng;
  const add = (g: GenreId, opts: Parameters<typeof makeProgram>[3]) => {
    if (!genreOk(ctx, st, g)) return null;
    return makeProgram(ctx, st, g, opts);
  };
  // acervo de reprises
  const novelaGenres: GenreId[] = ['novela_18h', 'novela_19h', 'novela_21h'];
  const archiveCount = scenario === 'rede_nova' ? 0 : scenario === 'emissora_crise' ? 2 : 3;
  for (let i = 0; i < archiveCount; i++) {
    const p = add(novelaGenres[i % 3], { minutes: 60, rerun: true, status: 'archive', qualityShift: 6, appealShift: 4 });
    if (p) p.title = `${p.title} (reprise)`;
  }
  if (scenario !== 'rede_nova') {
    const h = add('humoristico', { minutes: 45, rerun: true, status: 'archive' });
    if (h) h.title = `${h.title} (melhores momentos)`;
    add('serie_nacional', { minutes: 45, rerun: true, status: 'archive', qualityShift: 5 });
  }
  // conteúdo comprado pronto
  const films = add('filme', { minutes: 120, status: 'ready', qualityShift: 2, appealShift: 6 });
  if (films) films.title = rng.pick(['Pacote Ação Total', 'Clássicos de Hollywood', 'Sucessos de Bilheteria', 'Cinema Nacional']);
  add('filme', { minutes: 120, status: 'ready' });
  add('serie_estrangeira', { minutes: 45, status: 'ready', appealShift: 4 });
  add('serie_estrangeira', { minutes: 45, status: 'ready' });
  add('documentario', { minutes: 60, status: 'ready' });
  if (genreOk(ctx, st, 'infantil')) add('infantil', { minutes: 120, status: 'ready' });
  // produção própria pronta e em desenvolvimento
  const ready: Record<ScenarioId, GenreId[]> = {
    lider_ameacada: ['humoristico', 'game_show'],
    vice_ambiciosa: ['game_show', 'humoristico'],
    emissora_crise: ['talk_show'],
    rede_nova: ['game_show'],
    canal_pago: ['documentario'],
  };
  for (const g of ready[scenario]) add(g, { minutes: GENRES[g].dur[0], status: 'ready', appealShift: 3 });
  const dev: Record<ScenarioId, [GenreId, number][]> = {
    lider_ameacada: [['novela_21h', 10], ['serie_nacional', 6]],
    vice_ambiciosa: [['reality', 8], ['novela_19h', 14]],
    emissora_crise: [['talk_show', 4], ['policial', 3]],
    rede_nova: [['novela_19h', 16], ['auditorio', 6]],
    canal_pago: [['serie_nacional', 8]],
  };
  for (const [g0, weeks] of dev[scenario]) {
    let g = g0;
    if (!genreOk(ctx, st, g)) g = g === 'reality' ? 'talent_show' : 'humoristico';
    if (!genreOk(ctx, st, g)) g = 'game_show';
    const p = add(g, { minutes: GENRES[g].dur[0], status: 'development', qualityShift: 2, appealShift: 3 });
    if (p) {
      p.dev = { stage: 2, weeksLeft: weeks, totalWeeks: weeks + 6, spent: p.costPerEp * 2 };
      p.createdWeek = 0;
      if (p.episodes.total) p.episodes.aired = 0;
      p.fatigue = 0;
      p.buzz = 12;
    }
  }
}

const TALENT_GENRES: GenreId[] = ['novela_21h', 'novela_19h', 'novela_18h', 'novela_biblica', 'auditorio', 'reality', 'talent_show', 'talk_show', 'telejornal', 'revista_eletronica', 'policial', 'humoristico', 'futebol', 'game_show', 'feminino', 'mesa_redonda', 'novela_juvenil', 'serie_nacional'];

export function makeTalent(ctx: Ctx, archetypeId: string | null, genre: GenreId, stationId: string | null, quality: number): Npc {
  const rng = ctx.rng;
  const options = archetypeId ? talentArchetypeForGenre(genre).filter((t) => t.id === archetypeId) : talentArchetypeForGenre(genre);
  const arch = options.length ? rng.pick(options) : talentArchetypeForGenre('talk_show')[0];
  const r = (x: [number, number]) => Math.round(rng.range(x[0], x[1]));
  const qf = clamp((quality - 40) / 50, 0, 1);
  const { name } = arch.stageName && rng.chance(0.7) ? { name: stageName(rng) } : personName(rng, arch.gender);
  const salary = Math.round((arch.salary[0] + (arch.salary[1] - arch.salary[0]) * (0.3 + 0.7 * qf * rng.range(0.6, 1.1))) * ERAS[ctx.era].params.costScale);
  const npc: Npc = {
    id: nextId(ctx.state, 'npc'),
    name,
    role: 'talento',
    title: arch.label,
    stationId,
    age: rng.int(24, 66),
    sheet: {
      speech_style: rng.pick([['vaidoso', 'carismático', 'exigente'], ['simpático', 'ansioso', 'leal'], ['irônico', 'profissional', 'ambicioso'], ['dramático', 'sensível', 'teimoso'], ['espontâneo', 'popular', 'impulsivo']]),
      catchphrases: [],
      main_goal: 'mais espaço e reconhecimento',
      secret_goal: rng.pick(['ganhar o próprio programa no nobre', 'ir para a concorrência pelo dobro', 'virar diretor(a) de núcleo', 'aposentar no topo']),
      red_line: rng.pick(['perder o horário garantido em contrato', 'ser substituído(a) sem aviso', 'ter o salário congelado depois de um sucesso']),
      bio: `${arch.label}. ${rng.pick(['Querido(a) do público popular.', 'Respeitado(a) pela crítica.', 'Fama de temperamental nos bastidores.', 'Cria da casa, começou como figurante.', 'Veio da concorrência com contrato milionário.'])}`,
    },
    mood: Math.round(rng.normal(10, 15)),
    trust: Math.round(rng.normal(50, 10)),
    loyalty: Math.round(rng.normal(55, 15)),
    patience: Math.round(rng.normal(50, 10)),
    talent: {
      archetype: arch.id,
      carisma: Math.round(r(arch.carisma) * (0.85 + 0.15 * qf)),
      popularity: Math.round(r(arch.popularity) * (0.8 + 0.2 * qf)),
      prestige: r(arch.prestige),
      ego: r(arch.ego),
      risk: r(arch.risk),
      specialty: arch.genres,
      segmentBias: arch.segmentBias,
      askSalary: salary,
    },
    contractId: null,
    requests: [],
    lastMetWeek: null,
    avatar: arch.role === 'jornalista' ? '🎙️' : arch.role === 'autor' ? '✍️' : arch.role.startsWith('at') ? '⭐' : arch.role === 'humorista' ? '🤡' : arch.role === 'narrador' || arch.role === 'comentarista' ? '⚽' : '🎤',
  };
  ctx.state.npcs.push(npc);
  return npc;
}

export function makeContract(state: GameState, npc: Npc, stationId: string, weeks: number, programId: string | null, startWeek: number): Contract {
  const c: Contract = {
    id: nextId(state, 'ct'),
    npcId: npc.id,
    stationId,
    salaryWeekly: npc.talent?.askSalary ?? 30000,
    startWeek,
    endWeek: startWeek + weeks,
    exclusive: true,
    guaranteed: programId ? { programId } : null,
    terminationFee: (npc.talent?.askSalary ?? 30000) * 12,
    status: 'active',
  };
  npc.contractId = c.id;
  npc.stationId = stationId;
  state.contracts.push(c);
  return c;
}

function playerTalents(ctx: Ctx, st: Station): void {
  const progs = ctx.state.programs
    .filter((p) => p.stationId === st.id && p.status === 'on_air' && !p.isRerun && TALENT_GENRES.includes(p.genre) && p.origin !== 'leased')
    .sort((a, b) => b.costPerEp - a.costPerEp);
  let count = 0;
  for (const p of progs) {
    if (count >= 13) break;
    if (p.genre === 'telejornal' && !p.locked) continue;
    const npc = makeTalent(ctx, null, p.genre, st.id, p.quality);
    makeContract(ctx.state, npc, st.id, ctx.rng.int(14, 90), npc.talent?.archetype === 'apresentador_auditorio' || npc.talent?.archetype === 'ancora' ? p.id : null, 0);
    p.talentIds.push(npc.id);
    count++;
    if (p.genre.startsWith('novela') && count < 13) {
      const lead = makeTalent(ctx, ctx.rng.chance(0.5) ? 'mocinha' : 'gala', p.genre, st.id, p.quality);
      makeContract(ctx.state, lead, st.id, ctx.rng.int(10, 60), null, 0);
      p.talentIds.push(lead.id);
      count++;
    }
  }
  // agentes livres no mercado
  const freeGenres: GenreId[] = ['auditorio', 'talk_show', 'novela_21h', 'humoristico', 'telejornal', 'policial'];
  for (const g of freeGenres) {
    if (!genreOk(ctx, st, g) && g !== 'telejornal') continue;
    makeTalent(ctx, null, g, null, ctx.rng.range(45, 85));
  }
}

function fixedNpcs(ctx: Ctx, st: Station, bg: Background): void {
  for (const def of FIXED_NPCS) {
    const npc: Npc = {
      id: def.key,
      name: def.name,
      role: def.role,
      title: def.title,
      stationId: st.id,
      age: def.age,
      sheet: { ...def.sheet },
      mood: def.mood,
      trust: def.trust,
      loyalty: def.loyalty,
      patience: def.patience,
      talent: null,
      contractId: null,
      requests: [],
      lastMetWeek: null,
      avatar: def.avatar,
    };
    if (bg === 'jornalista') {
      if (def.role === 'jornalismo') npc.trust += 15;
      if (def.role === 'comercial') npc.trust -= 10;
    }
    if (bg === 'publicitario') {
      if (def.role === 'comercial') npc.trust += 10;
      if (def.role === 'artistico') npc.mood -= 10;
    }
    if (bg === 'produtor_auditorio' && def.role === 'artistico') npc.trust -= 5;
    if (bg === 'herdeiro') {
      if (def.role === 'presidente') {
        npc.patience += 20;
        npc.trust += 10;
      } else npc.loyalty -= 10;
    }
    if (bg === 'streaming') {
      if (def.role === 'pesquisa') npc.trust += 10;
      if (def.role === 'jornalismo' || def.role === 'artistico') npc.trust -= 5;
    }
    ctx.state.npcs.push(npc);
  }
}

function fictionalRivals(ctx: Ctx, scenario: ScenarioId, playerArch: ArchetypeId): { name: string; short: string; color: string; archetype: ArchetypeId; power: number }[] {
  const rng = ctx.rng;
  const pool = rng.shuffle([...FICTIONAL_STATIONS]);
  const arches: ArchetypeId[] = [];
  if (scenario !== 'lider_ameacada') arches.push('hegemonica');
  if (scenario !== 'vice_ambiciosa') arches.push('popular_auditorio');
  arches.push('desafiante');
  const extra: ArchetypeId[] = rng.shuffle(['jornalistica_esportiva', 'em_crise', 'publica_educativa'] as ArchetypeId[]);
  const n = rng.int(4, 5);
  while (arches.length < n) arches.push(extra.shift() as ArchetypeId);
  const powers: Record<ArchetypeId, number> = {
    hegemonica: 0.85, popular_auditorio: 0.35, desafiante: 0.25, jornalistica_esportiva: 0.0, em_crise: -0.3, publica_educativa: -0.5, canal_pago: 0,
  };
  return arches.map((a, i) => ({
    name: pool[i].name,
    short: pool[i].short,
    color: pool[i].color,
    archetype: a,
    power: powers[a] + rng.normal(0, 0.06) - (scenario === 'lider_ameacada' && a === 'desafiante' ? -0.15 : 0),
  })).filter((r) => r.archetype !== playerArch || playerArch === 'desafiante');
}

export function createWorld(input: NewGameInput): GameState {
  const state = blankState(input);
  const rng = rngFor(input.seed, 'world');
  const ctx: Ctx = { state, rng, usedTitles: new Set(), era: input.era, year: input.startYear, universe: input.universe };
  const startDate = state.meta.date;
  const sc = SCENARIOS[input.scenario];
  let scenario = input.scenario;
  let playerSt: Station | null = null;
  let playerTemplate = sc.template;

  if (input.universe === 'real') {
    const defs = REAL_STATIONS[input.era].filter((d) => (!d.from || d.from <= startDate) && (!d.until || d.until > startDate));
    const sortedByPower = [...defs].sort((a, b) => b.power - a.power);
    for (const d of defs) {
      const isPlayer = input.station.mode === 'real' && input.station.realKey === d.key;
      const st = makeStation(ctx, { name: d.name, short: d.short, color: d.color, isPlayer, archetype: d.archetype, isReal: true, power: d.power, regional: d.regional, realKey: d.key });
      if (isPlayer) {
        playerSt = st;
        playerTemplate = d.archetype;
        scenario = sortedByPower[0].key === d.key ? 'lider_ameacada' : d.archetype === 'em_crise' ? 'emissora_crise' : 'vice_ambiciosa';
      }
      state.stations.push(st);
    }
  } else {
    for (const r of fictionalRivals(ctx, input.scenario, sc.archetype)) {
      state.stations.push(makeStation(ctx, { name: r.name, short: r.short, color: r.color, isPlayer: false, archetype: r.archetype, isReal: false, power: r.power, regional: null }));
    }
  }
  if (!playerSt) {
    const name = input.station.name?.trim() || PLAYER_DEFAULT_STATION.name;
    const short = (input.station.short?.trim() || name.replace(/^(TV|Rede|Canal)\s+/i, '').slice(0, 3)).toUpperCase();
    const reg: Record<string, number> = {};
    MARKETS.forEach((m, i) => (reg[m.code] = i === 0 ? 1.1 : i === 1 ? 1.05 : clamp(rng.normal(0.97, 0.06), 0.85, 1.1)));
    playerSt = makeStation(ctx, {
      name, short, color: input.station.color || PLAYER_DEFAULT_STATION.color, isPlayer: true, archetype: sc.archetype, isReal: false,
      power: sc.power, regional: reg, kind: input.scenario === 'canal_pago' ? 'pay' : 'open',
    });
    if (input.scenario === 'rede_nova') {
      playerSt.brand = 0.86;
      playerSt.hasNetwork = true;
    }
    if (input.scenario === 'emissora_crise') playerSt.hasNetwork = false;
    state.stations.push(playerSt);
  }
  playerSt.isPlayer = true;
  const scDef = SCENARIOS[scenario];
  playerSt.reputation = { critics: scDef.rep[0], public: scDef.rep[1], market: scDef.rep[2] };
  if (input.station.mode === 'real') {
    playerSt.reputation = { critics: ARCH_REP[playerSt.archetype][0], public: ARCH_REP[playerSt.archetype][1], market: ARCH_REP[playerSt.archetype][2] };
  }
  state.meta.scenario = scenario;
  state.meta.playerStationId = playerSt.id;
  if (input.player.background === 'produtor_auditorio') playerSt.reputation.critics -= 5;

  // direitos de futebol: hegemônica e jornalística/esportiva. Com o esporte real do catálogo (Fase 6.4), o
  // "Campeonato Nacional" genérico não existe: os jogos vêm dos contratos reais
  const realSports = input.universe === 'real' && !!input.catalog?.sports?.competitions.length;
  for (const st of state.stations) {
    if (st.archetype === 'hegemonica' || st.archetype === 'jornalistica_esportiva') st.footballUntilYear = st.isPlayer ? input.startYear : 9999;
    if (st.kind === 'pay' || realSports) st.footballUntilYear = null;
  }

  // catálogo real aprovado (v2): só no Brasil real
  if (input.universe === 'real' && input.catalog) state.catalog = input.catalog;

  // grades e acervo
  for (const st of state.stations) {
    const key = st.isPlayer ? playerTemplate : st.archetype;
    state.schedules[st.id] = buildGrid(ctx, st, key);
    const realGrid = state.catalog && st.realKey ? pickGrid(state.catalog, st.realKey, startDate) : null;
    if (realGrid) state.schedules[st.id] = overlayRealGrid(ctx, st, state.schedules[st.id], realGrid);
    if (!st.isPlayer) addReserves(ctx, st);
  }
  playerExtras(ctx, playerSt, scenario);
  if (state.catalog) playerCatalogAcervo(ctx, playerSt);
  ensurePlayerRunway(state, playerSt);
  ensureSystemPrograms(state);

  // hábito: assinatura do horário atual
  for (const st of state.stations) {
    const week = state.schedules[st.id];
    for (const p of state.programs) if (p.stationId === st.id && p.status === 'on_air') p.habitKey = habitKeyFor(week, p.id);
  }

  // pessoas
  fixedNpcs(ctx, playerSt, input.player.background);
  playerTalents(ctx, playerSt);
  if (input.player.background === 'streaming') state.research.precision += 20;

  // Copa do Mundo no ano inicial
  setupCopaYear(state, input.startYear);

  // canal pago: receita de assinatura
  if (playerSt.kind === 'pay') {
    const P = ERAS[input.era].params;
    playerSt.subscriptionWeekly = Math.round(27_767_000 * P.universeScale * playerSt.reach * 0.9);
  }
  return state;
}

// emissora real que entra no ar no meio da partida (ex.: RedeTV! em 1999)
export function addRealStation(state: GameState, def: { key: string; name: string; short: string; color: string; archetype: ArchetypeId; power: number; regional: Partial<Record<string, number>> }): Station {
  const rng = rngFor(state.meta.seed, 'newstation', def.key);
  const ctx = makeCtx(state, rng);
  const st = makeStation(ctx, { name: def.name, short: def.short, color: def.color, isPlayer: false, archetype: def.archetype, isReal: true, power: def.power, regional: def.regional, realKey: def.key });
  state.stations.push(st);
  state.schedules[st.id] = buildGrid(ctx, st, st.archetype);
  addReserves(ctx, st);
  for (const p of state.programs) if (p.stationId === st.id && p.status === 'on_air') p.habitKey = habitKeyFor(state.schedules[st.id], p.id);
  for (const p of state.programs) if (p.stationId === st.id) {
    p.habitWeeks = 0;
    p.buzz = Math.min(100, p.buzz + 15);
  }
  return st;
}

export function setupCopaYear(state: GameState, year: number): void {
  if (!COPAS[year]) return;
  if (state.catalog?.sports?.competitions.length) return; // esporte real: a Copa vem do calendário e dos contratos
  const rng = rngFor(state.meta.seed, 'copa', year);
  let stage = COPAS[year].realStage;
  if (state.meta.universe === 'fictional' || stage === 0) stage = rng.weighted([3, 4, 5, 6, 7], (s) => (s === 3 ? 2 : s === 4 ? 3 : s === 5 ? 2 : 1.2)) ?? 4;
  state.flags[`copa_stage_${year}`] = stage;
  for (const st of state.stations) {
    if (st.isPlayer) {
      if (st.archetype === 'hegemonica') state.flags[`copa_${year}_${st.id}`] = true;
      continue;
    }
    if (st.archetype === 'hegemonica') state.flags[`copa_${year}_${st.id}`] = true;
  }
}

export function initialRegionalFor(code: string): number {
  return MARKETS.findIndex((m) => m.code === code);
}

export function isFiniteGenre(g: GenreId): boolean {
  return isFinite(g);
}
