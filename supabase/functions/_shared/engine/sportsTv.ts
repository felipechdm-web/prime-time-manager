// Esporte na TV (v2, seções 8C.5 e 8C.6): contratos esportivos, escolha dos jogos de cada emissora, o jogo na grade
// (desloca a programação, com perda de hábito), pré e pós-jogo com herança, prorrogação e pênaltis, obrigações dos
// contratos, cotas esportivas e sublicenciamento. Determinístico e sem I/O, como o resto do motor.

import { GENRES } from './catalog/genres.ts';
import { MARKET_WEIGHTS, MARKETS } from './catalog/markets.ts';
import { clamp, rngFor } from './rng.ts';
import {
  competitionOf, fixtureByCode, fixturesBetween, inArea, isTvKickoff, matchEvents, matchInterest, matchProgramId, matchTitle, seasonAt, seasonEndDate, sportsActive, sportsDaysBetween, teamName,
} from './sports.ts';
import type { Fixture } from './sports.ts';
import { activeStations, getProgram, nextId, playerStation, pushTimeline } from './state.ts';
import { addDays, clockToSlot, SLOTS_PER_DAY } from './time.ts';
import type { AdDeal, GameState, Program, RightsContract, SportContractInfo, SportsChange, SportsCompetitionSnap, SportsWindow } from './types.ts';

const PRE_SLOTS = 1; // pré-jogo de 15 min
const POST_SLOTS = 2; // pós-jogo de 30 min
const HABIT_LOSS = 0.75; // semanas de hábito perdidas por deslocamento
const SPORTS_PRICE = 1.3; // tabela do esporte acima da média (as cotas esportivas são as mais caras)
const MIN_AIRED = 0.8; // obrigação: exibir ao menos 80% dos jogos escolhidos
const COTA_SHARE = 0.7; // cotas vendidas na temporada cobrem ~70% do custo dos direitos
const SUBLICENSE_SHARE = 0.22; // janela de TV paga e streaming vale ~22% do custo anual por ano restante
const WEAK_LOCAL_GAME = 0.35; // abaixo desse interesse, o jogo de estadual não entra na praça (fica a grade normal)

// ===== custos =====
// custo de direitos + produção (equipe no local) por jogo exibido, pelo apelo da competição; escala do gênero futebol
export function matchCost(comp: SportsCompetitionSnap): number {
  const [lo, hi] = GENRES.futebol.cost;
  const b = clamp(comp.baseAppeal / 100, 0, 1);
  return Math.round(lo + (hi - lo) * b * b);
}

// ===== contratos da largada =====
function parseMandantes(state: GameState, comp: SportsCompetitionSnap, terms: Record<string, unknown>): SportContractInfo['mandantes'] {
  const pacote = typeof terms.pacote === 'string' ? terms.pacote : null;
  const blocos = comp.format.blocos as Record<string, string[]> | undefined;
  if (pacote && blocos?.[pacote]) return { kind: 'bloco', bloco: pacote };
  const text = String(terms.mandantes ?? '');
  if (!text) return null;
  const clubs = state.catalog?.sports?.clubs ?? [];
  const named = clubs.filter((c) => text.includes(c.name)).map((c) => c.id);
  if (named.length) return { kind: 'clubes', ids: named };
  if (/LFU|FFU|bloco/i.test(text)) return blocos?.lfu ? { kind: 'bloco', bloco: 'lfu' } : { kind: 'resto' };
  return null;
}

// direitos esportivos da largada (seção 8C.2) viram contratos ativos de cada emissora
export function createSportsContracts(state: GameState): void {
  const cat = state.catalog;
  if (!cat?.sports) return;
  state.rightsContracts ??= [];
  const date = state.meta.date;
  for (const r of cat.rights) {
    if (r.kind !== 'esporte') continue;
    if (r.validTo && r.validTo < date) continue;
    const st = state.stations.find((s) => s.realKey === r.holderStationKey);
    const comp = competitionOf(state, r.productRef);
    if (!st || !comp) continue;
    const t = r.terms ?? {};
    const platforms = Array.isArray(t.plataformas) ? (t.plataformas as unknown[]).map(String) : ['tv_aberta'];
    const jogos = Number(t.jogos ?? 0);
    const days = comp.kind === 'evento' ? Math.max(1, sportsDaysBetween(String((comp.calendar['2026'] as Record<string, unknown>)?.inicio ?? date), String((comp.calendar['2026'] as Record<string, unknown>)?.fim ?? date)) + 1) : 1;
    const info: SportContractInfo = {
      comp: comp.id,
      pacote: typeof t.pacote === 'string' ? t.pacote : null,
      mandantes: parseMandantes(state, comp, t),
      perRound: t.um_por_dia ? 1 : jogos && comp.kind === 'evento' ? Math.max(1, Math.ceil(jogos / days)) : Number(t.jogos_por_rodada ?? t.jogos_por_fase ?? 1),
      choice: Number(t.escolha ?? 1),
      regional: !!t.regionalizado,
      pracas: Array.isArray(t.pracas) ? (t.pracas as unknown[]).map(String) : null,
      exclusive: t.exclusividade === 'exclusivo',
      includeBrazil: !!t.inclui_brasil,
      gpsLive: typeof t.gps_ao_vivo_tv_aberta === 'number' ? t.gps_ao_vivo_tv_aberta : null,
      platforms,
      sublicensable: platforms.some((p) => p !== 'tv_aberta') && !t.sublicenca,
      sublicensed: null,
      entitled: 0,
      aired: 0,
      checkedSeasons: [],
      cotaSeasons: [],
      crew: 'local',
      crewRequired: t.exclusividade === 'exclusivo', // quem compra com exclusividade se compromete com equipe própria no local
    };
    const cedente = typeof t.cedente === 'string' && cat.holders.some((h) => h.id === t.cedente) ? t.cedente : comp.holderId;
    const pacote = info.pacote ? ` (pacote ${info.pacote === 'libra' ? 'Libra' : info.pacote.toUpperCase()})` : '';
    const c: RightsContract = {
      id: nextId(state, 'rc'),
      stationId: st.id,
      holderId: cedente ?? null,
      productRef: comp.id,
      label: `${comp.name}${pacote}`,
      origin: 'largada',
      terms: {
        exclusividade: info.exclusive ? 'exclusivo' : 'compartilhado',
        plataformas: platforms.some((p) => p !== 'tv_aberta') ? 'tv_aberta_streaming' : 'tv_aberta',
        escopo: describeScope(state, comp, info),
      },
      startDate: r.validFrom,
      endDate: r.validTo,
      payments: [],
      obligations: [],
      status: 'ativo',
      sport: info,
    };
    state.rightsContracts.push(c);
    if (cedente) {
      state.holderRel ??= {};
      const rel = (state.holderRel[cedente] ??= {});
      if (!rel[st.id] || rel[st.id].score < 70) rel[st.id] = { score: 70, history: [{ date, delta: 20, reason: 'contrato esportivo vigente na largada' }] };
    }
  }
}

function describeScope(state: GameState, comp: SportsCompetitionSnap, info: SportContractInfo): string {
  const parts: string[] = [];
  if (info.gpsLive) parts.push(`${info.gpsLive} GPs ao vivo`);
  else if (comp.kind === 'evento') parts.push(info.perRound > 1 ? `até ${info.perRound} jogos por dia` : '1 jogo por dia');
  else parts.push(`${info.perRound} jogo${info.perRound > 1 ? 's' : ''} por rodada`);
  parts.push(info.choice === 1 ? '1ª escolha' : `${info.choice}ª escolha`);
  if (info.regional) parts.push('jogo regionalizado por praça');
  if (info.pracas) parts.push(`só em ${info.pracas.join(', ')}`);
  if (info.includeBrazil) parts.push('jogos do Brasil');
  if (info.mandantes?.kind === 'clubes') parts.push(`mandantes: ${info.mandantes.ids.map((x) => teamName(state, x)).join(', ')}`);
  parts.push(`mínimo de ${Math.round(MIN_AIRED * 100)}% dos jogos na TV aberta`);
  return parts.join(' · ');
}

// ===== quais jogos cada emissora transmite =====
// dia de TV e slot do início: jogo antes das 6h pertence ao dia anterior
export function tvSlot(f: Fixture): { date: string; slot: number } {
  const hour = Number(f.time.slice(0, 2));
  return { date: hour < 6 ? addDays(f.date, -1) : f.date, slot: clockToSlot(f.time) };
}

function eligible(state: GameState, c: RightsContract, f: Fixture, all: RightsContract[]): boolean {
  const info = c.sport!;
  if (f.comp !== info.comp) return false;
  if ((c.startDate && f.date < c.startDate) || (c.endDate && f.date > c.endDate)) return false;
  if (!f.away) return info.gpsLive === null || !!f.live;
  const m = info.mandantes;
  if (!m) return true;
  const comp = competitionOf(state, f.comp)!;
  const blocos = (comp.format.blocos as Record<string, string[]> | undefined) ?? {};
  if (m.kind === 'bloco') {
    if (blocos[m.bloco]) return m.bloco === 'libra' ? blocos.libra.includes(f.home) : !(blocos.libra ?? []).includes(f.home);
    return true;
  }
  if (m.kind === 'clubes') return m.ids.includes(f.home);
  // "resto": mandantes que não estão no pacote nominal de outra emissora
  const named = all.filter((x) => x !== c && x.sport?.comp === info.comp && x.sport.mandantes?.kind === 'clubes').flatMap((x) => (x.sport!.mandantes as { ids: string[] }).ids);
  return !named.includes(f.home);
}

const isBrazil = (f: Fixture) => f.home === 'selecao:brasil' || f.away === 'selecao:brasil';
const unitKey = (comp: SportsCompetitionSnap, f: Fixture) => (comp.kind === 'evento' ? `dia:${tvSlot(f).date}` : !f.away ? f.code : f.tie ? `${f.phase}:${f.leg}` : `${f.phase}:${f.round}`);
// a TV aberta prefere os jogos nos horários dela (a liga marca os jogos grandes para esses horários)
const nationalInterest = (state: GameState, f: Fixture) => matchInterest(state, f, -1) * (isTvKickoff(state, f) ? 1.3 : 1);

function activeSportContracts(state: GameState, from: string, to: string): RightsContract[] {
  const ids = new Set(activeStations(state).map((s) => s.id));
  return (state.rightsContracts ?? []).filter((c) => c.sport && c.status === 'ativo' && ids.has(c.stationId) && (!c.endDate || c.endDate >= from) && (!c.startDate || c.startDate <= to));
}

export function sportsProgramIds(stationId: string, main: string): { match: string; pre: string; pos: string } {
  const match = matchProgramId(stationId, main);
  return { match, pre: `${match}_pre`, pos: `${match}_pos` };
}

// escolha da semana (seção 8C, recomendação aprovada): quem tem 1ª escolha escolhe antes; os rivais e o jogador
// (automático, até a Central de Esportes) levam os jogos de maior interesse; transmissão regionalizada escolhe o
// horário com mais torcida somada e mostra em cada praça o jogo de lá
export function assignBroadcasts(state: GameState, opts: { recompute?: boolean } = {}): SportsWindow[] {
  const ss = state.sports;
  if (!ss || !sportsActive(state)) return [];
  const week = state.meta.weekIndex;
  if (ss.windowsWeek === week && ss.windows && !opts.recompute) return ss.windows;
  if (!opts.recompute) pruneOldSportsPrograms(state);
  const monday = state.meta.date;
  const sunday = addDays(monday, 6);
  // recálculo (escolha na Central): os dias que já foram ao ar ficam como estão
  const today = addDays(monday, state.weekProgress.day);
  const kept = opts.recompute && ss.windowsWeek === week ? (ss.windows ?? []).filter((w) => w.date < today) : [];
  const ps = playerStation(state);
  const fixtures = fixturesBetween(state, monday, addDays(sunday, 1)).filter((f) => {
    const d = tvSlot(f).date;
    return d >= (kept.length || opts.recompute ? today : monday) && d <= sunday;
  });
  const contracts = activeSportContracts(state, monday, sunday).sort((a, b) => a.sport!.choice - b.sport!.choice || Number(b.sport!.exclusive) - Number(a.sport!.exclusive) || a.stationId.localeCompare(b.stationId));
  const taken = new Set<string>();
  const windows: (SportsWindow & { codes: string[]; len: number })[] = kept.map((w) => {
    const codes = [...new Set([w.main, ...w.byMarket.filter(Boolean)])];
    for (const code of codes) taken.add(code);
    return { ...w, codes, len: fixtureByCode(state, w.main)?.slots ?? 8 };
  });
  const busy = (station: string, date: string, start: number, len: number) => windows.find((w) => w.station === station && w.date === date && start < w.start + w.len + POST_SLOTS && w.start - PRE_SLOTS < start + len);
  for (const c of contracts) {
    const info = c.sport!;
    const comp = competitionOf(state, info.comp);
    if (!comp) continue;
    const elig = fixtures.filter((f) => eligible(state, c, f, contracts));
    const units = new Map<string, Fixture[]>();
    for (const f of elig) units.set(unitKey(comp, f), [...(units.get(unitKey(comp, f)) ?? []), f]);
    for (const [uk, list] of [...units.entries()].sort((a, b) => `${a[1][0].date}${a[1][0].time}`.localeCompare(`${b[1][0].date}${b[1][0].time}`))) {
      if (kept.some((w) => w.contract === c.id && w.unit === uk)) continue;
      const groups: Fixture[][] = [];
      let n = info.perRound;
      if (info.includeBrazil) for (const b of list.filter(isBrazil)) { groups.push([b]); n--; }
      let avail = list.filter((f) => !taken.has(f.code) && !isBrazil(f));
      // escolha do jogador na Central de Esportes: outro jogo da rodada ('' = não transmitir)
      const override = c.stationId === ps.id ? ss.overrides?.[`${c.id}|${uk}`] : undefined;
      const forced = override ? avail.find((f) => f.code === override) : undefined;
      let forcedMain: string | null = null;
      if (forced && n > 0) {
        groups.push(info.regional ? avail.filter((f) => tvSlot(f).date === tvSlot(forced).date && tvSlot(f).slot === tvSlot(forced).slot) : [forced]);
        forcedMain = forced.code;
        avail = [];
        n--;
      }
      // direito só de algumas praças (estaduais): se a emissora já tem jogo noutra praça num horário, prefere o mesmo
      // horário, para as duas praças verem cada uma o seu jogo na mesma transmissão
      if (info.pracas && avail.length) {
        const local = (f: Fixture) => Math.max(...MARKETS.map((m, i) => (info.pracas!.includes(m.code) && inArea(state, f, i) ? matchInterest(state, f, i) : 0)));
        const best = Math.max(...avail.map(local));
        // só junta se o jogo do mesmo horário for quase tão bom quanto o melhor da rodada
        const same = avail.filter((f) => windows.some((w) => w.station === c.stationId && w.date === tvSlot(f).date && w.start === tvSlot(f).slot) && local(f) >= 0.75 * best);
        if (same.length) avail = same;
      }
      if (n > 0 && avail.length) {
        if (info.regional) {
          const byKick = new Map<string, Fixture[]>();
          for (const f of avail) {
            const k = `${tvSlot(f).date}|${tvSlot(f).slot}`;
            byKick.set(k, [...(byKick.get(k) ?? []), f]);
          }
          const score = (g: Fixture[]) => MARKETS.reduce((s, _, i) => s + MARKET_WEIGHTS[i] * Math.max(...g.map((f) => matchInterest(state, f, i))), 0);
          groups.push(...[...byKick.values()].sort((a, b) => score(b) - score(a) || a[0].code.localeCompare(b[0].code)).slice(0, n));
        } else {
          groups.push(...[...avail].sort((a, b) => nationalInterest(state, b) - nationalInterest(state, a) || a.code.localeCompare(b.code)).slice(0, n).map((f) => [f]));
        }
      }
      for (const g of groups) {
        const main = (forcedMain ? g.find((f) => f.code === forcedMain) : null) ?? [...g].sort((a, b) => nationalInterest(state, b) - nationalInterest(state, a) || a.code.localeCompare(b.code))[0];
        const { date, slot } = tvSlot(main);
        const len = main.slots;
        const clash = busy(c.stationId, date, slot, len);
        // jogo de cada praça: o de maior interesse entre os que passam nela; vazio onde nenhum passa (grade normal)
        // jogo muito fraco numa praça de estadual não vale a troca: ali a emissora segue a grade normal
        // (a escolha do próprio jogador vale mesmo assim)
        const reaches = (f: Fixture, i: number) => inArea(state, f, i) && (!info.pracas || (info.pracas.includes(MARKETS[i].code) && (f.code === forcedMain || matchInterest(state, f, i) >= WEAK_LOCAL_GAME)));
        const byMarket = MARKETS.map((_, i) => [...g].filter((f) => reaches(f, i)).sort((a, b) => matchInterest(state, b, i) - matchInterest(state, a, i) || a.code.localeCompare(b.code))[0]?.code ?? '');
        if (!byMarket.some(Boolean)) continue; // nenhuma praça vale a transmissão
        if (clash) {
          // mesma emissora, mesmo horário (ex.: pacotes Libra e LFU da Globo, Carioca no Rio e Mineiro em BH): junta,
          // cada praça fica com o jogo de maior interesse que passa nela
          if (clash.start !== slot) continue;
          clash.codes.push(...g.map((f) => f.code));
          clash.byMarket = MARKETS.map((_, i) => [clash.byMarket[i], byMarket[i]].filter(Boolean).sort((a, b) => matchInterest(state, fixtureByCode(state, b)!, i) - matchInterest(state, fixtureByCode(state, a)!, i))[0] ?? '');
        } else {
          windows.push({ station: c.stationId, contract: c.id, date, day: sportsDaysBetween(monday, date), start: slot, main: main.code, byMarket, codes: g.map((f) => f.code), len, unit: uk, ...(override === '' ? { skipped: true } : {}) });
        }
        for (const f of g) taken.add(f.code);
      }
    }
  }
  ss.windows = windows.map((w) => ({ station: w.station, contract: w.contract, date: w.date, day: w.day, start: w.start, main: w.main, byMarket: w.byMarket, ...(w.unit ? { unit: w.unit } : {}), ...(w.skipped ? { skipped: true } : {}) }));
  ss.windowsWeek = week;
  if (opts.recompute) {
    // escolhas desfeitas: os jogos que deixaram de ser transmitidos saem da lista de quem transmite
    for (const code of Object.keys(ss.picks)) {
      const f = fixtureByCode(state, code);
      if (f && tvSlot(f).date >= today && tvSlot(f).date <= sunday) delete ss.picks[code];
    }
  }
  for (const w of windows) if (!w.skipped) for (const code of w.codes) ss.picks[code] = [...new Set([...(ss.picks[code] ?? []), w.station])];
  for (const w of ss.windows) ensureWindowPrograms(state, w);
  if (opts.recompute) {
    // programas de transmissões trocadas (ainda não exibidos) saem do estado
    const valid = new Set(ss.windows.flatMap((w) => Object.values(sportsProgramIds(w.station, w.main))));
    state.programs = state.programs.filter((p) => !(p.origin === 'sports' && typeof p.flags.fixture === 'string' && p.createdWeek === week && p.totals.airings === 0 && !valid.has(p.id)));
  }
  return ss.windows;
}

// ===== Central de Esportes: escolha dos jogos e equipe =====
export interface PickOption { code: string; title: string; date: string; time: string; projected: number }
export interface PickUnit { contractId: string; contractLabel: string; unit: string; label: string; chosen: string | null; skipped: boolean; locked: boolean; options: PickOption[] }

// rodadas desta semana em que o jogador escolhe: o jogo escolhido, as alternativas livres e se o dia já passou
export function playerPickUnits(state: GameState): PickUnit[] {
  const ss = state.sports;
  if (!ss?.windows) return [];
  const ps = playerStation(state);
  const monday = state.meta.date;
  const today = addDays(monday, state.weekProgress.day);
  const all = activeSportContracts(state, monday, addDays(monday, 6));
  const fixtures = fixturesBetween(state, monday, addDays(monday, 7)).filter((f) => tvSlot(f).date >= monday && tvSlot(f).date <= addDays(monday, 6));
  const takenByOthers = new Set(ss.windows.filter((w) => w.station !== ps.id).flatMap((w) => w.byMarket.filter(Boolean).concat(w.main)));
  const out: PickUnit[] = [];
  for (const c of all.filter((x) => x.stationId === ps.id)) {
    const comp = competitionOf(state, c.sport!.comp);
    if (!comp) continue;
    const mine = ss.windows.filter((w) => w.contract === c.id);
    const units = new Map<string, Fixture[]>();
    for (const f of fixtures.filter((f) => eligible(state, c, f, all))) units.set(unitKey(comp, f), [...(units.get(unitKey(comp, f)) ?? []), f]);
    // interesse nas praças que recebem o jogo (estaduais e contratos regionais não contam o resto do país)
    const reachInterest = (f: Fixture) => {
      let s = 0;
      let wsum = 0;
      MARKETS.forEach((m, i) => {
        if (!inArea(state, f, i) || (c.sport!.pracas && !c.sport!.pracas.includes(m.code))) return;
        s += matchInterest(state, f, i) * MARKET_WEIGHTS[i];
        wsum += MARKET_WEIGHTS[i];
      });
      return wsum ? s / wsum : 0;
    };
    for (const [uk, list] of units) {
      const codes = new Set(list.map((f) => f.code));
      // a rodada pode estar numa transmissão de outro contrato (ex.: Mineiro em BH junto com o Carioca no Rio)
      const w = mine.find((x) => x.unit === uk) ?? ss.windows.find((x) => x.station === ps.id && x.byMarket.some((code) => codes.has(code)));
      const first = [...list].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
      const locked = tvSlot(first).date < today || (!!w && w.date < today);
      const label = comp.kind === 'evento' ? `${comp.name} · ${first.date.slice(8)}/${first.date.slice(5, 7)}` : `${comp.name} · ${first.phaseName}${first.away && !first.tie ? ` ${first.round}` : ''}`;
      const chosen = w ? (codes.has(w.main) ? w.main : w.byMarket.find((code) => codes.has(code)) ?? w.main) : null;
      out.push({
        contractId: c.id, contractLabel: c.label, unit: uk, label, chosen, skipped: !!w?.skipped, locked,
        options: list.filter((f) => !takenByOthers.has(f.code) && tvSlot(f).date >= today).map((f) => ({ code: f.code, title: matchTitle(state, f), date: f.date, time: f.time, projected: Math.round(reachInterest(f) * 100) / 100 })).sort((a, b) => b.projected - a.projected),
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

// o jogador troca o jogo de uma rodada ou abre mão da transmissão (code = null)
export function setSportsPick(state: GameState, contractId: string, unit: string, code: string | null): { ok: boolean; message: string } {
  const u = playerPickUnits(state).find((x) => x.contractId === contractId && x.unit === unit);
  if (!u) return { ok: false, message: 'Essa rodada não é sua nesta semana.' };
  if (u.locked) return { ok: false, message: 'Esse jogo já foi ao ar.' };
  if (code && !u.options.some((o) => o.code === code)) return { ok: false, message: 'Esse jogo não está disponível para a sua emissora.' };
  const ss = state.sports!;
  const key = `${contractId}|${unit}`;
  const previous = ss.overrides?.[key];
  ss.overrides = { ...(ss.overrides ?? {}), [key]: code ?? '' };
  assignBroadcasts(state, { recompute: true });
  const title = code ? matchTitle(state, fixtureByCode(state, code)!) : '';
  if (code && !ss.windows!.some((w) => w.station === playerStation(state).id && !w.skipped && (w.main === code || w.byMarket.includes(code)))) {
    // o horário bate com outra transmissão da emissora: desfaz e explica
    const next = { ...ss.overrides };
    if (previous === undefined) delete next[key];
    else next[key] = previous;
    ss.overrides = next;
    assignBroadcasts(state, { recompute: true });
    return { ok: false, message: `${title} bate com outra transmissão sua no mesmo horário. Troque aquela transmissão antes.` };
  }
  return { ok: true, message: code ? `Transmissão escolhida: ${title}.` : `Você abriu mão da transmissão de ${u.label}. Conta na obrigação mínima do contrato.` };
}

// equipe no estádio (padrão) ou narração do estúdio: mais barata e com menos qualidade de transmissão
export function setSportsCrew(state: GameState, contractId: string, crew: 'local' | 'estudio'): { ok: boolean; message: string } {
  const ps = playerStation(state);
  const c = state.rightsContracts?.find((x) => x.id === contractId);
  if (!c?.sport || c.stationId !== ps.id) return { ok: false, message: 'Esse direito esportivo não é da sua emissora.' };
  if (crew === 'estudio' && c.sport.crewRequired) return { ok: false, message: 'O contrato exige equipe própria no local do jogo.' };
  c.sport.crew = crew;
  return { ok: true, message: crew === 'local' ? `${c.label}: equipe completa no estádio.` : `${c.label}: narração do estúdio a partir da próxima transmissão.` };
}

// programas da transmissão: jogo, pré-jogo e pós-jogo (os dois últimos herdam público do jogo, mesmo grupo esporte)
function ensureWindowPrograms(state: GameState, w: SportsWindow): void {
  const f = fixtureByCode(state, w.main);
  if (!f) return;
  const ids = sportsProgramIds(w.station, w.main);
  const comp = competitionOf(state, f.comp);
  const regional = new Set(w.byMarket).size > 1;
  const title = regional ? `${comp?.name ?? 'Futebol'}: jogo da sua praça` : matchTitle(state, f);
  // equipe: narração do estúdio custa 35% menos e perde qualidade; sem o narrador da casa (evento), também perde
  const crew = state.rightsContracts?.find((c) => c.id === w.contract)?.sport?.crew ?? 'local';
  const narratorGone = typeof state.flags.narrador_saiu === 'number' && state.meta.weekIndex - Number(state.flags.narrador_saiu) < 26;
  const quality = 80 - (crew === 'estudio' ? 12 : 0) - (narratorGone ? 6 : 0);
  const cost = Math.round((comp ? matchCost(comp) : 1_000_000) * (crew === 'estudio' ? 0.65 : 1));
  const nat = MARKETS.reduce((s, _, i) => s + (w.byMarket[i] ? matchInterest(state, fixtureByCode(state, w.byMarket[i]) ?? f, i) : 0.6) * MARKET_WEIGHTS[i], 0);
  const make = (id: string, genre: 'futebol' | 'mesa_redonda', ttl: string, role: string | null, slots: number, costPerEp: number) => {
    let p = getProgram(state, id);
    if (p) return p;
    const g = GENRES[genre];
    p = {
      id, stationId: w.station, title: ttl, genre, origin: 'sports', quality: genre === 'futebol' ? quality : 55, appeal: clamp(Math.round(nat * (role ? 40 : 70)), 8, 99),
      profile: { ...g.profile }, rating: 'L', costPerEp, durStd: slots * 15, durMin: slots * 15, durMax: (slots + 3) * 15, fatigue: 0, buzz: genre === 'futebol' ? 40 : 15,
      habitWeeks: 8, habitKey: '', movesRecent: [], status: 'on_air', talentIds: [], commercial: genre === 'futebol' ? 100 : 70,
      episodes: { total: null, aired: 0, planned: null }, isRerun: false, merchLevel: 0, promo: 0, locked: true, leaseWeeklyPerHour: 0, rights: null,
      dev: null, tableMult: SPORTS_PRICE, price30s: 0, premiereWeek: null, createdWeek: state.meta.weekIndex, stats: [],
      totals: { revenue: 0, cost: 0, airings: 0, peakPts: 0 }, tempMods: [],
      flags: { fixture: w.main, fixtures: w.byMarket.join('|'), contract: w.contract, ...(role ? { sportsRole: role } : {}) },
    } as Program;
    state.programs.push(p);
    return p;
  };
  make(ids.match, 'futebol', title, null, f.slots, cost);
  if (f.away) {
    make(ids.pre, 'mesa_redonda', `Pré-jogo: ${title.replace(/^[^:]+: /, '')}`, 'pre', PRE_SLOTS, 40_000);
    make(ids.pos, 'mesa_redonda', `Pós-jogo: ${title.replace(/^[^:]+: /, '')}`, 'pos', POST_SLOTS, 60_000);
  }
}

// transmissões de semanas passadas saem do estado (o boletim já guardou os números)
function pruneOldSportsPrograms(state: GameState): void {
  const week = state.meta.weekIndex;
  state.programs = state.programs.filter((p) => !(p.origin === 'sports' && typeof p.flags.fixture === 'string' && p.createdWeek < week - 1));
}

// ===== o jogo na grade =====
// política para jogo que estoura o horário (evento "prorrogação"): atrasar a programação ou cortar o pós-jogo
export function overtimePolicy(state: GameState): 'atrasar' | 'cortar' {
  const ev = state.events.find((e) => e.templateId === 'esporte_prorrogacao' && e.firedWeek === state.meta.weekIndex);
  const choice = ev ? (ev.chosen ?? ev.defaultOption) : 'atrasar';
  return choice === 'cortar' ? 'cortar' : 'atrasar';
}

export interface SportsDayPlan {
  slots: (string | null)[];
  displaced: string[]; // programas que mudaram de horário por causa do jogo
  overtime: { code: string; extra: number; policy: 'atrasar' | 'cortar' }[];
}

// aplica as transmissões do dia na grade: o jogo entra no horário dele (ao vivo), com pré e pós-jogo; o programa que
// estava ali e os seguintes vão inteiros para depois do jogo; o que passar das 6h sai do dia
export function sportsDayPlan(state: GameState, stationId: string, day: number, slots: (string | null)[]): SportsDayPlan {
  const date = addDays(state.meta.date, day);
  const ws = (state.sports?.windowsWeek === state.meta.weekIndex ? state.sports.windows ?? [] : []).filter((w) => w.station === stationId && w.date === date && !w.skipped).sort((a, b) => a.start - b.start);
  if (!ws.length) return { slots, displaced: [], overtime: [] };
  let cur = slots.slice();
  const displaced = new Set<string>();
  const overtime: SportsDayPlan['overtime'] = [];
  const policy = overtimePolicy(state);
  for (const w of ws) {
    const f = fixtureByCode(state, w.main);
    if (!f) continue;
    const ids = sportsProgramIds(stationId, w.main);
    if (!getProgram(state, ids.match)) continue;
    const pens = f.score && f.score.length >= 4 && f.score[2] >= 0 ? 1 : 0;
    const extra = (f.score?.[4] === 1 ? 2 : 0) + pens;
    const matchLen = f.slots + pens; // f.slots já inclui a prorrogação quando houve
    const hasSide = !!f.away;
    const pre = hasSide && w.start >= PRE_SLOTS ? PRE_SLOTS : 0;
    let post = hasSide ? POST_SLOTS : 0;
    if (extra > 0) {
      overtime.push({ code: f.code, extra, policy });
      if (policy === 'cortar') post = Math.max(0, post - extra);
    }
    const start = w.start - pre;
    const insert: (string | null)[] = [...Array(pre).fill(ids.pre), ...Array(matchLen).fill(ids.match), ...Array(post).fill(ids.pos)];
    // blocos da grade: os que começam antes do jogo e terminam antes dele ficam; o resto anda para depois
    const blocks: { id: string | null; start: number; len: number }[] = [];
    for (let s = 0; s < SLOTS_PER_DAY;) {
      let e = s + 1;
      while (e < SLOTS_PER_DAY && cur[e] === cur[s]) e++;
      blocks.push({ id: cur[s], start: s, len: e - s });
      s = e;
    }
    const next: (string | null)[] = new Array(SLOTS_PER_DAY).fill(null);
    let tail = start + insert.length;
    for (const b of blocks) {
      if (b.start + b.len <= start) {
        for (let k = b.start; k < b.start + b.len; k++) next[k] = b.id;
        continue;
      }
      // programa já no ar quando a transmissão começa:
      // - se ele vai além do fim do jogo (ex.: dominical de 5 horas), é interrompido e continua depois do jogo;
      // - se já passou da metade, termina mais cedo (encurtado);
      // - senão vai inteiro para depois do jogo (ex.: a novela das 21h)
      if (b.start < start) {
        const before = start - b.start;
        const windowEnd = start + insert.length;
        if (b.id && b.start + b.len > windowEnd) {
          for (let k = b.start; k < start; k++) next[k] = b.id;
          const rest = b.start + b.len - windowEnd;
          for (let k = tail; k < tail + rest && k < SLOTS_PER_DAY; k++) next[k] = b.id;
          tail += rest;
          displaced.add(b.id);
          continue;
        }
        if (before * 2 >= b.len || !b.id) {
          for (let k = b.start; k < start; k++) next[k] = b.id;
          if (b.id) displaced.add(b.id);
          continue;
        }
      }
      if (!b.id) continue;
      const p = getProgram(state, b.id);
      if (!p || p.genre === 'hgpe' || (p.origin === 'sports' && typeof p.flags.fixture === 'string')) {
        if (p?.origin === 'sports' && b.start >= tail) {
          for (let k = b.start; k < b.start + b.len && k < SLOTS_PER_DAY; k++) next[k] = b.id; // outro jogo mais tarde fica no horário dele
          tail = Math.max(tail, b.start + b.len);
        }
        continue;
      }
      if (b.start < tail) displaced.add(b.id);
      const at = Math.max(b.start, tail);
      for (let k = at; k < at + b.len && k < SLOTS_PER_DAY; k++) next[k] = b.id;
      tail = Math.max(tail, at + b.len);
    }
    for (let k = 0; k < insert.length && start + k < SLOTS_PER_DAY; k++) next[start + k] = insert[k];
    // buraco antes do jogo (o programa que começava ali foi inteiro para depois): o programa anterior se estende
    let k = start - 1;
    while (k >= 0 && next[k] === null) k--;
    if (k >= 0) for (let j = k + 1; j < start; j++) next[j] = next[k];
    cur = next;
  }
  return { slots: cur, displaced: [...displaced], overtime };
}

// para a tela da Grade: os blocos de jogo, pré e pós-jogo do dia e os programas que vão mudar de horário
export function sportsOverlayBlocks(state: GameState, stationId: string, day: number, slots: (string | null)[]): { blocks: { start: number; len: number; title: string; role: 'jogo' | 'pre' | 'pos' }[]; displaced: string[] } {
  const plan = sportsDayPlan(state, stationId, day, slots);
  const blocks: { start: number; len: number; title: string; role: 'jogo' | 'pre' | 'pos' }[] = [];
  for (let s = 0; s < SLOTS_PER_DAY;) {
    const id = plan.slots[s];
    let e = s + 1;
    while (e < SLOTS_PER_DAY && plan.slots[e] === id) e++;
    const p = id ? getProgram(state, id) : null;
    if (p && p.origin === 'sports' && typeof p.flags.fixture === 'string') {
      blocks.push({ start: s, len: e - s, title: p.title, role: p.flags.sportsRole === 'pre' ? 'pre' : p.flags.sportsRole === 'pos' ? 'pos' : 'jogo' });
    }
    s = e;
  }
  return { blocks, displaced: plan.displaced.map((id) => getProgram(state, id)?.title ?? id) };
}

// ===== semana: evento de prorrogação, cotas, fechamento, obrigações =====
// jogo decisivo do jogador nesta semana (pode ir para a prorrogação ou pênaltis): dispara o evento com escolha
export function decisiveBroadcast(state: GameState): { title: string } | null {
  const ps = playerStation(state);
  const w = (state.sports?.windows ?? []).find((x) => x.station === ps.id && !x.skipped && fixtureByCode(state, x.main)?.tie && fixtureByCode(state, x.main)?.leg !== 1);
  const f = w ? fixtureByCode(state, w.main) : null;
  return f ? { title: matchTitle(state, f) } : null;
}

// cotas de patrocínio da temporada para cada direito esportivo do jogador (vendidas pelo comercial na primeira
// transmissão da temporada; empresas genéricas por categoria, sem marcas reais)
const SPONSORS = ['Banco', 'Montadora', 'Cervejaria', 'Operadora de telefonia', 'Rede varejista', 'Plataforma de apostas', 'Fabricante de eletrônicos'];
export function sellSportsCotas(state: GameState): string[] {
  const ps = playerStation(state);
  const notes: string[] = [];
  for (const c of activeSportContracts(state, state.meta.date, addDays(state.meta.date, 6))) {
    if (c.stationId !== ps.id) continue;
    const info = c.sport!;
    if (!(state.sports?.windows ?? []).some((w) => w.contract === c.id)) continue;
    const comp = competitionOf(state, info.comp);
    if (!comp) continue;
    const season = seasonAt(state, comp.id, state.meta.date);
    if (info.cotaSeasons.includes(season)) continue;
    info.cotaSeasons.push(season);
    const end = seasonEndDate(state, comp.id, season) ?? addDays(state.meta.date, 180);
    const weeks = Math.max(4, Math.ceil(sportsDaysBetween(state.meta.date, end) / 7) + 1);
    const n = comp.kind === 'gp' || comp.kind === 'evento' ? 6 : comp.id === 'brasileirao_a' ? 4 : 3;
    const total = COTA_SHARE * expectedBroadcasts(state, c) * matchCost(comp) * (c.endDate && c.endDate < end ? Math.max(0.2, sportsDaysBetween(state.meta.date, c.endDate) / Math.max(1, sportsDaysBetween(state.meta.date, end))) : 1);
    for (let i = 0; i < n; i++) {
      const d: AdDeal = {
        id: nextId(state, 'deal'), advertiser: `${SPONSORS[(i + comp.id.length) % SPONSORS.length]} (cota ${comp.name})`, kind: 'quota', programId: '', contractId: c.id,
        weeklyValue: Math.round(total / n / weeks), guaranteedPoints: 0, startWeek: state.meta.weekIndex, endWeek: state.meta.weekIndex + weeks - 1, status: 'active', shortfallWeeks: 0,
      };
      state.deals.push(d);
    }
    notes.push(`O comercial vendeu ${n} cotas de patrocínio de ${comp.name} ${season} (${weeks} semanas).`);
  }
  return notes;
}

// quantos jogos a emissora transmite numa temporada (para cotas e sublicenciamento)
export function expectedBroadcasts(state: GameState, c: RightsContract): number {
  const info = c.sport!;
  const comp = competitionOf(state, info.comp);
  if (!comp) return 0;
  if (info.gpsLive) return info.gpsLive;
  const f = comp.format;
  const fases = Array.isArray(f.fases) ? (f.fases as { id: string; jogos: number }[]) : [];
  if (comp.kind === 'evento') {
    const r = comp.calendar['2026'] as Record<string, string> | undefined;
    const days = r?.inicio && r.fim ? sportsDaysBetween(r.inicio, r.fim) + 1 : 30;
    return days * info.perRound;
  }
  if (String(f.tipo) === 'pontos_corridos') return Number(f.rodadas ?? 38) * info.perRound;
  const units = fases.reduce((n, p) => n + (p.id === 'grupos' || p.id === 'liga' || p.id === 'primeira' ? Number(p.jogos ?? 6) : Number(p.jogos ?? 1) >= 2 ? 2 : 1), 0);
  return Math.max(1, units) * info.perRound;
}

// fechamento da semana: jogos exibidos, avisos de prorrogação, obrigações das temporadas encerradas
export function closeSportsWeek(state: GameState): { notes: string[]; fines: number } {
  const ss = state.sports;
  const out = { notes: [] as string[], fines: 0 };
  if (!ss?.windows || ss.windowsWeek !== state.meta.weekIndex) return out;
  const ps = playerStation(state);
  for (const w of ss.windows) {
    const c = state.rightsContracts?.find((x) => x.id === w.contract);
    if (c?.sport) {
      c.sport.entitled += 1;
      if (!w.skipped) c.sport.aired += 1;
    }
    if (w.station !== ps.id || w.skipped) continue;
    const f = fixtureByCode(state, w.main);
    if (f?.score && matchEvents(state, f).some((e) => e.kind === 'expulsao')) ss.lastRedCard = matchTitle(state, f); // pode virar caso de imagem
    if (!f?.score || f.score.length < 4) continue;
    const pens = f.score[2] >= 0;
    if (f.score[4] !== 1 && !pens) continue;
    const what = f.score[4] === 1 && pens ? 'prorrogação e pênaltis' : f.score[4] === 1 ? 'prorrogação' : 'pênaltis';
    const policy = overtimePolicy(state);
    out.notes.push(`${matchTitle(state, f)} foi para ${what}. ${policy === 'cortar' ? 'O pós-jogo foi cortado para a grade não atrasar.' : 'A programação seguinte entrou mais tarde.'}`);
  }
  // obrigações: temporadas encerradas com menos de 80% dos jogos escolhidos exibidos geram multa e desgaste
  for (const c of state.rightsContracts ?? []) {
    const info = c.sport;
    if (!info) continue;
    for (const key of Object.keys(ss.done)) {
      const [comp, season] = key.split('|');
      if (comp !== info.comp || info.checkedSeasons.includes(season)) continue;
      info.checkedSeasons.push(season);
      if (info.entitled > 0 && info.aired / info.entitled < MIN_AIRED && c.stationId === ps.id) {
        const fine = 0.02 * info.entitled * matchCost(competitionOf(state, comp)!);
        out.fines += fine;
        out.notes.push(`${c.label}: só ${info.aired} de ${info.entitled} jogos foram ao ar na TV aberta (mínimo de ${Math.round(MIN_AIRED * 100)}%). Multa contratual aplicada.`);
        if (c.holderId) {
          const rel = ((state.holderRel ??= {})[c.holderId] ??= {});
          const cur = rel[c.stationId] ?? { score: 50 };
          rel[c.stationId] = { ...cur, score: clamp(cur.score - 8, 0, 100) };
        }
      }
      info.entitled = 0;
      info.aired = 0;
    }
  }
  return out;
}

// programas que mudaram de horário por causa de jogos nesta semana (perdem hábito no fechamento)
export function weekDisplacements(state: GameState, stationId: string, dayPlans: (string | null)[][]): Map<string, number> {
  const out = new Map<string, number>();
  dayPlans.forEach((slots, day) => {
    for (const id of sportsDayPlan(state, stationId, day, slots).displaced) out.set(id, (out.get(id) ?? 0) + 1);
  });
  return out;
}
export const HABIT_LOSS_PER_DISPLACEMENT = HABIT_LOSS;

// ===== eventos esportivos (seção 8C.7) =====
const BIG_CLUBS = ['flamengo', 'corinthians', 'sao_paulo', 'palmeiras', 'vasco', 'gremio', 'atletico_mg', 'cruzeiro', 'internacional', 'santos'];
const NARRATORS = ['Heitor Camargo', 'Augusto Brandão', 'Rogério Valente', 'Otávio Lemos']; // personagens fictícios
export interface SportsEventCall { templateId: string; vars: Record<string, string | number> }

// o que aconteceu no esporte e afeta o jogador nesta semana vira evento do baralho (no máximo dois por semana)
export function sportsEventCandidates(state: GameState, changes: { fixture: Fixture; change: SportsChange }[]): SportsEventCall[] {
  const ss = state.sports;
  if (!ss || !sportsActive(state)) return [];
  const ps = playerStation(state);
  const week = state.meta.weekIndex;
  const date = state.meta.date;
  const flags = (ss.eventFlags ??= {});
  const fresh = (key: string, cooldown = 9999) => flags[key] === undefined || week - flags[key] >= cooldown;
  const mark = (key: string) => { flags[key] = week; };
  const all = activeSportContracts(state, date, addDays(date, 6));
  const mine = all.filter((c) => c.stationId === ps.id);
  const hasComp = (comp: string) => mine.some((c) => c.sport!.comp === comp);
  const out: (SportsEventCall & { key: string })[] = [];
  const rng = rngFor(state.meta.seed, 'eventos_esporte', week);
  // concorrência aberta (vale para qualquer emissora, até a fictícia)
  for (const comp of state.catalog!.sports!.competitions) {
    for (const t of (comp.calendar.concorrencias as { ciclo: string; abre: string; decide_ate: string }[] | undefined) ?? []) {
      const key = `leilao_${comp.id}_${t.ciclo}`;
      if (t.abre <= date && date <= t.decide_ate && fresh(key)) {
        out.push({ key, templateId: 'esporte_leilao_prazo', vars: { competicao: comp.name, ciclo: t.ciclo, prazo: `${t.decide_ate.slice(8)}/${t.decide_ate.slice(5, 7)}/${t.decide_ate.slice(0, 4)}` } });
      }
    }
  }
  // seleção eliminada (só pesa para quem tem a Copa)
  if (hasComp('copa_do_mundo')) {
    const lost = fixturesBetween(state, addDays(date, -10), addDays(date, -1)).find((f) => f.comp === 'copa_do_mundo' && f.tie && f.score && (f.home === 'selecao:brasil' || f.away === 'selecao:brasil') && koLoser(f) === 'selecao:brasil');
    if (lost && fresh(`selecao_${lost.season}`)) {
      out.push({ key: `selecao_${lost.season}`, templateId: 'esporte_selecao_eliminada', vars: { fase: lost.phaseName.toLowerCase() } });
    }
  }
  // clube de grande torcida rebaixado (para quem tem o Brasileirão)
  if (hasComp('brasileirao_a')) {
    for (const y of [Number(date.slice(0, 4)) - 1, Number(date.slice(0, 4))]) {
      const t = ss.done[`brasileirao_a|${y}`]?.table;
      const fallen = t?.slice(-4).find((x) => BIG_CLUBS.includes(x));
      if (fallen && fresh(`rebaixado_${y}`)) {
        out.push({ key: `rebaixado_${y}`, templateId: 'esporte_clube_rebaixado', vars: { clube: teamName(state, fallen) } });
      }
    }
  }
  // final com time de grande torcida transmitida pelo jogador
  for (const w of (ss.windows ?? []).filter((x) => x.station === ps.id && !x.skipped)) {
    const f = fixtureByCode(state, w.main);
    if (f?.phase === 'final' && [f.home, f.away].some((x) => BIG_CLUBS.includes(x ?? '')) && fresh(`final_${f.code}`)) {
      out.push({ key: `final_${f.code}`, templateId: 'esporte_final_grande_torcida', vars: { jogo: matchTitle(state, f) } });
    }
  }
  // jogo adiado ou com horário mudado pela liga, num jogo que o jogador costuma transmitir (horário de TV aberta)
  const ch = changes
    .filter((x) => mine.some((c) => eligible(state, c, x.fixture, all)) && ((ss.picks[x.fixture.code] ?? []).includes(ps.id) || (ss.windows ?? []).some((w) => w.station === ps.id && w.byMarket.includes(x.fixture.code)) || isTvKickoff(state, { ...x.fixture, date: x.change.fromDate, time: x.change.fromTime })))
    .sort((a, b) => Number(b.change.kind === 'adiado') - Number(a.change.kind === 'adiado'))[0];
  if (ch && fresh(`mudanca_${ch.fixture.code}`)) {
    out.push({ key: `mudanca_${ch.fixture.code}`, templateId: ch.change.kind === 'adiado' ? 'esporte_jogo_adiado' : 'esporte_mudanca_horario', vars: { jogo: matchTitle(state, ch.fixture), motivo: ch.change.reason } });
  }
  // briga em campo num jogo que o jogador transmitiu na semana passada
  if (ss.lastRedCard && fresh('briga', 8) && rng.chance(0.5)) {
    out.push({ key: 'briga', templateId: 'esporte_briga_em_campo', vars: { jogo: ss.lastRedCard } });
  }
  delete ss.lastRedCard;
  // narrador da casa assediado e patrocinador pedindo exclusividade: acontecem de vez em quando com quem tem esporte
  if (mine.length && fresh('narrador', 52) && rng.chance(1 / 40)) {
    out.push({ key: 'narrador', templateId: 'esporte_narrador_assediado', vars: { narrador: NARRATORS[week % NARRATORS.length] } });
  }
  if (state.deals.some((d) => d.contractId && d.status === 'active') && fresh('exclusividade', 39) && rng.chance(1 / 30)) {
    out.push({ key: 'exclusividade', templateId: 'esporte_patrocinador_exclusividade', vars: {} });
  }
  const chosen = out.slice(0, 2);
  for (const c of chosen) mark(c.key);
  return chosen.map(({ templateId, vars }) => ({ templateId, vars }));
}

function koLoser(f: Fixture): string | null {
  if (!f.score || !f.away) return null;
  const [h, a, ph, pa] = f.score;
  if (f.leg === 1) return null;
  if (h !== a) return h > a ? f.away : f.home;
  if (ph !== undefined && ph >= 0) return ph > pa ? f.away : f.home;
  return null;
}

// ===== sublicenciamento (seção 8C.6) =====
export function sublicenseQuote(state: GameState, contractId: string): { ok: boolean; value: number; reason: string } {
  const ps = playerStation(state);
  const c = state.rightsContracts?.find((x) => x.id === contractId);
  if (!c?.sport || c.stationId !== ps.id) return { ok: false, value: 0, reason: 'Esse direito esportivo não é da sua emissora.' };
  if (c.status !== 'ativo') return { ok: false, value: 0, reason: 'O contrato não está ativo.' };
  if (c.sport.sublicensed) return { ok: false, value: 0, reason: 'As janelas de TV paga e streaming já foram revendidas.' };
  if (!c.sport.sublicensable) return { ok: false, value: 0, reason: 'O contrato é só de TV aberta: não há janela para revender.' };
  const comp = competitionOf(state, c.sport.comp);
  if (!comp) return { ok: false, value: 0, reason: 'Competição fora do catálogo.' };
  const years = c.endDate ? Math.max(0.5, sportsDaysBetween(state.meta.date, c.endDate) / 365) : 1;
  const value = Math.round(SUBLICENSE_SHARE * expectedBroadcasts(state, c) * matchCost(comp) * Math.min(5, years));
  return { ok: true, value, reason: '' };
}

export function sublicenseSport(state: GameState, contractId: string): { ok: boolean; message: string; value?: number } {
  const q = sublicenseQuote(state, contractId);
  if (!q.ok) return { ok: false, message: q.reason };
  const c = state.rightsContracts!.find((x) => x.id === contractId)!;
  c.sport!.sublicensed = { date: state.meta.date, value: q.value };
  c.sport!.sublicensable = false;
  c.sport!.platforms = ['tv_aberta'];
  c.terms = { ...c.terms, plataformas: 'tv_aberta' };
  state.weekProgress.eventCash += q.value;
  pushTimeline(state, `Sublicenciou a TV paga e o streaming de ${c.label}.`, 'mercado');
  return { ok: true, message: `Janelas de TV paga e streaming de ${c.label} revendidas. A TV aberta continua com você.`, value: q.value };
}
