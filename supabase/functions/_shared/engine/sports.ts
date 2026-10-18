// Motor esportivo (v2, seção 8C): calendário com datas e horários da era, mudanças de horário e adiamentos,
// resultados por modelo de gols (Poisson), classificação e fases, interesse de cada jogo por praça (fórmula da
// seção 8C.4) e o multiplicador de evento da seção 9.1 (seleção e finais).
//
// Determinístico e sem I/O: o calendário sai da semente da partida e da cópia do catálogo; o estado guarda só os
// placares, as mudanças impostas pela liga e as escolhas de transmissão (state.sports). Atletas reais nunca
// aparecem: os lances falam em "o camisa 9", "o goleiro", "o piloto".

import { GENRES } from './catalog/genres.ts';
import { MARKET_WEIGHTS, MARKETS } from './catalog/markets.ts';
import { parseDays } from './catalogWorld.ts';
import { clamp, hashStr, rngFor } from './rng.ts';
import type { Rng } from './rng.ts';
import { addDays, parseIso, yearOf } from './time.ts';
import type { GameState, MatchScore, Program, SportsCatalogSnap, SportsChange, SportsCompetitionSnap, SportsState } from './types.ts';

// ===== constantes do modelo (estimativas de jogo) =====
const BASE_GOALS = 1.18; // gols esperados de cada time num jogo equilibrado
const STRENGTH_K = 0.022; // 10 pontos de força = 25% mais gols esperados
const HOME_ADV = 1.22;
const AWAY_PEN = 0.9;
const NEUTRAL_BASE = 0.4; // ν0: interesse de quem não torce para nenhum dos dois
const FAN_K = 2.6; // κ: peso da torcida da praça no interesse
const TV_CAPACITY = 2; // jogos por horário de TV aberta numa rodada (a Globo regionaliza)
const OUT_OF_AREA = 0.6; // fora da área do estadual: apelo de um programa comum da grade local
const MATCH_SLOTS = 8; // 2 horas de transmissão (15 min por slot); prorrogação soma 2
const TIER_STRENGTH: Record<string, number> = {
  estrangeiro_forte: 82, estrangeiro_medio: 70, estrangeiro_fraco: 58, pequeno: 46,
  selecao_forte: 84, selecao_media: 74, selecao_fraca: 62,
};
const TIER_LABEL: Record<string, string> = {
  estrangeiro_forte: 'Clube estrangeiro forte', estrangeiro_medio: 'Clube estrangeiro', estrangeiro_fraco: 'Clube estrangeiro modesto',
  pequeno: 'Clube do interior', selecao_forte: 'Seleção forte', selecao_media: 'Seleção', selecao_fraca: 'Seleção modesta',
};
const NATIONS: Record<string, string> = { brasil: 'Brasil', marrocos: 'Marrocos', escocia: 'Escócia', haiti: 'Haiti' };
const KO_SIZE: Record<string, number> = { '16avos': 32, fase5: 32, oitavas: 16, quartas: 8, semifinal: 4, final: 2 };
const PHASE_F: Record<string, number> = {
  pre: 0.85, fase5: 0.95, grupos: 1, liga: 1, primeira: 1, playoffs: 1.05, '16avos': 1.08, oitavas: 1.12, quartas: 1.22,
  semifinal: 1.36, terceiro: 1.05, final: 1.6,
};
const SELECAO_E: Record<string, number> = { grupos: 1.08, '16avos': 1.1, oitavas: 1.13, quartas: 1.18, semifinal: 1.22, terceiro: 1.08, final: 1.28 };

// ===== tipos =====
interface Horario { dias: string; hora: string; tv_aberta?: boolean }
interface Rules {
  inicio?: string; fim?: string; pausas?: { de: string; ate: string }[]; horarios?: Horario[];
  datas?: Record<string, string[]>; gps?: { id: string; nome: string; data: string; hora: string; tv_aberta?: boolean }[];
  jogos_brasil?: { data: string; hora: string; adversario: string }[]; duracao_min?: number;
}
interface PhaseDef { id: string; nome: string; jogos: number; campo?: string }

export interface Fixture {
  code: string;
  comp: string;
  season: string;
  phase: string;
  phaseName: string;
  round: number; // rodada (ligas e grupos); 1 nos mata-matas
  leg: 0 | 1 | 2; // 0 = jogo único
  group?: number;
  tie?: string; // confronto de mata-mata
  firstLeg?: string; // código do jogo de ida (no jogo de volta)
  date: string;
  time: string;
  home: string;
  away: string | null; // null em GPs
  neutral: boolean;
  extraTime: boolean; // mata-mata em jogo único com prorrogação antes dos pênaltis
  label?: string; // GP
  live?: boolean; // GP ao vivo na TV aberta
  slots: number;
  status: 'agendado' | 'adiado' | 'encerrado';
  score?: MatchScore;
  change?: SportsChange;
  lastRounds?: boolean; // reta final de liga
}

interface Built { fixtures: Fixture[]; complete: boolean; champion: string | null; runnerUp: string | null; table?: string[] }

// ===== utilidades de data =====
const dow = (iso: string): number => (parseIso(iso).getUTCDay() + 6) % 7; // segunda = 0
const daysBetween = (a: string, b: string): number => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function shiftDates<T>(v: T, days: number): T {
  if (typeof v === 'string') return (ISO.test(v) ? addDays(v, days) : v) as T;
  if (Array.isArray(v)) return v.map((x) => shiftDates(x, days)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDates(x, days)])) as T;
  return v;
}

export function seasonYear(season: string): number {
  const m = /^(\d{4})\/(\d{2})$/.exec(season);
  return m ? Number(m[1]) + 1 : Number(season);
}
const isEuropean = (c: SportsCompetitionSnap) => Object.keys(c.calendar).some((k) => k.includes('/'));
const euroKey = (endYear: number) => `${endYear - 1}/${String(endYear % 100).padStart(2, '0')}`;

// temporadas que podem ter jogos no ano da data
function seasonsOfYear(c: SportsCompetitionSnap, year: number): string[] {
  return isEuropean(c) ? [euroKey(year), euroKey(year + 1)] : [String(year)];
}

// regras de calendário da temporada; temporadas sem dados repetem a mais recente, 52 semanas depois
function rulesFor(c: SportsCompetitionSnap, season: string): Rules | null {
  const own = c.calendar[season] as Rules | undefined;
  const y = seasonYear(season);
  const earlier = Object.keys(c.calendar).filter((k) => k !== 'concorrencias' && seasonYear(k) < y).sort((a, b) => seasonYear(a) - seasonYear(b));
  const base = earlier.at(-1);
  if (!base) return own ?? null;
  if (!own && c.kind === 'evento') return null; // Copa do Mundo e outros eventos não se repetem sozinhos
  const prev = rulesFor(c, base);
  const shifted = prev ? shiftDates(prev, 364 * (y - seasonYear(base))) : null;
  if (!own) return shifted;
  return { ...(shifted ?? {}), ...own, datas: { ...(shifted?.datas ?? {}), ...(own.datas ?? {}) }, horarios: own.horarios ?? shifted?.horarios };
}

function phasesOf(c: SportsCompetitionSnap): PhaseDef[] {
  const f = c.format.fases;
  return Array.isArray(f) ? (f as PhaseDef[]).map((p) => ({ id: String(p.id), nome: String(p.nome ?? p.id), jogos: Number(p.jogos ?? 1), ...(p.campo ? { campo: String(p.campo) } : {}) })) : [];
}

// ===== times =====
export function teamName(state: GameState, team: string | null): string {
  if (!team) return '';
  if (team.startsWith('selecao:')) {
    const k = team.slice(8);
    return NATIONS[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
  }
  if (team.startsWith('generico:')) {
    const [tier, n] = team.slice(9).split('#');
    return `${TIER_LABEL[tier] ?? 'Clube'} ${Number(n ?? 0) + 1}`;
  }
  return state.catalog?.sports?.clubs.find((c) => c.id === team)?.name ?? team;
}

export function teamStrength(state: GameState, team: string, year: number): number {
  if (team.startsWith('generico:')) return TIER_STRENGTH[team.slice(9).split('#')[0]] ?? 55;
  const sp = state.catalog?.sports;
  if (team.startsWith('selecao:')) {
    for (const c of sp?.competitions ?? []) {
      const f = c.format.selecoes_forca as Record<string, number> | undefined;
      if (f && typeof f[team.slice(8)] === 'number') return f[team.slice(8)];
    }
    return 72;
  }
  const club = sp?.clubs.find((c) => c.id === team);
  if (!club) return 55;
  if (typeof club.ratings[String(year)] === 'number') return club.ratings[String(year)];
  const known = Object.keys(club.ratings).map(Number).filter((y) => y < year).sort((a, b) => a - b);
  const y0 = known.at(-1);
  let r = y0 !== undefined ? club.ratings[String(y0)] : 60;
  // temporadas seguintes: volta lenta para a média e oscilação por temporada
  for (let y = (y0 ?? year - 1) + 1; y <= year; y++) r = 0.85 * r + 0.15 * 68 + rngFor(state.meta.seed, 'forca', team, y).normal(0, 3.5);
  return clamp(r, 35, 95);
}

function fanShare(sp: SportsCatalogSnap, team: string | null, market: string, comp: SportsCompetitionSnap): number {
  if (!team) return 0;
  if (team === 'selecao:brasil') return Number(comp.format.torcida_selecao ?? 0.85);
  return sp.fanbase[team]?.[market] ?? 0;
}

function rivalry(sp: SportsCatalogSnap, a: string, b: string | null): { weight: number; name?: string } {
  if (!b) return { weight: 1 };
  const x = sp.clubs.find((c) => c.id === a)?.rivals.find((r) => r.club === b) ?? sp.clubs.find((c) => c.id === b)?.rivals.find((r) => r.club === a);
  return x ? { weight: x.weight, name: x.name } : { weight: 1 };
}

// puxada nacional de um confronto (para escolher os jogos de TV aberta de cada rodada)
function nationalPull(state: GameState, comp: SportsCompetitionSnap, home: string, away: string | null, year: number): number {
  const sp = state.catalog!.sports!;
  let fans = 0;
  MARKETS.forEach((m, i) => { fans += (fanShare(sp, home, m.code, comp) + fanShare(sp, away, m.code, comp)) * MARKET_WEIGHTS[i]; });
  const str = (teamStrength(state, home, year) + (away ? teamStrength(state, away, year) : 60)) / 200;
  return fans * rivalry(sp, home, away).weight + 0.15 * str;
}

// ===== participantes da temporada =====
function participantsFor(state: GameState, c: SportsCompetitionSnap, season: string): string[] {
  const sp = state.catalog!.sports!;
  const y = seasonYear(season);
  let list = c.participants[season];
  if (!list) {
    const keys = Object.keys(c.participants).filter((k) => seasonYear(k) < y).sort((a, b) => seasonYear(a) - seasonYear(b));
    list = keys.length ? [...c.participants[keys.at(-1)!]] : [];
    const prev = String(y - 1);
    const doneA = state.sports?.done[`brasileirao_a|${prev}`];
    const doneB = state.sports?.done[`brasileirao_b|${prev}`];
    if (c.id === 'brasileirao_a' && doneA?.table && doneB?.table) {
      const down = Number(c.format.rebaixados ?? 4);
      list = [...doneA.table.slice(0, doneA.table.length - down), ...doneB.table.slice(0, down)];
    } else if (c.id === 'brasileirao_b' && doneA?.table && doneB?.table) {
      const up = Number(c.format.promovidos ?? 4);
      const down = Number(c.format.rebaixados ?? 4);
      list = [...doneB.table.slice(up, doneB.table.length - down), ...doneA.table.slice(-up), ...Array.from({ length: down }, () => 'generico:pequeno')];
    } else if ((c.id === 'libertadores' || c.id === 'sul_americana') && doneA?.table) {
      const liberta = [...doneA.table.slice(0, 6)];
      for (const extra of [state.sports?.done[`copa_do_brasil|${prev}`]?.champion, state.sports?.done[`libertadores|${prev}`]?.champion]) {
        if (extra && !extra.includes(':') && !liberta.includes(extra)) liberta.push(extra);
      }
      for (const t of doneA.table) if (liberta.length < 8 && !liberta.includes(t)) liberta.push(t);
      const sula = doneA.table.filter((t) => !liberta.includes(t)).slice(0, 6);
      const generic = list.filter((t) => t.startsWith('generico:'));
      list = [...(c.id === 'libertadores' ? liberta : sula), ...generic];
    }
  }
  const valid = new Set(sp.clubs.map((x) => x.id));
  const count = new Map<string, number>();
  return list
    .filter((t) => t.includes(':') || valid.has(t))
    .map((t) => {
      if (!t.startsWith('generico:')) return t;
      const n = count.get(t) ?? 0;
      count.set(t, n + 1);
      return `${t}#${n}`;
    });
}

// ===== tabelas =====
interface TableRow { team: string; pts: number; w: number; d: number; l: number; gf: number; ga: number }

export function standings(fixtures: Fixture[], teams: string[]): TableRow[] {
  const rows = new Map(teams.map((t) => [t, { team: t, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }]));
  for (const f of fixtures) {
    if (!f.score || !f.away) continue;
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    if (!h || !a) continue;
    const [hg, ag] = f.score;
    h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.pts += 3; h.w++; a.l++; } else if (hg < ag) { a.pts += 3; a.w++; h.l++; } else { h.pts++; a.pts++; h.d++; a.d++; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || hashStr(x.team) - hashStr(y.team));
}

function roundRobin(teams: string[]): [string, string][][] {
  const list = [...teams];
  if (list.length % 2) list.push('');
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

// ===== datas e horários =====
// janelas de fim de semana (base no sábado) e de meio de semana (base na quarta) entre início e fim, fora das pausas
function leagueWindows(r: Rules, need: number, busyWeekends: { de: string; ate: string }[] = []): string[] {
  if (!r.inicio || !r.fim) return [];
  const paused = (d: string) => (r.pausas ?? []).some((p) => d >= p.de && d <= p.ate);
  const busy = (d: string) => busyWeekends.some((p) => d >= addDays(p.de, -1) && d <= p.ate);
  const days = new Set((r.horarios ?? []).flatMap((h) => parseDays(h.dias)));
  const hasWeekend = [4, 5, 6].some((d) => days.has(d));
  const hasMid = [0, 1, 2, 3].some((d) => days.has(d));
  const weekends: string[] = [];
  const mids: string[] = [];
  let monday = addDays(r.inicio, -dow(r.inicio));
  while (monday <= r.fim) {
    const wed = addDays(monday, 2);
    const sat = addDays(monday, 5);
    if (hasMid && wed >= r.inicio && wed <= r.fim && !paused(wed)) mids.push(wed);
    if (hasWeekend && sat >= addDays(r.inicio, -1) && sat <= r.fim && !paused(sat) && !busy(sat)) weekends.push(sat);
    monday = addDays(monday, 7);
  }
  const pickEven = (arr: string[], k: number) => (k >= arr.length ? arr : Array.from({ length: k }, (_, i) => arr[Math.floor((i * arr.length) / k)]));
  let chosen: string[];
  if (weekends.length >= need) chosen = pickEven(weekends, need);
  else {
    // faltam fins de semana: primeiro as quartas do período dos estaduais (como no calendário real), depois as demais
    const extra = need - weekends.length;
    const inBusy = mids.filter((d) => busy(addDays(d, 3)));
    const first = inBusy.slice(0, extra);
    chosen = [...weekends, ...first, ...pickEven(mids.filter((d) => !first.includes(d)), extra - first.length)];
  }
  chosen.sort();
  // se faltar data, as rodadas restantes vão para as semanas seguintes ao fim
  let extra = chosen.at(-1) ?? r.fim;
  while (chosen.length < need) {
    extra = addDays(extra, 7);
    chosen.push(extra);
  }
  return chosen;
}

// datas das rodadas de uma fase: as datas listadas, espalhadas entre a primeira e a última; sem espaço para uma por
// semana, as rodadas mais antigas ficam antes da primeira data (temporada já em andamento na largada)
function spreadDates(range: string[] | undefined, n: number): string[] {
  if (!range?.length || n <= 0) return [];
  if (range.length === n) return range;
  if (n === 1) return [range[0]];
  const a = range[0];
  const b = range[range.length - 1];
  const span = daysBetween(a, b);
  // sem espaço: as duas últimas rodadas nas datas listadas e as anteriores a cada três semanas, para trás
  if (span / (n - 1) < 6) return [...Array.from({ length: n - 2 }, (_, i) => addDays(a, -21 * (n - 2 - i))), a, b];
  return Array.from({ length: n }, (_, i) => addDays(a, Math.round((i * span) / (n - 1))));
}

interface Cand { date: string; time: string; tv: boolean }
function candidates(r: Rules, base: string, offsets: number[]): Cand[] {
  const out: Cand[] = [];
  for (const off of offsets) {
    const d = addDays(base, off);
    for (const h of r.horarios ?? []) if (parseDays(h.dias).includes(dow(d))) out.push({ date: d, time: h.hora, tv: !!h.tv_aberta });
  }
  return out;
}

// horário de cada jogo da rodada: os de maior apelo nacional pegam os horários de TV aberta
function assignKickoffs(rng: Rng, r: Rules, base: string, offsets: number[], items: { pull: number; set: (date: string, time: string) => void }[]): void {
  const cands = candidates(r, base, offsets);
  if (!cands.length) {
    for (const it of items) it.set(base, '21:30');
    return;
  }
  const tv = cands.filter((c) => c.tv);
  const rest = cands.filter((c) => !c.tv);
  const order = [...items].sort((a, b) => b.pull - a.pull);
  order.forEach((it, i) => {
    const c = i < tv.length * TV_CAPACITY ? tv[i % tv.length] : rng.pick(rest.length ? rest : cands);
    it.set(c.date, c.time);
  });
}

// ===== construção de uma temporada =====
interface Ctx {
  state: GameState;
  comp: SportsCompetitionSnap;
  season: string;
  year: number;
  rules: Rules;
  out: Fixture[];
  results: Record<string, MatchScore>;
  changes: Record<string, SportsChange>;
}

function mk(ctx: Ctx, f: Omit<Fixture, 'code' | 'status' | 'slots' | 'comp' | 'season'> & { key: string }): Fixture {
  const code = `${ctx.comp.id}:${ctx.season}:${f.key}`;
  const rest: Partial<typeof f> = { ...f };
  delete rest.key;
  const fx: Fixture = { ...(rest as Omit<typeof f, 'key'>), code, comp: ctx.comp.id, season: ctx.season, status: 'agendado', slots: ctx.comp.kind === 'gp' ? Math.ceil((ctx.rules.duracao_min ?? 120) / 15) : MATCH_SLOTS };
  const ch = ctx.changes[code];
  if (ch) {
    fx.change = ch;
    fx.date = ch.date;
    fx.time = ch.time;
  }
  const sc = ctx.results[code];
  if (sc) {
    fx.score = sc;
    fx.status = 'encerrado';
    if (sc[4] === 1) fx.slots += 2;
  } else if (ch?.kind === 'adiado') fx.status = 'adiado';
  ctx.out.push(fx);
  return fx;
}

// liga de pontos corridos (ou primeira fase resumida de estadual): devolve os jogos e se já terminou
function leaguePhase(ctx: Ctx, teams: string[], rounds: number, phase: string, phaseName: string, dates: string[], double: boolean): Fixture[] {
  const rng = rngFor(ctx.state.meta.seed, 'tabela', ctx.comp.id, ctx.season, phase);
  const order = rng.shuffle([...teams]);
  let rr = roundRobin(order);
  if (double) rr = [...rr, ...rr.map((rd) => rd.map(([a, b]) => [b, a] as [string, string]))];
  while (rr.length < rounds) rr = [...rr, ...rr.map((rd) => rd.map(([a, b]) => [b, a] as [string, string]))];
  rr = rr.slice(0, rounds);
  const list: Fixture[] = [];
  rr.forEach((pairs, ri) => {
    const base = dates[ri] ?? dates.at(-1)!;
    const fxs = pairs.map(([h, a], i) => mk(ctx, {
      key: `${phase}:${ri + 1}:${i}`, phase, phaseName, round: ri + 1, leg: 0, date: base, time: '21:30', home: h, away: a, neutral: false, extraTime: false,
      lastRounds: ri >= rounds - 5 && rounds >= 19,
    }));
    const offsets = dow(base) >= 4 ? [-1, 0, 1] : [-1, 0, 1, 2];
    assignKickoffs(rngFor(ctx.state.meta.seed, 'horario', ctx.comp.id, ctx.season, phase, ri), ctx.rules, base, offsets,
      fxs.filter((f) => !f.change).map((f) => ({ pull: nationalPull(ctx.state, ctx.comp, f.home, f.away, ctx.year), set: (d, t) => { f.date = d; f.time = t; } })));
    list.push(...fxs);
  });
  return list;
}

// fase de grupos: sorteio por potes (brasileiros separados quando possível)
function groupPhase(ctx: Ctx, teams: string[], groups: number, perGroup: number, rounds: number, phase: string, phaseName: string, dates: string[]): { fixtures: Fixture[]; groupsOf: string[][] } {
  const rng = rngFor(ctx.state.meta.seed, 'sorteio', ctx.comp.id, ctx.season, phase);
  const sorted = [...teams].sort((a, b) => teamStrength(ctx.state, b, ctx.year) - teamStrength(ctx.state, a, ctx.year) || a.localeCompare(b));
  const groupsOf: string[][] = Array.from({ length: groups }, () => []);
  for (let p = 0; p < perGroup; p++) {
    const pot = rng.shuffle(sorted.slice(p * groups, (p + 1) * groups));
    for (const t of pot) {
      const local = !t.includes(':');
      const options = groupsOf.map((g, i) => i).filter((i) => groupsOf[i].length === p);
      const ok = options.filter((i) => !local || !groupsOf[i].some((x) => !x.includes(':')));
      groupsOf[(ok.length ? ok : options)[0]].push(t);
    }
  }
  // seleção brasileira: grupo e adversários fixos, quando o formato informa
  const gb = ctx.comp.format.grupo_brasil as { adversarios?: string[] } | undefined;
  if (gb?.adversarios && teams.includes('selecao:brasil')) {
    const fixed = ['selecao:brasil', ...gb.adversarios.map((x) => `selecao:${x}`)].filter((t) => teams.includes(t));
    for (const g of groupsOf) for (let i = g.length - 1; i >= 0; i--) if (fixed.includes(g[i])) g.splice(i, 1);
    const free = groupsOf.flat();
    groupsOf.forEach((g) => g.splice(0));
    groupsOf[2 % groups].push(...fixed);
    let gi = 0;
    for (const t of free) {
      while (groupsOf[gi % groups].length >= perGroup) gi++;
      groupsOf[gi % groups].push(t);
      gi++;
    }
  }
  const double = rounds > perGroup - 1;
  const fixtures: Fixture[] = [];
  const mundial = ctx.comp.scope === 'mundial';
  const perRound = dates.length > 1 ? Math.max(1, Math.floor((daysBetween(dates[0], dates.at(-1)!) + 1) / rounds)) : 1;
  const brazilGames = ctx.rules.jogos_brasil ?? [];
  groupsOf.forEach((g, gi) => {
    let rr = roundRobin(g);
    if (double) rr = [...rr, ...rr.map((rd) => rd.map(([a, b]) => [b, a] as [string, string]))];
    rr.slice(0, rounds).forEach((pairs, ri) => {
      const roundBase = mundial ? addDays(dates[0], ri * perRound + Math.floor((gi * perRound) / groups)) : addDays(dates[ri] ?? dates.at(-1)!, gi % 3);
      pairs.forEach(([h, a], i) => {
        const f = mk(ctx, { key: `${phase}:${gi}:${ri + 1}:${i}`, phase, phaseName, round: ri + 1, leg: 0, group: gi, date: roundBase, time: '21:30', home: h, away: a, neutral: mundial, extraTime: false });
        const br = [h, a].includes('selecao:brasil') ? brazilGames.find((x) => x.adversario === (h === 'selecao:brasil' ? a : h).slice(8)) : undefined;
        if (f.change) { /* mudança já aplicada */ } else if (br) { f.date = br.data; f.time = br.hora; } else {
          const cands = candidates(ctx.rules, roundBase, mundial ? [0] : [0, 1]);
          const c = cands.length ? cands[(gi + i) % cands.length] : { date: roundBase, time: '21:30' };
          f.date = c.date;
          f.time = c.time;
        }
        fixtures.push(f);
      });
    });
  });
  return { fixtures, groupsOf };
}

// mata-mata: pares (sorteados ou por campanha), ida e volta ou jogo único; devolve os classificados se acabou
function knockout(ctx: Ctx, seeded: string[], phase: PhaseDef, dates: string[], opts: { draw: boolean; neutral?: boolean; extraTime?: boolean; key?: string }): { fixtures: Fixture[]; winners: string[] | null; losers: string[] | null } {
  const rng = rngFor(ctx.state.meta.seed, 'chave', ctx.comp.id, ctx.season, phase.id);
  const teams = opts.draw ? rng.shuffle([...seeded]) : seeded;
  const pairs: [string, string][] = [];
  const n = teams.length;
  if (opts.draw) for (let i = 0; i + 1 < n; i += 2) pairs.push([teams[i], teams[i + 1]]);
  else for (let i = 0; i < n / 2; i++) pairs.push([teams[i], teams[n - 1 - i]]); // melhor campanha contra a pior
  const legs = phase.jogos >= 2 ? 2 : 1;
  const neutral = !!opts.neutral || phase.campo === 'neutro';
  const fixtures: Fixture[] = [];
  const winners: string[] = [];
  const losers: string[] = [];
  let complete = true;
  pairs.forEach(([better, worse], i) => {
    const tie = `${opts.key ?? phase.id}:${i}`;
    const first = dates[0] ?? ctx.rules.fim ?? `${ctx.year}-12-01`;
    const last = dates[dates.length - 1] ?? first;
    // jogo único com várias datas (ex.: 16 avos da Copa): os confrontos se espalham pelos dias da fase
    const base1 = legs === 1 && dates.length > 1 ? addDays(first, Math.floor((i * (daysBetween(first, last) + 1)) / pairs.length)) : first;
    const base2 = dates.length > 1 ? last : addDays(first, 7);
    const set = (f: Fixture, base: string, j: number) => {
      if (f.change) return;
      const cands = candidates(ctx.rules, base, [0, 1]);
      const tv = cands.filter((c) => c.tv);
      const c = j === 0 && tv.length ? tv[0] : cands.length ? cands[j % cands.length] : { date: base, time: '21:30' };
      f.date = c.date;
      f.time = c.time;
    };
    if (legs === 1) {
      const f = mk(ctx, { key: `${tie}`, phase: phase.id, phaseName: phase.nome, round: 1, leg: 0, tie, date: base1, time: '21:30', home: better, away: worse, neutral, extraTime: !!opts.extraTime || neutral });
      set(f, base1, i);
      fixtures.push(f);
      const w = tieWinner([f]);
      if (w) { winners.push(w); losers.push(w === better ? worse : better); } else complete = false;
    } else {
      const f1 = mk(ctx, { key: `${tie}:1`, phase: phase.id, phaseName: phase.nome, round: 1, leg: 1, tie, date: base1, time: '21:30', home: worse, away: better, neutral: false, extraTime: false });
      const f2 = mk(ctx, { key: `${tie}:2`, phase: phase.id, phaseName: phase.nome, round: 1, leg: 2, tie, firstLeg: f1.code, date: base2, time: '21:30', home: better, away: worse, neutral: false, extraTime: false });
      set(f1, base1, i);
      set(f2, base2, i);
      fixtures.push(f1, f2);
      const w = tieWinner([f1, f2]);
      if (w) { winners.push(w); losers.push(w === better ? worse : better); } else complete = false;
    }
  });
  return { fixtures, winners: complete ? winners : null, losers: complete ? losers : null };
}

function tieWinner(legs: Fixture[]): string | null {
  if (legs.some((f) => !f.score)) return null;
  const last = legs[legs.length - 1];
  const goals = new Map<string, number>();
  for (const f of legs) {
    goals.set(f.home, (goals.get(f.home) ?? 0) + f.score![0]);
    goals.set(f.away!, (goals.get(f.away!) ?? 0) + f.score![1]);
  }
  const h = goals.get(last.home)!;
  const a = goals.get(last.away!)!;
  if (h !== a) return h > a ? last.home : last.away;
  const [, , ph, pa] = last.score!;
  if (ph !== undefined && pa !== undefined && ph >= 0) return ph > pa ? last.home : last.away;
  return last.home;
}

// classificados dos grupos: os N primeiros de cada grupo (e os melhores terceiros, se pedir)
function groupQualifiers(fixtures: Fixture[], groupsOf: string[][], perGroup: number, bestThirds = 0): { seeded: string[]; thirds: string[]; done: boolean } {
  const done = fixtures.every((f) => f.score);
  const tables = groupsOf.map((g, gi) => standings(fixtures.filter((f) => f.group === gi), g));
  const byPos: TableRow[][] = [];
  for (let p = 0; p < perGroup + 1; p++) byPos.push(tables.map((t) => t[p]).filter(Boolean));
  const rank = (rows: TableRow[]) => [...rows].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || hashStr(x.team) - hashStr(y.team));
  const seeded = byPos.slice(0, perGroup).flatMap((rows) => rank(rows).map((r) => r.team));
  const thirds = rank(byPos[perGroup] ?? []).map((r) => r.team);
  if (bestThirds) seeded.push(...thirds.slice(0, bestThirds));
  return { seeded, thirds, done };
}

// sequência de mata-matas a partir de uma lista de classificados
function bracket(ctx: Ctx, seeded: string[], phases: PhaseDef[], opts: { draw: boolean; extraTime: boolean; thirdPlace?: PhaseDef }): { champion: string | null; runnerUp: string | null } {
  let teams = seeded;
  let losersSemi: string[] | null = null;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    const dates = ctx.rules.datas?.[ph.id] ?? [];
    const res = knockout(ctx, teams, ph, dates, { draw: opts.draw && i === 0 ? true : opts.draw, extraTime: opts.extraTime });
    if (ph.id === 'semifinal') losersSemi = res.losers;
    if (!res.winners) return { champion: null, runnerUp: null };
    if (ph.id === 'final') {
      if (opts.thirdPlace && losersSemi) knockout(ctx, losersSemi, opts.thirdPlace, ctx.rules.datas?.[opts.thirdPlace.id] ?? [], { draw: false, extraTime: true, neutral: true });
      return { champion: res.winners[0], runnerUp: res.losers![0] };
    }
    // chave fixa depois do sorteio: vencedor do confronto 2k pega o do 2k+1 (reordenado para o pareamento i x n-1-i)
    teams = opts.draw ? res.winners : interleave(res.winners);
  }
  return { champion: null, runnerUp: null };
}

function interleave(winners: string[]): string[] {
  // pareamento i x (n-1-i) no knockout: monta a lista para que o vencedor 0 enfrente o 1, o 2 o 3...
  const n = winners.length;
  const out = new Array<string>(n);
  for (let k = 0; k < n / 2; k++) {
    out[k] = winners[2 * k];
    out[n - 1 - k] = winners[2 * k + 1];
  }
  return out;
}

// ===== formatos =====
function buildSeason(state: GameState, comp: SportsCompetitionSnap, season: string): Built {
  const rules = rulesFor(comp, season);
  const empty: Built = { fixtures: [], complete: false, champion: null, runnerUp: null };
  if (!rules) return empty;
  const ss = state.sports!;
  const ctx: Ctx = { state, comp, season, year: seasonYear(season), rules, out: [], results: ss.results, changes: ss.changes };
  const fmt = comp.format;
  const tipo = String(fmt.tipo ?? '');
  const phases = phasesOf(comp);
  const teams = participantsFor(state, comp, season);
  let champion: string | null = null;
  let runnerUp: string | null = null;
  let table: string[] | undefined;

  if (tipo === 'gp') {
    for (const g of rules.gps ?? []) mk(ctx, { key: `gp:${g.id}`, phase: 'gp', phaseName: g.nome, round: 1, leg: 0, date: g.data, time: g.hora, home: 'gp', away: null, neutral: true, extraTime: false, label: g.nome, live: !!g.tv_aberta });
    const done = ctx.out.length > 0 && ctx.out.every((f) => f.score);
    return { fixtures: ctx.out, complete: done, champion: null, runnerUp: null };
  }
  if (teams.length < 2) return empty;

  if (tipo === 'pontos_corridos') {
    const rounds = Number(fmt.rodadas ?? (teams.length - 1) * Number(fmt.turnos ?? 2));
    // fins de semana dos estaduais ficam com os estaduais: a liga nacional joga no meio da semana nesse período
    const busy = state.catalog!.sports!.competitions
      .filter((c) => c.scope === 'estadual')
      .map((c) => rulesFor(c, season))
      .filter((r): r is Rules => !!r?.inicio && !!r.fim)
      .map((r) => ({ de: r.inicio!, ate: r.fim! }));
    const fx = leaguePhase(ctx, teams, rounds, 'liga', 'Rodada', leagueWindows(rules, rounds, busy), Number(fmt.turnos ?? 2) >= 2);
    if (fx.every((f) => f.score)) {
      table = standings(fx, teams).map((r) => r.team);
      champion = table[0];
      runnerUp = table[1];
    }
  } else if (comp.scope === 'estadual') {
    // primeira fase resumida (cada clube joga N rodadas) e mata-mata entre os melhores
    const [first, ...ko] = phases;
    const koRounds = ko.reduce((n, p) => n + (p.jogos >= 2 ? 2 : 1), 0);
    const windows = leagueWindows(rules, (first?.jogos ?? 7) + koRounds);
    const fx = leaguePhase(ctx, teams, first?.jogos ?? 7, first?.id ?? 'primeira', first?.nome ?? 'Primeira fase', windows, false);
    if (fx.every((f) => f.score) && ko.length) {
      const order = standings(fx, teams).map((r) => r.team);
      let w = (first?.jogos ?? 7);
      const dated = ko.map((p) => {
        const d = windows.slice(w, w + (p.jogos >= 2 ? 2 : 1));
        w += p.jogos >= 2 ? 2 : 1;
        return d;
      });
      let cur = order.slice(0, KO_SIZE[ko[0].id] ?? 4);
      for (let i = 0; i < ko.length; i++) {
        const res = knockout(ctx, cur, ko[i], dated[i], { draw: false });
        if (!res.winners) break;
        if (ko[i].id === 'final') { champion = res.winners[0]; runnerUp = res.losers![0]; break; }
        cur = interleave(res.winners);
      }
    }
  } else if (tipo === 'mata_mata') {
    // Copa do Brasil: as fases iniciais (clubes menores) são resumidas; a simulação começa na fase em que a Série A entra
    const entry = phases.findIndex((p) => p.id === 'fase5' || /Série A/i.test(String((p as unknown as Record<string, unknown>).entram ?? '')));
    const from = entry >= 0 ? entry : 0;
    const size = KO_SIZE[phases[from].id] ?? 32;
    const serieA = participantsFor(state, comp.id === 'brasileirao_a' ? comp : (state.catalog!.sports!.competitions.find((c) => c.id === 'brasileirao_a') ?? comp), season).filter((t) => !t.includes(':'));
    const direct = teams.filter((t) => serieA.includes(t)).slice(0, size);
    const rng = rngFor(state.meta.seed, 'fases_iniciais', comp.id, season);
    const pool = teams.filter((t) => !direct.includes(t));
    const qualified: string[] = [];
    while (direct.length + qualified.length < size && pool.length) {
      const pick = rng.weighted(pool, (t) => Math.pow(teamStrength(state, t, ctx.year) / 50, 4))!;
      qualified.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    const r = bracket(ctx, [...direct, ...qualified], phases.slice(from), { draw: true, extraTime: false });
    champion = r.champion;
    runnerUp = r.runnerUp;
  } else if (tipo === 'grupos_mata_mata' || tipo === 'liga_mata_mata') {
    const groupIdx = phases.findIndex((p) => p.id === 'grupos' || p.id === 'liga');
    const gPhase = phases[groupIdx];
    const groups = Number(fmt.grupos ?? 1);
    const perGroup = Number(fmt.por_grupo ?? teams.length);
    const slotsInGroups = tipo === 'liga_mata_mata' ? Number(fmt.clubes ?? teams.length) : groups * perGroup;
    // fase preliminar (ida e volta) para quem não entra direto
    let groupTeams = teams;
    let preDone = true;
    const pre = phases.find((p) => p.id === 'pre');
    if (pre && groupIdx > 0) {
      // 4 vagas nos grupos saem da preliminar: os brasileiros da preliminar contra os estrangeiros mais fracos;
      // os demais estrangeiros da preliminar (sem efeito na TV brasileira) ficam de fora sem jogo simulado
      const preTies = 4;
      const preBR = Array.isArray(fmt.preliminar) ? (fmt.preliminar as string[]).filter((t) => teams.includes(t)).slice(0, preTies) : [];
      const sortedGen = teams.filter((t) => t.startsWith('generico:')).sort((a, b) => teamStrength(state, b, ctx.year) - teamStrength(state, a, ctx.year) || a.localeCompare(b));
      const directBR = teams.filter((t) => !t.includes(':') && !preBR.includes(t));
      const nDirectGen = Math.max(0, slotsInGroups - preTies - directBR.length);
      const directGen = sortedGen.slice(0, nDirectGen);
      const preGen = sortedGen.slice(nDirectGen, nDirectGen + preTies * 2 - preBR.length);
      const preTeams = [...preBR, ...preGen];
      const res = knockout(ctx, preTeams, pre, rules.datas?.pre ?? [], { draw: false });
      preDone = !!res.winners;
      groupTeams = [...directBR, ...directGen, ...(res.winners ?? [])];
    } else groupTeams = teams.slice(0, slotsInGroups);
    if (preDone) {
      const nRounds = gPhase?.jogos ?? 6;
      const gDates = rules.datas?.[gPhase?.id ?? 'grupos'] ?? [rules.inicio ?? `${ctx.year}-04-01`, rules.fim ?? `${ctx.year}-05-30`];
      let seeded: string[] = [];
      let groupsDone = false;
      if (tipo === 'liga_mata_mata') {
        const fx = leaguePhase(ctx, groupTeams, nRounds, gPhase.id, gPhase.nome, spreadDates(gDates, nRounds), false);
        groupsDone = fx.every((f) => f.score);
        if (groupsDone) seeded = standings(fx, groupTeams).map((r) => r.team);
      } else {
        const g = groupPhase(ctx, groupTeams, groups, perGroup, nRounds, gPhase.id, gPhase.nome, comp.scope === 'mundial' ? gDates : spreadDates(gDates, nRounds));
        const qualPer = Number(fmt.classificam_por_grupo ?? 2);
        const bestThirds = comp.scope === 'mundial' ? 32 - groups * qualPer : 0;
        const playoffsNext = phases[groupIdx + 1]?.id === 'playoffs';
        // com repescagem depois dos grupos, os segundos colocados também seguem (Sul-Americana)
        const q = groupQualifiers(g.fixtures, g.groupsOf, playoffsNext ? Math.max(2, qualPer) : qualPer, bestThirds);
        groupsDone = q.done;
        seeded = q.seeded;
      }
      if (groupsDone) {
        const after = phases.slice(groupIdx + 1).filter((p) => p.id !== 'terceiro');
        const third = phases.find((p) => p.id === 'terceiro');
        let koPhases = after;
        let koTeams = seeded;
        // playoffs: Champions (9º a 24º) e Sul-Americana (2º dos grupos contra 3º da Libertadores)
        if (after[0]?.id === 'playoffs') {
          const po = after[0];
          let direct: string[];
          let poTeams: string[];
          if (tipo === 'liga_mata_mata') {
            direct = seeded.slice(0, 8);
            poTeams = seeded.slice(8, 24);
          } else {
            direct = seeded.slice(0, groups);
            const thirds = libertadoresThirds(state, ctx.season) ?? Array.from({ length: groups }, (_, i) => `generico:estrangeiro_medio#${90 + i}`);
            poTeams = [...seeded.slice(groups, groups * 2), ...thirds.slice(0, groups)];
          }
          const res = knockout(ctx, poTeams, po, rules.datas?.playoffs ?? [], { draw: false });
          if (!res.winners) koTeams = [];
          else koTeams = [...direct, ...res.winners];
          koPhases = after.slice(1);
        }
        if (koTeams.length) {
          const r = bracket(ctx, koTeams, koPhases, { draw: false, extraTime: comp.scope === 'mundial', thirdPlace: third });
          champion = r.champion;
          runnerUp = r.runnerUp;
        }
      }
    }
  }
  const complete = !!champion && ctx.out.every((f) => f.score);
  return { fixtures: ctx.out, complete, champion, runnerUp, ...(table ? { table } : {}) };
}

function libertadoresThirds(state: GameState, season: string): string[] | null {
  const lib = state.catalog?.sports?.competitions.find((c) => c.id === 'libertadores');
  if (!lib) return null;
  const built = seasonCached(state, lib, season);
  const groups = built.fixtures.filter((f) => f.phase === 'grupos');
  if (!groups.length || groups.some((f) => !f.score)) return null;
  const byGroup = new Map<number, string[]>();
  for (const f of groups) {
    const g = byGroup.get(f.group!) ?? [];
    for (const t of [f.home, f.away!]) if (!g.includes(t)) g.push(t);
    byGroup.set(f.group!, g);
  }
  return [...byGroup.entries()].sort((a, b) => a[0] - b[0]).map(([gi, g]) => standings(groups.filter((f) => f.group === gi), g)[2]?.team).filter(Boolean);
}

// ===== cache (o calendário é recalculado só quando um placar ou uma mudança entra) =====
// cada temporada tem um contador de versão, que sobe quando este módulo grava placar ou mudança nela; a Sul-Americana
// também depende da Libertadores (terceiros colocados), por isso a assinatura dela inclui a da Libertadores
const CACHE = new WeakMap<SportsState, Map<string, { sig: string; built: Built }>>();
const REV = new WeakMap<SportsState, Map<string, number>>();
function bump(ss: SportsState, comp: string, season: string): void {
  let m = REV.get(ss);
  if (!m) {
    m = new Map();
    REV.set(ss, m);
  }
  const k = `${comp}|${season}`;
  m.set(k, (m.get(k) ?? 0) + 1);
}
function seasonCached(state: GameState, comp: SportsCompetitionSnap, season: string): Built {
  const ss = state.sports!;
  let m = CACHE.get(ss);
  if (!m) {
    m = new Map();
    CACHE.set(ss, m);
  }
  const rev = REV.get(ss);
  const key = `${comp.id}|${season}`;
  // temporadas encerradas mudam os participantes das seguintes (acesso, rebaixamento, vagas continentais)
  const sig = `${rev?.get(key) ?? 0}|${rev?.get(`libertadores|${season}`) ?? 0}|${Object.keys(ss.done).length}`;
  const hit = m.get(key);
  if (hit && hit.sig === sig) return hit.built;
  const built = state.sports!.done[key] ? { fixtures: [], complete: true, champion: state.sports!.done[key].champion, runnerUp: state.sports!.done[key].runnerUp } : buildSeason(state, comp, season);
  m.set(key, { sig, built });
  return built;
}

export function sportsActive(state: GameState): boolean {
  return !!state.sports && !!state.catalog?.sports?.competitions.length;
}

// todos os jogos conhecidos (disputados e próximos) das temporadas que tocam o ano da data
export function seasonFixtures(state: GameState, compId: string, season: string): Fixture[] {
  const comp = state.catalog?.sports?.competitions.find((c) => c.id === compId);
  if (!comp || !state.sports) return [];
  return seasonCached(state, comp, season).fixtures;
}

export function fixturesBetween(state: GameState, from: string, to: string): Fixture[] {
  if (!sportsActive(state)) return [];
  const out: Fixture[] = [];
  const years = new Set([yearOf(from), yearOf(to)]);
  for (const comp of state.catalog!.sports!.competitions) {
    const seasons = new Set([...years].flatMap((y) => seasonsOfYear(comp, y)));
    for (const s of seasons) for (const f of seasonCached(state, comp, s).fixtures) if (f.date >= from && f.date <= to) out.push(f);
  }
  return out.sort((a, b) => `${a.date}${a.time}${a.code}`.localeCompare(`${b.date}${b.time}${b.code}`));
}

export function fixtureByCode(state: GameState, code: string): Fixture | null {
  const [compId, season] = code.split(':');
  return seasonFixtures(state, compId, season).find((f) => f.code === code) ?? null;
}

export function competitionOf(state: GameState, compId: string): SportsCompetitionSnap | null {
  return state.catalog?.sports?.competitions.find((c) => c.id === compId) ?? null;
}

// ===== resultados =====
function poisson(rng: Rng, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l && k < 15);
  return k - 1;
}

function shootout(rng: Rng, sh: number, sa: number): [number, number] {
  const ph = clamp(0.74 + (sh - 70) * 0.002, 0.6, 0.85);
  const pa = clamp(0.74 + (sa - 70) * 0.002, 0.6, 0.85);
  let h = 0;
  let a = 0;
  for (let k = 0; k < 5; k++) {
    if (rng.chance(ph)) h++;
    if (rng.chance(pa)) a++;
    const left = 4 - k;
    if (h > a + left || a > h + left) break;
  }
  for (let k = 0; h === a && k < 20; k++) {
    const x = rng.chance(ph);
    const y = rng.chance(pa);
    if (x) h++;
    if (y) a++;
  }
  if (h === a) h++;
  return [h, a];
}

// placar de um jogo: Poisson pela força dos times, mando de campo e fase; mata-mata decide na prorrogação e nos pênaltis
export function simulateMatch(state: GameState, f: Fixture): MatchScore {
  if (!f.away) return [1]; // GP: só marca que aconteceu
  const year = seasonYear(f.season);
  const sh = teamStrength(state, f.home, year);
  const sa = teamStrength(state, f.away, year);
  const rng = rngFor(state.meta.seed, 'gol', f.code);
  const tight = f.phase === 'final' || f.phase === 'semifinal' ? 0.88 : 1;
  const lh = BASE_GOALS * Math.exp(STRENGTH_K * (sh - sa)) * (f.neutral ? 1 : HOME_ADV) * tight;
  const la = BASE_GOALS * Math.exp(STRENGTH_K * (sa - sh)) * (f.neutral ? 1 : AWAY_PEN) * tight;
  let hg = poisson(rng, lh);
  let ag = poisson(rng, la);
  const decisive = !!f.tie && f.leg !== 1;
  if (!decisive) return [hg, ag];
  const first = f.firstLeg ? state.sports!.results[f.firstLeg] : undefined;
  const aggH = () => hg + (first ? first[1] : 0);
  const aggA = () => ag + (first ? first[0] : 0);
  let et = 0;
  if (aggH() === aggA() && f.extraTime) {
    hg += poisson(rng, lh / 3);
    ag += poisson(rng, la / 3);
    et = 1;
  }
  if (aggH() !== aggA()) return et ? [hg, ag, -1, -1, 1] : [hg, ag];
  const [ph, pa] = shootout(rng, sh, sa);
  return [hg, ag, ph, pa, et];
}

// lances do jogo, calculados a partir do placar (para o modo ao vivo e a narração): minuto e tipo, sem nomes
export interface MatchEvent { minute: number; kind: 'gol' | 'gol_penalti' | 'virada' | 'expulsao' | 'penalti_perdido' | 'polemica' | 'fim_prorrogacao' | 'penaltis'; team: 'home' | 'away' | null; text: string }
export function matchEvents(state: GameState, f: Fixture): MatchEvent[] {
  if (!f.score || !f.away) return [];
  const rng = rngFor(state.meta.seed, 'lances', f.code);
  const [hg, ag, ph, pa, et] = f.score;
  const maxMin = et === 1 ? 120 : 90;
  const goals: { minute: number; team: 'home' | 'away' }[] = [];
  for (let i = 0; i < hg; i++) goals.push({ minute: rng.int(1, maxMin), team: 'home' });
  for (let i = 0; i < ag; i++) goals.push({ minute: rng.int(1, maxMin), team: 'away' });
  goals.sort((a, b) => a.minute - b.minute);
  const shirt = () => rng.pick(['o camisa 9', 'o camisa 10', 'o camisa 7', 'o camisa 11', 'o lateral', 'o zagueiro', 'o volante', 'o meia', 'o centroavante', 'o ponta']);
  const out: MatchEvent[] = [];
  let h = 0;
  let a = 0;
  let leader: 'home' | 'away' | null = null;
  let wasBehind: { home: boolean; away: boolean } = { home: false, away: false };
  const name = (t: 'home' | 'away') => teamName(state, t === 'home' ? f.home : f.away);
  for (const g of goals) {
    if (g.team === 'home') h++; else a++;
    const pen = rng.chance(0.12);
    out.push({ minute: g.minute, kind: pen ? 'gol_penalti' : 'gol', team: g.team, text: `${pen ? 'Pênalti convertido' : 'Gol'} do ${name(g.team)}: ${shirt()} marca. ${h} a ${a}.` });
    const now: 'home' | 'away' | null = h > a ? 'home' : a > h ? 'away' : null;
    if (now && now !== leader && wasBehind[now]) out.push({ minute: g.minute, kind: 'virada', team: now, text: `Virada do ${name(now)}!` });
    if (h > a) wasBehind = { ...wasBehind, away: true };
    if (a > h) wasBehind = { ...wasBehind, home: true };
    if (now) leader = now;
  }
  if (rng.chance(0.12)) {
    const t = rng.chance(0.5) ? 'home' : 'away';
    out.push({ minute: rng.int(30, 88), kind: 'expulsao', team: t, text: `Cartão vermelho para ${shirt()} do ${name(t)}.` });
  }
  if (rng.chance(0.08)) {
    const t = rng.chance(0.5) ? 'home' : 'away';
    out.push({ minute: rng.int(10, 85), kind: 'penalti_perdido', team: t, text: `O ${name(t)} desperdiça um pênalti: o goleiro defende.` });
  }
  if (rng.chance(0.2)) out.push({ minute: rng.int(15, 85), kind: 'polemica', team: null, text: 'Lance polêmico: o VAR chama o árbitro e a decisão divide os comentaristas.' });
  if (et === 1) out.push({ minute: 120, kind: 'fim_prorrogacao', team: null, text: 'Fim da prorrogação.' });
  if (ph !== undefined && ph >= 0) out.push({ minute: et === 1 ? 121 : 91, kind: 'penaltis', team: ph > pa ? 'home' : 'away', text: `Decisão nos pênaltis: ${ph} a ${pa} para o ${name(ph > pa ? 'home' : 'away')}.` });
  return out.sort((x, y) => x.minute - y.minute);
}

// ===== avanço do tempo =====
export function initSports(state: GameState): void {
  if (!state.catalog?.sports?.competitions.length) return;
  state.sports = { results: {}, changes: {}, picks: {}, done: {}, checkedUntil: state.meta.date };
  advanceSports(state, state.meta.date); // jogos anteriores à largada (ex.: começo da temporada europeia)
}

// joga tudo o que aconteceu antes da data (exclusive); temporadas encerradas viram um resumo
export function advanceSports(state: GameState, until: string): string[] {
  if (!sportsActive(state)) return [];
  const ss = state.sports!;
  const notes: string[] = [];
  const years = [yearOf(until) - 1, yearOf(until)];
  for (const comp of state.catalog!.sports!.competitions) {
    const seasons = [...new Set(years.flatMap((y) => seasonsOfYear(comp, y)))];
    for (const season of seasons) {
      const key = `${comp.id}|${season}`;
      if (ss.done[key]) continue;
      for (let guard = 0; guard < 40; guard++) {
        const built = seasonCached(state, comp, season);
        const pending = built.fixtures.filter((f) => !f.score && f.date < until).sort((a, b) => `${a.date}${a.time}${a.leg}`.localeCompare(`${b.date}${b.time}${b.leg}`));
        if (!pending.length) {
          // a temporada vira resumo uma semana depois do último jogo (a transmissão da final ainda usa o jogo)
          const last = built.fixtures.reduce((m, f) => (f.date > m ? f.date : m), '');
          if (built.complete && built.fixtures.length && addDays(last, 8) <= until) {
            ss.done[key] = { champion: built.champion, runnerUp: built.runnerUp, ...(built.table ? { table: built.table } : {}) };
            if (built.champion) notes.push(`${comp.name} ${season}: ${teamName(state, built.champion)} campeão.`);
            const prefix = `${comp.id}:${season}:`;
            for (const k of Object.keys(ss.results)) if (k.startsWith(prefix)) delete ss.results[k];
            for (const k of Object.keys(ss.changes)) if (k.startsWith(prefix)) delete ss.changes[k];
            for (const k of Object.keys(ss.picks)) if (k.startsWith(prefix)) delete ss.picks[k];
          }
          break;
        }
        // primeiro as idas, depois as voltas (a volta precisa do placar da ida)
        for (const f of pending) {
          if (f.firstLeg && !ss.results[f.firstLeg]) continue;
          ss.results[f.code] = simulateMatch(state, f);
        }
        bump(ss, comp.id, season);
      }
    }
  }
  return notes;
}

// mudanças impostas pela liga nas próximas três semanas: horário trocado para a TV ou jogo adiado
export function planCalendarChanges(state: GameState, today: string): { fixture: Fixture; change: SportsChange }[] {
  if (!sportsActive(state)) return [];
  const ss = state.sports!;
  const horizon = addDays(today, 21);
  const from = ss.checkedUntil > today ? addDays(ss.checkedUntil, 1) : addDays(today, 3);
  if (from > horizon) return [];
  const out: { fixture: Fixture; change: SportsChange }[] = [];
  for (const f of fixturesBetween(state, from, horizon)) {
    if (f.score || f.change || !f.away || f.phase === 'final') continue;
    const comp = competitionOf(state, f.comp)!;
    // a CBF, as ligas e as federações mexem nos jogos daqui; torneios internacionais têm datas fixas
    if (comp.kind === 'evento' || comp.kind === 'gp' || comp.scope === 'continental' || comp.scope === 'mundial') continue;
    const rng = rngFor(state.meta.seed, 'mudanca', f.code);
    const roll = rng.next();
    const rules = rulesFor(comp, f.season);
    if (!rules) continue;
    let change: SportsChange | null = null;
    if (roll < 0.03) {
      const cands = candidates(rules, f.date, [0, 1]).filter((c) => c.date !== f.date || c.time !== f.time);
      if (cands.length) {
        const c = rng.pick(cands);
        change = { date: c.date, time: c.time, kind: 'horario', reason: rng.pick(['a liga mudou o horário a pedido da TV', 'a polícia pediu outro horário por segurança', 'conflito com outro jogo do mesmo estádio']), fromDate: f.date, fromTime: f.time };
      }
    } else if (roll < 0.037) {
      let d = addDays(f.date, rng.int(7, 14));
      while (dow(d) !== 2) d = addDays(d, 1); // remarcado para uma quarta-feira
      const cands = candidates(rules, d, [0]);
      change = { date: d, time: cands[0]?.time ?? '21:30', kind: 'adiado', reason: rng.pick(['conflito de calendário com outra competição', 'chuva forte deixou o gramado sem condições', 'pedido do clube por causa de viagem longa']), fromDate: f.date, fromTime: f.time };
    }
    if (change) {
      ss.changes[f.code] = change;
      bump(ss, f.comp, f.season);
      out.push({ fixture: { ...f, date: change.date, time: change.time, change }, change });
    }
  }
  ss.checkedUntil = horizon;
  return out;
}

// o jogo está num horário típico de TV aberta da competição (ex.: quarta 21h30, domingo 16h)
export function isTvKickoff(state: GameState, f: Fixture): boolean {
  const comp = competitionOf(state, f.comp);
  if (!comp) return false;
  if (!f.away) return !!f.live;
  const r = rulesFor(comp, f.season);
  return (r?.horarios ?? []).some((h) => h.tv_aberta && h.hora === f.time && parseDays(h.dias).includes(dow(f.date)));
}

// ===== audiência (seção 8C.4) =====
function hourFactor(f: Fixture): number {
  const [h, m] = f.time.split(':').map(Number);
  const hour = h + (m || 0) / 60;
  const weekend = dow(f.date) >= 5;
  if (hour < 6) return 0.55;
  if (hour < 11) return weekend ? 0.9 : 0.6;
  if (hour < 15) return weekend ? 0.95 : 0.7;
  if (hour < 18) return weekend ? 1.0 : 0.75;
  if (hour < 20) return weekend ? 0.95 : 0.85;
  if (hour < 23) return 1.0;
  return 0.8;
}

export function phaseFactor(f: Fixture): number {
  let F = PHASE_F[f.phase] ?? 1;
  if (f.phase === 'final' && f.leg === 1) F = 1.45;
  if (f.lastRounds) F *= 1.12;
  return F;
}

// a praça recebe o jogo? (estaduais só passam nas praças do estado; nas outras a emissora segue a grade normal)
export function inArea(state: GameState, f: Fixture, marketIdx: number): boolean {
  if (marketIdx < 0) return true;
  const pracas = competitionOf(state, f.comp)?.format.pracas as string[] | undefined;
  return !pracas?.length || pracas.includes(MARKETS[marketIdx].code);
}

// I = B · (ν0 + κ·ΣT) · F · R · H, com T = torcida dos dois clubes na praça (ou interesse neutro sem clube brasileiro)
export function matchInterest(state: GameState, f: Fixture, marketIdx: number): number {
  const sp = state.catalog?.sports;
  const comp = competitionOf(state, f.comp);
  if (!sp || !comp) return 0.5;
  if (marketIdx < 0) return MARKETS.reduce((s, _, i) => s + matchInterest(state, f, i) * MARKET_WEIGHTS[i], 0);
  const market = MARKETS[marketIdx].code;
  const pracas = comp.format.pracas as string[] | undefined;
  const neutral = Number(comp.format.interesse_neutro ?? 0);
  const fans = fanShare(sp, f.home, market, comp) + fanShare(sp, f.away, market, comp);
  // estadual fora do seu estado: a emissora mostra a programação normal da praça (apelo de um programa comum)
  if (pracas?.length && !pracas.includes(market)) return OUT_OF_AREA;
  let I = (comp.baseAppeal / 100) * (NEUTRAL_BASE + FAN_K * (fans + neutral)) * phaseFactor(f) * rivalry(sp, f.home, f.away).weight * hourFactor(f);
  if (comp.kind === 'gp') {
    if (comp.format.piloto_brasileiro_no_grid) I *= 1.15;
    if (/São Paulo/.test(f.label ?? '')) I *= 1.35;
  }
  return clamp(I, 0.03, 1.9);
}

// multiplicador de evento (seção 9.1) no TLE: jogo da seleção em todas as praças; finais pela torcida local
export function eventTleMult(state: GameState, f: Fixture, marketIdx: number): number {
  const sp = state.catalog?.sports;
  const comp = competitionOf(state, f.comp);
  if (!sp || !comp || !f.away || !inArea(state, f, marketIdx)) return 1;
  if (f.home === 'selecao:brasil' || f.away === 'selecao:brasil') return SELECAO_E[f.phase] ?? 1.08;
  if (f.phase !== 'final') return 1;
  const market = marketIdx >= 0 ? MARKETS[marketIdx].code : null;
  const fans = market ? fanShare(sp, f.home, market, comp) + fanShare(sp, f.away, market, comp) : MARKETS.reduce((s, m, i) => s + (fanShare(sp, f.home, m.code, comp) + fanShare(sp, f.away, m.code, comp)) * MARKET_WEIGHTS[i], 0);
  return 1 + 0.12 * Math.min(1, fans * 1.6) * (comp.baseAppeal / 100);
}

// ===== jogo na grade =====
export function matchProgramId(stationId: string, code: string): string {
  return `jogo_${stationId}_${code.replace(/[^a-z0-9]+/gi, '_')}`;
}

export function matchTitle(state: GameState, f: Fixture): string {
  const comp = competitionOf(state, f.comp);
  if (!f.away) return `${comp?.name ?? 'GP'}: ${f.label ?? 'GP'}`;
  return `${comp?.name ?? 'Futebol'}: ${teamName(state, f.home)} x ${teamName(state, f.away)}`;
}

// programa de sistema que representa a transmissão de um jogo por uma emissora
export function ensureMatchProgram(state: GameState, stationId: string, f: Fixture): Program {
  const id = matchProgramId(stationId, f.code);
  let p = state.programs.find((x) => x.id === id);
  if (p) return p;
  const g = GENRES.futebol;
  const nat = matchInterest(state, f, -1);
  p = {
    id, stationId, title: matchTitle(state, f), genre: 'futebol', origin: 'sports', quality: 72, appeal: clamp(Math.round(nat * 70), 10, 99),
    profile: { ...g.profile }, rating: 'L', costPerEp: 0, durStd: f.slots * 15, durMin: f.slots * 15, durMax: (f.slots + 2) * 15, fatigue: 0, buzz: 40,
    habitWeeks: 8, habitKey: '', movesRecent: [], status: 'on_air', talentIds: [], commercial: 100, episodes: { total: null, aired: 0, planned: null },
    isRerun: false, merchLevel: 0, promo: 0, locked: true, leaseWeeklyPerHour: 0, rights: null, dev: null, tableMult: 1, price30s: 0,
    premiereWeek: null, createdWeek: state.meta.weekIndex, stats: [], totals: { revenue: 0, cost: 0, airings: 0, peakPts: 0 }, tempMods: [],
    flags: { fixture: f.code },
  };
  state.programs.push(p);
  return p;
}

// interesse do jogo por praça para um programa de transmissão (null se não é jogo). Transmissão regionalizada:
// cada praça vê o seu jogo (flags.fixtures). Pré e pós-jogo valem uma fração do interesse do jogo. Praça que não
// recebe o jogo (estadual de outro estado) fica com NaN: o motor de audiência usa a grade normal da emissora ali.
const ROLE_SHARE: Record<string, number> = { pre: 0.5, pos: 0.6 };
export function programMarketInterest(state: GameState, p: Program): { markets: number[]; pnt: number; fixture: Fixture } | null {
  const code = p.flags.fixture;
  if (typeof code !== 'string' || !sportsActive(state)) return null;
  const f = fixtureByCode(state, code);
  if (!f) return null;
  const perMarket = typeof p.flags.fixtures === 'string' ? String(p.flags.fixtures).split('|') : [];
  const k = ROLE_SHARE[String(p.flags.sportsRole ?? '')] ?? 1;
  const markets = MARKETS.map((_, i) => {
    if (perMarket.length && !perMarket[i]) return Number.NaN; // nenhum jogo da transmissão passa nesta praça
    const local = (perMarket[i] && perMarket[i] !== code ? fixtureByCode(state, perMarket[i]) : null) ?? f;
    return inArea(state, local, i) ? matchInterest(state, local, i) * k : Number.NaN;
  });
  return { markets, pnt: markets.reduce((s, v, i) => s + (Number.isNaN(v) ? OUT_OF_AREA : v) * MARKET_WEIGHTS[i], 0), fixture: f };
}

// última data prevista da temporada (calendário do catálogo, mesmo que as fases finais ainda não tenham jogos)
export function seasonEndDate(state: GameState, compId: string, season: string): string | null {
  const comp = competitionOf(state, compId);
  const rules = comp ? rulesFor(comp, season) : null;
  if (!rules) return null;
  let last: string | null = null;
  const scan = (v: unknown) => {
    if (typeof v === 'string' && ISO.test(v)) { if (!last || v > last) last = v; } else if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'pausas') scan(x); });
  };
  scan(rules);
  return last;
}

// temporada em curso de uma competição numa data (a europeia vira em julho)
export function seasonAt(state: GameState, compId: string, date: string): string {
  const comp = competitionOf(state, compId);
  const y = yearOf(date);
  if (!comp || !isEuropean(comp)) return String(y);
  return date.slice(5) >= '07-01' ? euroKey(y + 1) : euroKey(y);
}

export { daysBetween as sportsDaysBetween, dow as sportsDow };
