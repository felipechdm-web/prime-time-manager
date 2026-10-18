// Concorrências de direitos esportivos (v2, seção 8B.3, item 6): envelope fechado com os lances dos rivais (motor).
// A reunião na Mesa de Negociação pesa os fatores não financeiros (exposição, histórico, projeto de transmissão);
// quem decide é o motor, pela função de pontuação de quem vende (preço, exposição e relacionamento).
//
// O que é segredo (preço mínimo, pesos e lances dos rivais) é calculado só no servidor (TenderHidden) e guardado em
// negotiation_secrets quando há reunião. No estado da partida (que vai para o navegador) fica só a parte pública.

import { MARKETS } from './catalog/markets.ts';
import { recordDivergence } from './catalogWorld.ts';
import { adjustRelation, holderOf, holderStyle, marketRound, relationOf, resolveTender } from './negotiation.ts';
import type { TenderBid } from './negotiation.ts';
import { clamp, rngFor } from './rng.ts';
import { competitionOf } from './sports.ts';
import { expectedBroadcasts, matchCost } from './sportsTv.ts';
import { activeStations, nextId, playerStation, pushTimeline } from './state.ts';
import { addDays } from './time.ts';
import type { GameState, NegStyle, RightsContract, SportContractInfo, Station, TenderOffer, TenderPublic, TenderResult } from './types.ts';

export const TENDER_MEETING_ROUNDS = 4;
const RENEWAL_NOTICE_DAYS = 180; // a renovação abre seis meses antes do fim do contrato
const RENEWAL_CLOSE_DAYS = 60; // e fecha dois meses antes
const RIGHTS_SHARE = 0.75; // parte do custo de um jogo que é direito (o resto é produção, paga por jogo)
const PLAN_TAGS = ['exposicao_nobre', 'audiencia_projetada', 'parceria_longa', 'pacote_volume'];
const PLAN_STEP = 0.03;
const PLAN_MAX = 0.1;

// interesse de cada perfil de emissora em direitos esportivos (a hegemônica e a desafiante disputam mais)
const ARCH_INTEREST: Record<string, number> = {
  hegemonica: 1.1, desafiante: 0.95, popular_auditorio: 0.9, jornalistica_esportiva: 0.85, em_crise: 0.5, publica_educativa: 0.15, canal_pago: 0,
};
const SELLER_WEIGHTS: Record<NegStyle, { p: number; e: number; r: number }> = {
  duro: { p: 0.65, e: 0.2, r: 0.15 }, relacional: { p: 0.45, e: 0.3, r: 0.25 }, leiloeiro: { p: 0.7, e: 0.2, r: 0.1 },
};
const RESERVE: Record<NegStyle, number> = { duro: 0.92, relacional: 0.85, leiloeiro: 0.88 };

// quem venceu na vida real (só para registrar a divergência; quem decide na partida é o motor)
// Copa do Brasil 2027–2030: Globo (com Amazon e ESPN), setembro de 2026 — nota do lote 5 do catálogo.
const REAL_WINNERS: Record<string, string> = { 'copa_do_brasil|2027-2030': 'globo' };

export interface TenderRival { stationId: string; name: string; value: number; exposure: number; relation: number }
export interface TenderHidden { key: string; reserve: number; weights: { p: number; e: number; r: number }; rivals: TenderRival[]; patience: number; patienceMax: number; planTags: string[] }

// ===== datas do ciclo =====
function cycleDates(cycle: string): { start: string; end: string; seasons: number } {
  const eu = /^(\d{4})\/\d{2}-(\d{4})\/(\d{2})$/.exec(cycle);
  if (eu) {
    const a = Number(eu[1]);
    const b = Number(eu[2]) + 1;
    return { start: `${a}-07-01`, end: `${b}-06-30`, seasons: b - a };
  }
  const m = /^(\d{4})-(\d{4})?$/.exec(cycle);
  const a = m ? Number(m[1]) : 2027;
  const b = m?.[2] ? Number(m[2]) : a + 3;
  return { start: `${a}-01-01`, end: `${b}-12-31`, seasons: b - a + 1 };
}

// contrato vigente que serve de modelo (quem tem hoje o direito da competição e do pacote)
function templateContract(state: GameState, comp: string, pacote: string | null): RightsContract | null {
  return (state.rightsContracts ?? [])
    .filter((c) => c.sport?.comp === comp && (c.sport.pacote ?? null) === pacote)
    .sort((a, b) => (b.endDate ?? '9999').localeCompare(a.endDate ?? '9999'))[0] ?? null;
}

// ===== abrir concorrências (catálogo) e renovações (contratos perto do fim) =====
export function refreshTenders(state: GameState): string[] {
  const sp = state.catalog?.sports;
  if (!sp || !state.sports) return [];
  state.tenders ??= [];
  const date = state.meta.date;
  const notes: string[] = [];
  const have = (comp: string, pacote: string | null, start: string) => state.tenders!.some((t) => t.comp === comp && t.pacote === pacote && t.startDate >= start);
  const add = (t: Omit<TenderPublic, 'status' | 'playerBid' | 'planBonus' | 'met' | 'reference' | 'interested'>) => {
    if (have(t.comp, t.pacote, t.startDate)) return;
    const pub: TenderPublic = { ...t, status: 'aberta', playerBid: null, planBonus: 0, met: false, reference: 0, interested: [] };
    pub.reference = publicReference(state, pub);
    pub.interested = rumoredBidders(state, pub);
    state.tenders!.push(pub);
    notes.push(`Abriu a ${pub.kind === 'renovacao' ? 'renovação' : 'concorrência'} de ${pub.compName}${pub.pacote ? ` (pacote ${pub.pacote.toUpperCase()})` : ''} ${pub.cycle}: envelopes até ${pub.closes.split('-').reverse().join('/')}.`);
  };
  // concorrências marcadas no catálogo (ex.: Copa do Brasil 2027–2030)
  for (const comp of sp.competitions) {
    for (const c of (comp.calendar.concorrencias as { ciclo: string; vendedor: string; abre: string; decide_ate: string }[] | undefined) ?? []) {
      if (c.abre > date || c.decide_ate < date) continue;
      const d = cycleDates(c.ciclo);
      const seller = holderOf(state, c.vendedor);
      add({ id: `${comp.id}|-|${c.ciclo}`, comp: comp.id, compName: comp.name, pacote: null, cycle: c.ciclo, seller: c.vendedor, sellerName: seller?.name ?? c.vendedor, kind: 'concorrencia', opens: c.abre, closes: c.decide_ate, startDate: d.start, endDate: d.end, seasons: d.seasons, incumbent: templateContract(state, comp.id, null)?.stationId ?? null });
    }
  }
  // renovações: direito esportivo que acaba em até seis meses e ainda não tem sucessor
  for (const c of state.rightsContracts ?? []) {
    if (!c.sport || c.status !== 'ativo' || !c.endDate) continue;
    if (c.endDate > addDays(date, RENEWAL_NOTICE_DAYS) || c.endDate < date) continue;
    const comp = competitionOf(state, c.sport.comp);
    if (!comp || comp.kind === 'evento') continue; // a Copa do Mundo seguinte é outro produto (não está no catálogo)
    const pacote = c.sport.pacote ?? null;
    const nextStart = addDays(c.endDate, 1);
    const y = Number(nextStart.slice(0, 4));
    const european = nextStart.slice(5) === '07-01';
    const cycle = european ? `${y}/${String((y + 1) % 100).padStart(2, '0')}-${y + 3}/${String((y + 4) % 100).padStart(2, '0')}` : `${y}-${y + 3}`;
    const d = cycleDates(cycle);
    const sellerId = c.holderId ?? comp.holderId ?? '';
    const closes = addDays(c.endDate, -RENEWAL_CLOSE_DAYS) > addDays(date, 28) ? addDays(c.endDate, -RENEWAL_CLOSE_DAYS) : addDays(date, 28);
    add({ id: `${comp.id}|${pacote ?? '-'}|${cycle}`, comp: comp.id, compName: comp.name, pacote, cycle, seller: sellerId, sellerName: holderOf(state, sellerId)?.name ?? sellerId, kind: 'renovacao', opens: date, closes, startDate: d.start, endDate: d.end, seasons: d.seasons, incumbent: c.stationId });
  }
  // prazo vencido: os envelopes esperam a abertura (tender-resolve)
  for (const t of state.tenders) if (t.status === 'aberta' && t.closes < date) t.status = 'a_resolver';
  return notes;
}

// ===== valor =====
// valor do direito no ciclo: jogos por temporada × parte de direitos do custo do jogo × temporadas
export function tenderFair(state: GameState, t: TenderPublic): number {
  const comp = competitionOf(state, t.comp);
  if (!comp) return 0;
  const tpl = templateContract(state, t.comp, t.pacote);
  const perSeason = tpl ? expectedBroadcasts(state, tpl) : 30;
  return marketRound(t.seasons * perSeason * RIGHTS_SHARE * matchCost(comp));
}

function publicReference(state: GameState, t: TenderPublic): number {
  const rng = rngFor(state.meta.seed, 'concorrencia_ref', t.id);
  const err = (1 - clamp(state.research.precision / 100, 0, 1)) * 0.25;
  return marketRound(tenderFair(state, t) * (1 + rng.range(-err, err)));
}

function reach(st: Station): number {
  return clamp((st.power + 0.7) / 1.5, 0.15, 1);
}

// exposição oferecida no envelope (0 a 1): jogos na TV aberta, horário, streaming, projeto da reunião e alcance
export function offerExposure(state: GameState, stationId: string, offer: TenderOffer, planBonus = 0): number {
  const st = state.stations.find((s) => s.id === stationId);
  const base = (offer.jogos >= 2 ? 0.75 : 0.6) + (offer.faixa === 'nobre' ? 0.15 : offer.faixa === 'tarde' ? 0.05 : 0) + (offer.streaming ? 0.05 : 0) + clamp(planBonus, 0, PLAN_MAX);
  return Math.round(clamp(base * (st ? 0.55 + 0.45 * reach(st) : 0.7), 0, 1) * 1000) / 1000;
}

function rumoredBidders(state: GameState, t: TenderPublic): string[] {
  return tenderHidden(state, t).rivals.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 3).map((r) => r.name);
}

// ===== segredo de quem vende: mínimo, pesos e lances dos rivais (só no servidor) =====
export function tenderHidden(state: GameState, t: TenderPublic): TenderHidden {
  const rng = rngFor(state.meta.seed, 'concorrencia', t.id);
  const style = holderStyle(holderOf(state, t.seller));
  const fair = tenderFair(state, t);
  const rivals: TenderRival[] = [];
  const ps = playerStation(state);
  for (const st of activeStations(state)) {
    if (st.id === ps.id || st.kind !== 'open') continue;
    let interest = (ARCH_INTEREST[st.archetype] ?? 0.6) * rng.normal(1, 0.18);
    if (st.id === t.incumbent) interest += 0.08; // quem já tem o direito quer renovar
    if (interest < 0.7) continue;
    const cash = clamp(0.6 + st.cash / Math.max(1, fair * 2), 0.6, 1.1);
    rivals.push({
      stationId: st.id, name: st.name,
      value: marketRound(fair * interest * rng.range(0.85, 1.15) * cash),
      exposure: Math.round(clamp(reach(st) * rng.range(0.7, 0.95), 0, 1) * 1000) / 1000,
      relation: relationOf(state, t.seller, st.id).score,
    });
  }
  return { key: t.id, reserve: marketRound(fair * RESERVE[style]), weights: SELLER_WEIGHTS[style], rivals, patience: TENDER_MEETING_ROUNDS, patienceMax: TENDER_MEETING_ROUNDS, planTags: [] };
}

// ===== reunião na Mesa de Negociação (fatores não financeiros) =====
export interface TenderMeetingPub {
  kind: 'concorrencia';
  tenderId: string;
  holderId: string;
  holderName: string;
  representative: { nome: string; cargo: string; estilo: string } | null;
  label: string;
  round: number;
  maxRounds: number;
  patiencePct: number;
  feedback: string[];
  planBonus: number;
  status: 'aberta' | 'fechada' | 'fracassada';
}

export function openTenderMeeting(state: GameState, tenderId: string): { hidden: TenderHidden; pub: TenderMeetingPub } | { error: string } {
  const t = state.tenders?.find((x) => x.id === tenderId);
  if (!t) return { error: 'Concorrência não encontrada.' };
  if (t.status !== 'aberta') return { error: 'O prazo de envelopes desta concorrência já fechou.' };
  if (t.playerBid) return { error: 'Seu envelope já foi entregue. Agora é esperar a abertura.' };
  const ps = playerStation(state);
  const h = holderOf(state, t.seller);
  if (!t.met) {
    adjustRelation(state, t.seller, ps.id, 2, 'reunião da concorrência');
    t.met = true;
  }
  const hidden = tenderHidden(state, t);
  hidden.planTags = [];
  return {
    hidden,
    pub: {
      kind: 'concorrencia', tenderId: t.id, holderId: t.seller, holderName: t.sellerName, representative: h?.representative ?? null,
      label: `${t.compName}${t.pacote ? ` (pacote ${t.pacote.toUpperCase()})` : ''} ${t.cycle}`, round: 0, maxRounds: TENDER_MEETING_ROUNDS, patiencePct: 100,
      feedback: [], planBonus: t.planBonus, status: 'aberta',
    },
  };
}

export const TENDER_REASONS: Record<string, string> = {
  valor_abaixo_do_minimo: 'o valor está abaixo do que a organizadora aceita',
  mercado_paga_mais: 'há propostas mais altas no mercado',
  valor_competitivo: 'o valor está competitivo',
  projeto_forte: 'o projeto de transmissão impressiona (jogos, horário e alcance)',
  exposicao_fraca: 'a exposição oferecida é pouca para a organizadora',
  projeto_valorizado: 'o projeto apresentado na reunião conta pontos',
  relacao_boa: 'o histórico com a emissora ajuda',
  relacao_fraca: 'o histórico com a emissora pesa contra',
  concorrencia_e_fechada: 'em concorrência fechada não adianta citar outras propostas',
  paciencia_esgotada: 'a reunião se esgotou',
};

// cada rodada da reunião: o representante dá retorno qualitativo sobre o projeto (nunca revela números)
export function evaluatePitch(state: GameState, t: TenderPublic, hiddenIn: TenderHidden, pubIn: TenderMeetingPub, input: { offer: TenderOffer; tags: string[] }): { hidden: TenderHidden; pub: TenderMeetingPub; reasons: string[]; ended: boolean } {
  const hidden: TenderHidden = { ...hiddenIn, planTags: [...hiddenIn.planTags] };
  const pub: TenderMeetingPub = { ...pubIn, round: pubIn.round + 1 };
  const ps = playerStation(state);
  const reasons: string[] = [];
  // projeto de transmissão: cada argumento novo do tipo certo vale um pouco (no máximo +0,1 de exposição)
  let bonus = t.planBonus;
  for (const tag of input.tags) {
    if (PLAN_TAGS.includes(tag) && !hidden.planTags.includes(tag) && bonus < PLAN_MAX) {
      hidden.planTags.push(tag);
      bonus = Math.min(PLAN_MAX, bonus + PLAN_STEP);
      if (!reasons.includes('projeto_valorizado')) reasons.push('projeto_valorizado');
    }
  }
  if (input.tags.includes('oferta_rival')) reasons.push('concorrencia_e_fechada');
  t.planBonus = Math.round(bonus * 1000) / 1000;
  pub.planBonus = t.planBonus;
  const v = input.offer.valor;
  const best = Math.max(0, ...hidden.rivals.map((r) => r.value));
  if (v < hidden.reserve * 0.97) reasons.push('valor_abaixo_do_minimo');
  else if (best > v * 1.05) reasons.push('mercado_paga_mais');
  else reasons.push('valor_competitivo');
  const exp = offerExposure(state, ps.id, input.offer, t.planBonus);
  if (exp >= 0.8) reasons.push('projeto_forte');
  else if (exp < 0.55) reasons.push('exposicao_fraca');
  const rel = relationOf(state, t.seller, ps.id).score;
  if (rel >= 65) reasons.push('relacao_boa');
  else if (rel <= 35) reasons.push('relacao_fraca');
  hidden.patience = Math.max(0, hidden.patience - 1);
  pub.patiencePct = Math.round((hidden.patience / hidden.patienceMax) * 100);
  const ended = hidden.patience <= 0;
  if (ended) {
    reasons.push('paciencia_esgotada');
    pub.status = 'fechada';
  }
  pub.feedback = reasons;
  return { hidden, pub, reasons, ended };
}

// ===== envelope do jogador =====
export function normalizeOffer(raw: Partial<TenderOffer> | null | undefined): TenderOffer {
  return {
    valor: Math.max(0, Math.round(Number(raw?.valor ?? 0))),
    jogos: Number(raw?.jogos) >= 2 ? 2 : 1,
    faixa: raw?.faixa === 'nobre' || raw?.faixa === 'tarde' ? raw.faixa : 'qualquer',
    streaming: !!raw?.streaming,
    parcelas: clamp(Math.round(Number(raw?.parcelas ?? 4)), 1, 4),
  };
}

export function submitTenderBid(state: GameState, tenderId: string, raw: Partial<TenderOffer>): { ok: boolean; message: string } {
  const t = state.tenders?.find((x) => x.id === tenderId);
  if (!t) return { ok: false, message: 'Concorrência não encontrada.' };
  if (t.status !== 'aberta') return { ok: false, message: 'O prazo de envelopes já fechou.' };
  if (t.playerBid) return { ok: false, message: 'Você já entregou o envelope desta concorrência.' };
  const offer = normalizeOffer(raw);
  if (offer.valor <= 0) return { ok: false, message: 'O envelope precisa de um valor.' };
  const ps = playerStation(state);
  t.playerBid = { ...offer, submittedOn: state.meta.date, exposure: offerExposure(state, ps.id, offer, t.planBonus) };
  pushTimeline(state, `Entregou o envelope da concorrência de ${t.compName} ${t.cycle}.`, 'mercado');
  return { ok: true, message: `Envelope entregue. A abertura é depois de ${t.closes.split('-').reverse().join('/')}.` };
}

// ===== abertura dos envelopes (tender-resolve) =====
export function resolveTenderInState(state: GameState, tenderId: string, hidden: TenderHidden): TenderResult | null {
  const t = state.tenders?.find((x) => x.id === tenderId);
  if (!t || t.status === 'encerrada') return t?.result ?? null;
  const ps = playerStation(state);
  const bids: TenderBid[] = hidden.rivals.map((r) => ({ stationId: r.stationId, value: r.value, exposure: r.exposure, relation: relationOf(state, t.seller, r.stationId).score }));
  if (t.playerBid) bids.push({ stationId: ps.id, value: t.playerBid.valor, exposure: offerExposure(state, ps.id, t.playerBid, t.planBonus), relation: relationOf(state, t.seller, ps.id).score });
  const res = resolveTender(bids, hidden.weights, hidden.reserve);
  const name = (id: string) => state.stations.find((s) => s.id === id)?.name ?? id;
  const winner = res.winner;
  const result: TenderResult = {
    winner: winner?.stationId ?? null,
    winnerName: winner ? name(winner.stationId) : '',
    winningValue: winner?.value ?? 0,
    ranking: [
      ...res.ranking.map((r) => ({ stationId: r.stationId, name: name(r.stationId), score: r.score, valid: true })),
      ...bids.filter((b) => !res.ranking.some((r) => r.stationId === b.stationId)).map((b) => ({ stationId: b.stationId, name: name(b.stationId), score: 0, valid: false })),
    ],
    playerValid: t.playerBid ? t.playerBid.valor >= hidden.reserve : null,
    note: winner ? '' : 'Nenhum envelope chegou ao mínimo: a organizadora vai negociar direto depois.',
  };
  t.result = result;
  t.status = 'encerrada';
  if (winner) {
    const contract = contractFromTender(state, t, winner.stationId, winner.stationId === ps.id ? t.playerBid! : null, winner.value);
    state.rightsContracts ??= [];
    state.rightsContracts.push(contract);
    adjustRelation(state, t.seller, winner.stationId, 8, 'venceu a concorrência');
    const real = REAL_WINNERS[`${t.comp}|${t.cycle}`];
    const realName = real ? state.stations.find((s) => s.realKey === real)?.name ?? real : null;
    const winnerKey = state.stations.find((s) => s.id === winner.stationId)?.realKey ?? null;
    if (real && winnerKey !== real) {
      recordDivergence(state, { date: state.meta.date, productRef: t.comp, description: `${result.winnerName} venceu a concorrência de ${t.compName} ${t.cycle}, que no Brasil real ficou com a ${realName}.` });
    }
    pushTimeline(state, `${result.winnerName} venceu a concorrência de ${t.compName} ${t.cycle}.`, 'mercado');
  }
  if (t.playerBid && winner?.stationId !== ps.id) adjustRelation(state, t.seller, ps.id, 1, 'participou da concorrência');
  return result;
}

function contractFromTender(state: GameState, t: TenderPublic, stationId: string, bid: TenderOffer | null, value: number): RightsContract {
  const tpl = templateContract(state, t.comp, t.pacote);
  const comp = competitionOf(state, t.comp);
  const base: SportContractInfo = tpl?.sport ? { ...tpl.sport } : {
    comp: t.comp, pacote: t.pacote, mandantes: null, perRound: 1, choice: 1, regional: false, pracas: (comp?.format.pracas as string[] | undefined) ?? null,
    exclusive: true, includeBrazil: false, gpsLive: null, platforms: ['tv_aberta'], sublicensable: false, sublicensed: null,
    entitled: 0, aired: 0, checkedSeasons: [], cotaSeasons: [],
  };
  const platforms = bid?.streaming ? ['tv_aberta', 'streaming'] : bid ? ['tv_aberta'] : base.platforms;
  const sport: SportContractInfo = {
    ...base, comp: t.comp, pacote: t.pacote, perRound: bid ? bid.jogos : base.perRound, choice: 1, exclusive: true, platforms,
    sublicensable: platforms.some((p) => p !== 'tv_aberta'), sublicensed: null, entitled: 0, aired: 0, checkedSeasons: [], cotaSeasons: [],
    rightsPaid: true, crew: 'local', crewRequired: true,
  };
  const n = bid ? bid.parcelas : 4;
  const each = Math.round(value / n);
  // uma parcela por ano do ciclo, a primeira no início do contrato
  const payments = Array.from({ length: n }, (_, i) => ({ date: addDays(t.startDate, i * 365), amount: i === n - 1 ? value - each * (n - 1) : each, paid: false }));
  return {
    id: nextId(state, 'rc'), stationId, holderId: t.seller, productRef: t.comp,
    label: `${t.compName}${t.pacote ? ` (pacote ${t.pacote.toUpperCase()})` : ''} ${t.cycle}`, origin: 'concorrencia',
    terms: { valor: value, exclusividade: 'exclusivo', plataformas: platforms.length > 1 ? 'tv_aberta_streaming' : 'tv_aberta', escopo: `${sport.perRound} jogo${sport.perRound > 1 ? 's' : ''} por rodada na TV aberta · 1ª escolha${bid?.faixa === 'nobre' ? ' · jogos principais no horário nobre' : ''} · mínimo de 80% dos jogos na TV aberta` },
    startDate: t.startDate, endDate: t.endDate, payments: stationId === playerStation(state).id ? payments : [], obligations: [], status: 'ativo', sport,
  };
}

// praças em que a competição passa (para a tela da concorrência)
export function tenderMarkets(state: GameState, t: TenderPublic): string[] {
  const pracas = competitionOf(state, t.comp)?.format.pracas as string[] | undefined;
  return pracas?.length ? pracas : MARKETS.map((m) => m.code);
}
