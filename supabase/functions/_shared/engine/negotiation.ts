// Mesa de Negociação (v2, seção 8B): o motor decide preço, aceite, recusa e contraproposta; a IA só dá voz.
// Funções puras e determinísticas (a semente da partida + a chave da negociação + a rodada). Nada aqui chama IA.
//
// O que é segredo (piso, alvo, pesos, paciência real, lances dos rivais) fica em NegHidden e só existe no servidor.
// NegPublic é o que pode ir para o navegador e para o Mestre.

import { GENRES, genreAvailable } from './catalog/genres.ts';
import { catalogGenre, exclusiveRight, lockLabel, titleById } from './catalogWorld.ts';
import { cppFor } from './commercial.ts';
import { clamp, rngFor } from './rng.ts';
import type { Rng } from './rng.ts';
import { genreCost } from './setup.ts';
import { nextId, stationById } from './state.ts';
import type {
  BandId, CatalogHolderSnap, CatalogTitleSnap, GameState, HolderRelation, NegStyle, RightsContract, Station, TermSheet,
} from './types.ts';
import { addDays } from './time.ts';

// ===== constantes de negociação (seção 8B.5) =====
export const MAX_ROUNDS = 6;
export const MAX_ARGUMENT_EFFECT = 0.05; // tags de argumento movem o piso no máximo ±5% (seção 8B.4)
export const BLUFF_DISTRUST_DAYS = 730; // blefe descoberto: desconfiança por 2 anos de jogo
export const BLUFF_RELATION_HIT = -20;

const EXPOSURE: Record<BandId, number> = {
  nobre: 1, pre_nobre: 0.85, pos_nobre: 0.8, meio_dia: 0.6, vespertino: 0.5, manha: 0.4, manha_cedo: 0.3, madrugada: 0.1,
};
const BAND_ORDER: BandId[] = ['madrugada', 'manha_cedo', 'manha', 'meio_dia', 'vespertino', 'pre_nobre', 'nobre', 'pos_nobre'];
const PAYMENT_SAFETY: Record<number, number> = { 1: 1, 2: 0.9, 3: 0.75, 4: 0.6 };

// faixas de piso e alvo (múltiplos do valor justo), paciência e velocidade de concessão por estilo
const STYLE: Record<NegStyle, { piso: [number, number]; alvo: [number, number]; patience: number; k: number; maxParcelas: number; rivalFloor: number; bluffDetect: number }> = {
  duro: { piso: [0.92, 1.05], alvo: [1.25, 1.45], patience: 4, k: 1.6, maxParcelas: 2, rivalFloor: 0.98, bluffDetect: 0.6 },
  relacional: { piso: [0.8, 0.92], alvo: [1.1, 1.25], patience: 6, k: 0.8, maxParcelas: 4, rivalFloor: 0.95, bluffDetect: 0.45 },
  leiloeiro: { piso: [0.85, 1.0], alvo: [1.2, 1.4], patience: 5, k: 1.2, maxParcelas: 3, rivalFloor: 1.0, bluffDetect: 0.75 },
};
const CATEGORY_STYLE: Record<string, NegStyle> = {
  novela_latina: 'relacional', novela_turca: 'leiloeiro', asiatico: 'duro', estudio_eua: 'duro', formato: 'relacional',
  produtora_br: 'relacional', infantil: 'leiloeiro', emissora: 'duro',
};
const PRESTIGE: Record<string, number> = {
  estudio_eua: 1.1, formato: 1.1, novela_latina: 1, novela_turca: 1, asiatico: 0.95, produtora_br: 0.9, infantil: 0.9, emissora: 1.05,
};

// tags de argumento que o Mestre pode registrar (seção 16, "argument_tags"): efeito pequeno e condicionado ao perfil
export const ARGUMENT_TAGS: Record<string, string> = {
  parceria_longa: 'propõe uma parceria de longo prazo',
  exposicao_nobre: 'promete exibição no horário nobre',
  pagamento_a_vista: 'oferece pagamento à vista',
  pacote_volume: 'fala em comprar mais títulos do catálogo',
  audiencia_projetada: 'mostra a projeção de audiência da Pesquisa',
  oferta_rival: 'diz que tem proposta melhor de outra emissora',
  ameaca_desistir: 'ameaça levantar da mesa',
  pressao_prazo: 'pressiona por uma resposta rápida',
  elogio: 'elogia o catálogo e a empresa',
};

// ===== tipos da negociação =====
export interface RivalBid { stationId: string; stationName: string; interest: number; offer: number }

export interface NegHidden {
  key: string; // chave da negociação (semente)
  vRef: number; // valor justo nos termos de abertura (para este comprador)
  piso: number; // preço mínimo secreto (múltiplo aplicado a vRef já embutido: em R$)
  alvo: number; // preço-alvo (R$)
  style: NegStyle;
  weights: { p: number; e: number; x: number; r: number; s: number };
  likesExclusive: boolean;
  wantsMultiplatform: boolean;
  patience: number;
  patienceMax: number;
  argAdj: number; // efeito acumulado das tags no piso, sempre entre -5% e +5%
  argTagsUsed: string[];
  rivals: RivalBid[];
  bluffCaught: boolean;
  neutral: { E: number; X: number; S: number }; // termos "neutros" do player (os da abertura)
}

export interface NegPublic {
  holderId: string;
  holderName: string;
  representative: { nome: string; cargo: string; estilo: string } | null;
  productRef: string;
  label: string;
  kind: 'titulo' | 'relacionamento';
  round: number;
  maxRounds: number;
  patiencePct: number; // barra de paciência (0 a 100)
  onTable: TermSheet | null; // última proposta do player (contraproposta) que está na mesa
  playerLast: TermSheet | null;
  flexible: (keyof TermSheet)[]; // termos que o player pode flexibilizar (sem revelar números)
  reference: number; // preço de referência aproximado (público, com a imprecisão da Pesquisa)
  rivalMentions: string[]; // concorrência que o representante pode citar
  status: 'aberta' | 'pausada' | 'fechada' | 'fracassada';
  locked: string | null; // "exclusivo do SBT até 12/2028": produto travado para este comprador
}

export type DecisionType = 'aceite' | 'contraproposta' | 'recusa' | 'fim';
export interface NegDecision {
  type: DecisionType;
  reasons: string[]; // códigos legíveis: "abaixo_do_minimo", "paciencia_esgotada", "rival_mais_alto"... nunca números secretos
  counter: TermSheet | null;
  final: boolean; // última oferta do player
  patiencePct: number;
  bluff: 'acreditou' | 'desconfiou' | 'descoberto' | null;
  relationDelta: number; // efeito no relacionamento a aplicar no fechamento da rodada
  argumentTags: string[]; // tags que valeram nesta rodada
}

export interface RoundInput {
  offer: TermSheet;
  tags?: string[];
  claim?: { stationId?: string | null; valor?: number | null } | null; // detalhes do "tenho proposta melhor"
}

// ===== utilidades =====
export function holderOf(state: GameState, holderId: string | null | undefined): CatalogHolderSnap | null {
  if (!holderId) return null;
  return state.catalog?.holders.find((h) => h.id === holderId) ?? null;
}

export function holderStyle(h: CatalogHolderSnap | null): NegStyle {
  return h?.style ?? CATEGORY_STYLE[h?.category ?? ''] ?? 'relacional';
}

export function relationOf(state: GameState, holderId: string, stationId: string): HolderRelation {
  return state.holderRel?.[holderId]?.[stationId] ?? { score: 50 };
}

export function adjustRelation(state: GameState, holderId: string, stationId: string, delta: number, reason: string, distrustUntil?: string | null): HolderRelation {
  state.holderRel ??= {};
  state.holderRel[holderId] ??= {};
  const cur = state.holderRel[holderId][stationId] ?? { score: 50 };
  const next: HolderRelation = {
    score: Math.round(clamp(cur.score + delta, 0, 100)),
    distrustUntil: distrustUntil ?? cur.distrustUntil ?? null,
    history: [...(cur.history ?? []), { date: state.meta.date, delta: Math.round(delta), reason }].slice(-20),
  };
  state.holderRel[holderId][stationId] = next;
  return next;
}

function distrusts(state: GameState, rel: HolderRelation): boolean {
  return !!rel.distrustUntil && rel.distrustUntil >= state.meta.date;
}

// arredonda para valores "de mercado" (2 algarismos significativos, para cima)
export function marketRound(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.ceil(v / mag) * mag;
}

function bestBand(t: CatalogTitleSnap): BandId {
  const g = GENRES[catalogGenre(t)];
  let best = 0;
  for (let i = 1; i < 8; i++) if (g.fit[i] > g.fit[best]) best = i;
  return BAND_ORDER[best];
}

function isFormat(t: CatalogTitleSnap): boolean {
  return t.kind === 'formato' || t.kind === 'reality';
}

function defaultExhibitions(t: CatalogTitleSnap): number {
  if (t.kind === 'filme') return t.attrs.exibicoes_por_titulo ?? 3;
  if (t.kind === 'pacote_filmes') return (t.episodes ?? 10) * (t.attrs.exibicoes_por_titulo ?? 3);
  if (isFormat(t)) return t.episodes ?? 20;
  return (t.episodes ?? 60) * 2;
}

// termos de abertura: o que o player costuma vender para esse tipo de produto
export function defaultTerms(t: CatalogTitleSnap): TermSheet {
  return {
    valor: 0,
    parcelas: 2,
    anos: isFormat(t) ? 1 : 2,
    exibicoes: defaultExhibitions(t),
    exclusividade: 'exclusivo',
    plataformas: 'tv_aberta',
    faixa: bestBand(t),
    preferencia_renovacao: false,
  };
}

export function normalizeTerms(t: CatalogTitleSnap, raw: Partial<TermSheet> | null | undefined, base?: TermSheet): TermSheet {
  const d = base ?? defaultTerms(t);
  const r = raw ?? {};
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  return {
    valor: Math.max(0, Math.round(num(r.valor, d.valor))),
    parcelas: clamp(Math.round(num(r.parcelas, d.parcelas)), 1, 4),
    anos: clamp(Math.round(num(r.anos, d.anos)), 1, 5),
    exibicoes: clamp(Math.round(num(r.exibicoes, d.exibicoes)), 1, Math.max(1, d.exibicoes * 3)),
    exclusividade: r.exclusividade === 'compartilhado' ? 'compartilhado' : r.exclusividade === 'exclusivo' ? 'exclusivo' : d.exclusividade,
    plataformas: r.plataformas === 'tv_aberta_streaming' ? 'tv_aberta_streaming' : r.plataformas === 'tv_aberta' ? 'tv_aberta' : d.plataformas,
    faixa: r.faixa && r.faixa in EXPOSURE ? r.faixa : d.faixa,
    preferencia_renovacao: typeof r.preferencia_renovacao === 'boolean' ? r.preferencia_renovacao : d.preferencia_renovacao,
  };
}

// pontos esperados da emissora na faixa: histórico recente ou estimativa pela força da emissora
function bandPoints(st: Station, band: BandId): number {
  const h = st.ai.bandHistory[`pts_${band}`];
  if (h && h.length) return h[h.length - 1];
  const w: Record<BandId, number> = { madrugada: 0.3, manha_cedo: 0.8, manha: 1, meio_dia: 1.6, vespertino: 1.2, pre_nobre: 2, nobre: 3, pos_nobre: 2 };
  return clamp(w[band] * (1 + st.power * 1.6), 0.15, 25);
}

// ===== valor justo (seção 8B.4): audiência projetada × preço do ponto na faixa + cotas + escassez + prestígio =====
export function fairValue(state: GameState, stationId: string, t: CatalogTitleSnap, termsIn?: Partial<TermSheet>): number {
  const st = stationById(state, stationId);
  if (!st) return 0;
  const terms = normalizeTerms(t, termsIn);
  const g = catalogGenre(t);
  const dur = t.durationMin ?? GENRES[g].dur[0];
  const hours = Math.max(0.25, dur / 60);
  const appeal = t.attrs.appeal ?? 60;
  const quality = t.attrs.quality ?? 60;
  const pts = bandPoints(st, terms.faixa) * (0.6 + (appeal / 100) * 0.6);
  // 12 min de intervalo por hora (24 inserções de 30s), ocupação ~70% e desconto ~30%
  const adPerAiring = cppFor(state, terms.faixa) * pts * 24 * hours * 0.49;
  const quotaBoost = 1 + GENRES[g].commercial / 400; // potencial de cotas de patrocínio
  const revenue = adPerAiring * terms.exibicoes * quotaBoost;
  const share = isFormat(t) ? 0.18 : 0.3; // fatia da receita que remunera o direito
  // âncora no custo de produção do gênero, para o valor não fugir da economia do jogo
  const costBased = genreCost(state.meta.era, g, quality, dur, 0.6) * (isFormat(t) ? 0.35 : 0.25) * terms.exibicoes;
  let v = clamp(revenue * share, costBased * 0.5, costBased * 2.5);
  const holder = holderOf(state, t.holderId);
  v *= PRESTIGE[holder?.category ?? ''] ?? 1;
  v *= 1 - clamp(t.attrs.fatigue ?? 0, 0, 100) / 250; // título muito reprisado vale menos
  if (terms.exclusividade === 'compartilhado') v *= 0.7;
  if (terms.plataformas === 'tv_aberta_streaming') v *= 1.15;
  if (terms.preferencia_renovacao) v *= 1.05;
  v *= 1 + 0.04 * (terms.anos - defaultTerms(t).anos);
  if (st.kind === 'pay') v *= 0.4;
  return Math.max(1, Math.round(v));
}

// preço de referência que o jogador vê na vitrine: o valor justo com a imprecisão da Pesquisa
export function referencePrice(state: GameState, stationId: string, t: CatalogTitleSnap): number {
  const rng = rngFor(state.meta.seed, 'refprice', t.id, stationId, state.meta.weekIndex);
  const err = clamp(16 - state.research.precision / 9, 4, 16) / 100;
  return marketRound(fairValue(state, stationId, t) * (1 + rng.range(-err, err)));
}

// dossiê da Pesquisa (seção 8B.3): projeção de audiência e de receita no horário pretendido
export function researchDossier(state: GameState, stationId: string, t: CatalogTitleSnap, band?: BandId) {
  const st = stationById(state, stationId);
  const terms = defaultTerms(t);
  const faixa = band ?? terms.faixa;
  if (!st) return null;
  const g = catalogGenre(t);
  const dur = t.durationMin ?? GENRES[g].dur[0];
  const pts = bandPoints(st, faixa) * (0.6 + ((t.attrs.appeal ?? 60) / 100) * 0.6);
  const perAiring = cppFor(state, faixa) * pts * 24 * Math.max(0.25, dur / 60) * 0.49;
  const err = clamp(16 - state.research.precision / 9, 4, 16) / 100;
  return {
    faixa,
    pontosProjetados: [Math.round(pts * (1 - err) * 10) / 10, Math.round(pts * (1 + err) * 10) / 10] as [number, number],
    receitaPorExibicao: Math.round(perAiring),
    exibicoes: terms.exibicoes,
    receitaPotencial: Math.round(perAiring * terms.exibicoes),
  };
}

// ===== interesse dos rivais (seção 8B.1): arquétipo, gênero, relacionamento e força =====
function rivalAffinity(st: Station, t: CatalogTitleSnap): number {
  const g = catalogGenre(t);
  const a = st.archetype;
  if (g.startsWith('novela')) return a === 'desafiante' || a === 'popular_auditorio' ? 0.45 : a === 'jornalistica_esportiva' ? 0.3 : 0.15;
  if (g === 'filme') return a === 'hegemonica' ? 0.4 : a === 'popular_auditorio' || a === 'desafiante' ? 0.3 : 0.15;
  if (g === 'reality' || g === 'talent_show' || g === 'game_show') return a === 'hegemonica' || a === 'desafiante' ? 0.45 : a === 'popular_auditorio' ? 0.35 : 0.1;
  if (g === 'infantil') return a === 'popular_auditorio' || a === 'publica_educativa' ? 0.4 : 0.05;
  if (g === 'documentario') return a === 'publica_educativa' ? 0.4 : 0.1;
  return a === 'popular_auditorio' || a === 'desafiante' ? 0.3 : 0.15;
}

// o lance do rival parte do valor justo do produto para o comprador (o player compara dinheiro na mesa) e sobe com o
// interesse e a força do rival: até ~50% acima. Emissora grande paga mais, mas não fica impossível competir.
export function rivalInterest(state: GameState, buyerId: string, t: CatalogTitleSnap, rng: Rng): RivalBid[] {
  const out: RivalBid[] = [];
  const buyer = stationById(state, buyerId);
  const base = fairValue(state, buyerId, t);
  for (const st of state.stations) {
    if (st.id === buyerId || st.closedWeek || st.kind === 'pay') continue;
    const rel = t.holderId ? relationOf(state, t.holderId, st.id).score : 50;
    const interest = clamp(rivalAffinity(st, t) + (rel - 50) / 100 + st.power * 0.1 + rng.range(-0.15, 0.15), 0, 1);
    if (interest < 0.45) continue;
    const muscle = clamp(1 + (st.power - (buyer?.power ?? 0)) * 0.15, 0.9, 1.2);
    const offer = Math.round(base * rng.range(0.92, 1.08) * (1 + 0.25 * interest) * muscle * (st.cash < 0 ? 0.85 : 1));
    out.push({ stationId: st.id, stationName: st.name, interest: Math.round(interest * 100) / 100, offer });
  }
  return out.sort((a, b) => b.offer - a.offer);
}

function weightsFor(style: NegStyle, priorities: string[]): NegHidden['weights'] {
  const w = { p: 0.6, e: 0.12, x: 0.08, r: 0.12, s: 0.08 };
  if (style === 'duro') { w.p += 0.08; w.r -= 0.04; }
  if (style === 'relacional') { w.r += 0.08; w.p -= 0.04; }
  if (style === 'leiloeiro') { w.p += 0.1; w.e -= 0.03; w.r -= 0.05; }
  if (priorities.includes('preco')) w.p += 0.08;
  if (priorities.includes('exposicao_tv_aberta')) w.e += 0.08;
  if (priorities.includes('exclusividade')) w.x += 0.06;
  if (priorities.includes('relacionamento') || priorities.includes('parceria_longa')) w.r += 0.06;
  if (priorities.includes('seguranca_pagamento')) w.s += 0.06;
  const sum = w.p + w.e + w.x + w.r + w.s;
  return { p: w.p / sum, e: w.e / sum, x: w.x / sum, r: w.r / sum, s: w.s / sum };
}

function flexibleFor(style: NegStyle): (keyof TermSheet)[] {
  if (style === 'relacional') return ['parcelas', 'anos', 'valor', 'exibicoes'];
  if (style === 'leiloeiro') return ['parcelas', 'exibicoes'];
  return ['parcelas'];
}

function patiencePct(h: NegHidden): number {
  return Math.round(clamp(h.patience / h.patienceMax, 0, 1) * 100);
}

// ===== abertura (negotiation-open): sorteia o segredo e a proposta de abertura do player =====
export interface OpenResult { hidden: NegHidden; pub: NegPublic; opening: TermSheet }

export function openNegotiation(state: GameState, input: { stationId: string; titleId: string; key: string }): OpenResult | { error: string } {
  const t = titleById(state, input.titleId);
  if (!t) return { error: 'Título não encontrado no catálogo desta partida.' };
  if (!t.holderId) return { error: 'Este título não tem um player de direitos cadastrado.' };
  const st = stationById(state, input.stationId);
  if (!st) return { error: 'Emissora inválida.' };
  const holder = holderOf(state, t.holderId);
  const style = holderStyle(holder);
  const S = STYLE[style];
  const rng = rngFor(state.meta.seed, 'neg', input.key);
  const rel = relationOf(state, t.holderId, st.id);
  const terms0 = defaultTerms(t);
  const vRef = fairValue(state, st.id, t, terms0);
  let pisoMult = rng.range(S.piso[0], S.piso[1]) * (1 - ((rel.score - 50) / 50) * 0.04);
  let patience = S.patience;
  if (distrusts(state, rel)) { pisoMult *= 1.08; patience -= 1; }
  const alvoMult = Math.max(pisoMult * 1.08, rng.range(S.alvo[0], S.alvo[1]));
  const priorities = holder?.priorities ?? [];
  const lock = exclusiveRight(state, t, state.meta.date);
  const lockedFor = lock && lock.stationKey !== st.realKey ? lock : null;
  const hidden: NegHidden = {
    key: input.key,
    vRef,
    piso: Math.round(vRef * pisoMult),
    alvo: Math.round(vRef * alvoMult),
    style,
    weights: weightsFor(style, priorities),
    likesExclusive: priorities.includes('exclusividade'),
    wantsMultiplatform: priorities.includes('multiplataforma'),
    patience,
    patienceMax: S.patience,
    argAdj: 0,
    argTagsUsed: [],
    rivals: lockedFor ? [] : rivalInterest(state, st.id, t, rng),
    bluffCaught: false,
    neutral: { E: EXPOSURE[terms0.faixa], X: 0, S: PAYMENT_SAFETY[terms0.parcelas] },
  };
  hidden.neutral.X = exclusivityScore(hidden, terms0);
  const opening: TermSheet = { ...terms0, valor: marketRound(hidden.alvo) };
  const pub: NegPublic = {
    holderId: t.holderId,
    holderName: holder?.name ?? t.holderId,
    representative: holder?.representative ?? null,
    productRef: t.id,
    label: t.titleBr,
    kind: lockedFor ? 'relacionamento' : 'titulo',
    round: 0,
    maxRounds: MAX_ROUNDS,
    patiencePct: patiencePct(hidden),
    onTable: lockedFor ? null : opening,
    playerLast: null,
    flexible: flexibleFor(style),
    reference: referencePrice(state, st.id, t),
    rivalMentions: hidden.rivals.map((r) => r.stationName),
    status: 'aberta',
    locked: lockedFor ? lockLabel({ stationName: state.stations.find((s) => s.realKey === lockedFor.stationKey)?.name ?? lockedFor.stationKey.toUpperCase(), until: lockedFor.until }) : null,
  };
  return { hidden, pub, opening };
}

// ===== utilidade do player (seção 8B.4) =====
function exclusivityScore(h: NegHidden, terms: TermSheet): number {
  if (h.likesExclusive) return terms.exclusividade === 'exclusivo' ? 1 : 0.3;
  return terms.exclusividade === 'exclusivo' ? 0.4 : 1;
}

function exposureScore(h: NegHidden, terms: TermSheet): number {
  let e = EXPOSURE[terms.faixa];
  if (terms.plataformas === 'tv_aberta_streaming') e += h.wantsMultiplatform ? 0.1 : -0.05;
  return e;
}

function penalties(h: NegHidden, terms: TermSheet): number {
  let pen = 0;
  if (h.style === 'leiloeiro' && terms.anos > 3) pen += 0.03 * (terms.anos - 3);
  if (terms.preferencia_renovacao && h.style !== 'relacional') pen += 0.02;
  return pen;
}

export function utility(h: NegHidden, terms: TermSheet, relScore: number, payerSafety = 1): number {
  const w = h.weights;
  return w.p * (terms.valor / h.vRef) + w.e * exposureScore(h, terms) + w.x * exclusivityScore(h, terms)
    + w.r * (relScore / 100) + w.s * PAYMENT_SAFETY[terms.parcelas] * payerSafety - penalties(h, terms);
}

// piso efetivo: piso secreto com o efeito (limitado) dos argumentos
export function effectiveFloor(h: NegHidden): number {
  return h.piso * (1 + clamp(h.argAdj, -MAX_ARGUMENT_EFFECT, MAX_ARGUMENT_EFFECT));
}

// mínimo absoluto: o piso e, se houver, o melhor lance rival (o player não vende abaixo do que um rival paga)
export function hardFloor(h: NegHidden, relScore: number): number {
  const rivalBest = h.rivals.length ? h.rivals[0].offer : 0;
  const rivalFloor = rivalBest * STYLE[h.style].rivalFloor * (1 - (relScore - 50) / 500);
  return Math.max(effectiveFloor(h), rivalFloor);
}

// preço de reserva da rodada: começa no alvo e cede até o mínimo seguindo a curva do estilo.
// O horizonte é a paciência do player: o duro cede devagar, mas chega ao mínimo antes de levantar da mesa.
export function reservationPrice(h: NegHidden, round: number, relScore: number): number {
  const floor = hardFloor(h, relScore);
  const top = Math.max(h.alvo, floor);
  const f = Math.pow(clamp(round / Math.min(MAX_ROUNDS, h.patienceMax), 0, 1), STYLE[h.style].k);
  return top - (top - floor) * f;
}

function reservationUtility(h: NegHidden, round: number, relScore: number, payerSafety: number): number {
  const w = h.weights;
  return w.p * (reservationPrice(h, round, relScore) / h.vRef) + w.e * h.neutral.E + w.x * h.neutral.X
    + w.r * (relScore / 100) + w.s * h.neutral.S * payerSafety;
}

// valor mínimo que torna os demais termos da proposta aceitáveis nesta rodada
function requiredValue(h: NegHidden, terms: TermSheet, round: number, relScore: number, payerSafety: number): number {
  const w = h.weights;
  const others = w.e * exposureScore(h, terms) + w.x * exclusivityScore(h, terms) + w.r * (relScore / 100)
    + w.s * PAYMENT_SAFETY[terms.parcelas] * payerSafety - penalties(h, terms);
  const need = (reservationUtility(h, round, relScore, payerSafety) - others) * h.vRef / w.p;
  return Math.max(hardFloor(h, relScore), need);
}

// ===== argumentos e blefes (seção 8B.5) =====
function applyArguments(state: GameState, h: NegHidden, input: RoundInput, rng: Rng, holder: CatalogHolderSnap | null): { used: string[]; bluff: NegDecision['bluff']; relDelta: number } {
  const pri = holder?.priorities ?? [];
  const used: string[] = [];
  let bluff: NegDecision['bluff'] = null;
  let relDelta = 0;
  const tags = [...new Set((input.tags ?? []).filter((x) => x in ARGUMENT_TAGS))];
  for (const tag of tags) {
    if (h.argTagsUsed.includes(tag) && tag !== 'oferta_rival') continue; // cada argumento vale uma vez por reunião
    let eff = 0;
    switch (tag) {
      case 'parceria_longa': eff = pri.includes('parceria_longa') || pri.includes('relacionamento') || h.style === 'relacional' ? -0.02 : -0.005; break;
      case 'exposicao_nobre': eff = input.offer.faixa === 'nobre' && (pri.includes('exposicao_tv_aberta') || h.weights.e > 0.12) ? -0.02 : 0; break;
      case 'pagamento_a_vista': eff = input.offer.parcelas === 1 ? -0.02 : 0; break;
      case 'pacote_volume': eff = -0.01; break;
      case 'audiencia_projetada': eff = state.research.precision >= 60 ? -0.01 : 0; break;
      case 'ameaca_desistir': eff = h.rivals.length ? 0.02 : -0.01; break;
      case 'pressao_prazo': eff = h.style === 'duro' ? 0.01 : 0; break;
      case 'elogio': eff = 0; break;
      case 'oferta_rival': {
        if (h.argTagsUsed.includes('oferta_rival') && bluff === null) { eff = 0; break; }
        const claim = input.claim ?? {};
        const plausible = h.rivals.some((r) => (!claim.stationId || r.stationId === claim.stationId) && (!claim.valor || claim.valor <= r.offer * 1.15));
        if (plausible) { eff = -0.03; bluff = 'acreditou'; break; }
        if (rng.chance(STYLE[h.style].bluffDetect)) {
          eff = 0.03; bluff = 'descoberto'; h.bluffCaught = true; h.patience -= 2; relDelta += BLUFF_RELATION_HIT;
        } else { eff = -0.01; bluff = 'desconfiou'; }
        break;
      }
      default: break;
    }
    h.argAdj = clamp(h.argAdj + eff, -MAX_ARGUMENT_EFFECT, MAX_ARGUMENT_EFFECT);
    if (!h.argTagsUsed.includes(tag)) h.argTagsUsed.push(tag);
    used.push(tag);
  }
  return { used, bluff, relDelta };
}

// segurança de pagamento do comprador: caixa e histórico de inadimplência
export function payerSafety(state: GameState, stationId: string): number {
  const st = stationById(state, stationId);
  if (!st) return 0.8;
  const late = (state.rightsContracts ?? []).some((c) => c.stationId === stationId && c.status === 'inadimplente');
  return clamp((st.cash >= 0 ? 1 : 0.85) - (late ? 0.2 : 0), 0.5, 1);
}

// ===== rodada (negotiation-turn): o motor avalia e decide =====
export function evaluateRound(state: GameState, stationId: string, hiddenIn: NegHidden, pubIn: NegPublic, input: RoundInput): { hidden: NegHidden; pub: NegPublic; decision: NegDecision } {
  const h: NegHidden = structuredClone(hiddenIn);
  const pub: NegPublic = structuredClone(pubIn);
  const t = titleById(state, pub.productRef);
  if (pub.status !== 'aberta' || !t) {
    return { hidden: h, pub, decision: { type: 'fim', reasons: ['reuniao_encerrada'], counter: null, final: true, patiencePct: patiencePct(h), bluff: null, relationDelta: 0, argumentTags: [] } };
  }
  pub.round += 1;
  const round = pub.round;
  const holder = holderOf(state, pub.holderId);
  const rng = rngFor(state.meta.seed, 'neg', h.key, round);
  const offer = normalizeTerms(t, input.offer, pub.onTable ?? undefined);
  pub.playerLast = offer;
  const args = applyArguments(state, h, { ...input, offer }, rng, holder);
  const rel = clamp(relationOf(state, pub.holderId, stationId).score + args.relDelta, 0, 100);
  const safety = payerSafety(state, stationId);
  const reasons: string[] = [];

  // produto travado por exclusividade de outra emissora: só relacionamento, sem venda
  if (pub.kind === 'relacionamento') {
    h.patience -= 1;
    pub.patiencePct = patiencePct(h);
    if (h.patience <= 0 || round >= MAX_ROUNDS) pub.status = 'fracassada';
    return { hidden: h, pub, decision: { type: 'recusa', reasons: ['produto_com_exclusividade'], counter: null, final: pub.status !== 'aberta', patiencePct: pub.patiencePct, bluff: args.bluff, relationDelta: args.relDelta + 2, argumentTags: args.used } };
  }

  const floor = effectiveFloor(h);
  const minimum = hardFloor(h, rel);
  const u = utility(h, offer, rel, safety);
  const uRes = reservationUtility(h, round, rel, safety);
  // patience: cada rodada cansa; oferta muito baixa cansa mais
  h.patience -= 1;
  if (offer.valor < floor * 0.8) { h.patience -= 1; reasons.push('oferta_muito_baixa'); }
  if (args.bluff === 'descoberto') reasons.push('blefe_descoberto');

  let type: DecisionType;
  let counter: TermSheet | null = null;
  let final = false;
  if (offer.valor >= minimum && u >= uRes) {
    type = 'aceite';
    reasons.push('proposta_aceita');
  } else if (h.patience <= 0) {
    type = 'fim';
    reasons.push('paciencia_esgotada');
  } else {
    if (offer.valor < minimum) reasons.push(h.rivals.length && minimum > floor ? 'rival_mais_alto' : 'abaixo_do_minimo');
    else reasons.push('termos_insuficientes');
    type = offer.valor < floor * 0.7 ? 'recusa' : 'contraproposta';
    const parcelas = Math.min(offer.parcelas, STYLE[h.style].maxParcelas);
    const base: TermSheet = { ...offer, parcelas };
    const need = requiredValue(h, base, round, rel, safety);
    counter = { ...base, valor: marketRound(Math.max(need, minimum)) };
    if (type === 'recusa' && pub.onTable) counter = { ...pub.onTable, valor: Math.max(pub.onTable.valor, counter.valor) };
    final = round >= MAX_ROUNDS - 1 || h.patience <= 1;
    if (final) reasons.push('ultima_oferta');
  }
  pub.patiencePct = patiencePct(h);
  pub.rivalMentions = h.rivals.map((r) => r.stationName);
  if (type === 'aceite') { pub.status = 'fechada'; pub.onTable = offer; }
  else if (type === 'fim' || round >= MAX_ROUNDS) { pub.status = 'fracassada'; if (type !== 'fim') { type = 'fim'; reasons.push('rodadas_esgotadas'); } }
  else pub.onTable = counter;
  return {
    hidden: h, pub,
    decision: { type, reasons, counter: type === 'fim' ? null : counter, final, patiencePct: pub.patiencePct, bluff: args.bluff, relationDelta: args.relDelta, argumentTags: args.used },
  };
}

// o jogador aceita a contraproposta que está na mesa: sempre aceitável, porque foi o próprio player que a fez
export function acceptCounter(hiddenIn: NegHidden, pubIn: NegPublic): { hidden: NegHidden; pub: NegPublic; terms: TermSheet } | { error: string } {
  if (pubIn.status !== 'aberta' || !pubIn.onTable || pubIn.round === 0) return { error: 'Não há contraproposta do player na mesa.' };
  const pub = structuredClone(pubIn);
  pub.status = 'fechada';
  return { hidden: structuredClone(hiddenIn), pub, terms: pub.onTable! };
}

// "vamos pensar": a cada semana de prazo, um rival interessado pode fechar antes (seção 8B.3)
export function rivalSnipe(state: GameState, h: NegHidden, weeksWaited: number): RivalBid | null {
  for (let w = 1; w <= weeksWaited; w++) {
    const rng = rngFor(state.meta.seed, 'snipe', h.key, w);
    for (const r of h.rivals) if (rng.chance(r.interest * 0.35)) return r;
  }
  return null;
}

// ===== contrato (negotiation-close) =====
export function contractFromDeal(state: GameState, input: { stationId: string; holderId: string; titleId: string; label: string; terms: TermSheet; negotiationId?: string | null; programId?: string | null }): RightsContract {
  const start = state.meta.date;
  const end = addDays(start, input.terms.anos * 365);
  const n = clamp(input.terms.parcelas, 1, 4);
  const each = Math.round(input.terms.valor / n);
  const payments = Array.from({ length: n }, (_, i) => ({ date: addDays(start, i * 91), amount: i === n - 1 ? input.terms.valor - each * (n - 1) : each, paid: false }));
  return {
    id: nextId(state, 'rc'),
    stationId: input.stationId,
    holderId: input.holderId,
    productRef: input.titleId,
    label: input.label,
    origin: 'negociacao',
    terms: { ...input.terms },
    startDate: start,
    endDate: end,
    payments,
    obligations: [{ kind: 'faixa', band: input.terms.faixa, from: addDays(start, 28), met: 0, missed: 0 }],
    status: 'ativo',
    programId: input.programId ?? null,
    negotiationId: input.negotiationId ?? null,
  };
}

// ===== contratos da largada e relacionamentos iniciais (seção 8A.6) =====
export function initialContracts(state: GameState): void {
  const cat = state.catalog;
  if (!cat) return;
  const date = state.meta.date;
  state.rightsContracts ??= [];
  for (const r of cat.rights) {
    const st = state.stations.find((s) => s.realKey === r.holderStationKey);
    if (!st) continue;
    const t = cat.titles.find((x) => x.id === r.productRef);
    const holderId = t?.holderId ?? (cat.holders.some((x) => x.id === r.productRef) ? r.productRef : null);
    if (r.kind === 'relacionamento') {
      // ex.: distribuidoras turcas com a Record: relação forte, sem contrato
      for (const hd of cat.holders) if (hd.category === 'novela_turca') adjustRelation(state, hd.id, st.id, 15, 'relação histórica de mercado');
      continue;
    }
    if (!r.exclusive || (r.validFrom && r.validFrom > date) || (r.validTo && r.validTo < date)) continue;
    const holder = holderId ? cat.holders.find((x) => x.id === holderId) : null;
    state.rightsContracts.push({
      id: nextId(state, 'rc'),
      stationId: st.id,
      holderId,
      productRef: r.productRef,
      label: t?.titleBr ?? (holder ? `Catálogo ${holder.name}` : r.productRef),
      origin: 'largada',
      terms: { exclusividade: 'exclusivo', plataformas: 'tv_aberta', escopo: t ? t.titleBr : `catálogo ${holder?.name ?? r.productRef}` },
      startDate: r.validFrom,
      endDate: r.validTo,
      payments: [],
      obligations: [],
      status: 'ativo',
      programId: state.programs.find((p) => p.stationId === st.id && p.catalogTitleId === r.productRef)?.id ?? null,
    });
    // relação de quem tem contrato vigente: sobe uma vez por player (vários contratos não somam além de 75)
    if (holderId && relationOf(state, holderId, st.id).score < 75) adjustRelation(state, holderId, st.id, 75 - relationOf(state, holderId, st.id).score, 'contrato vigente na largada');
  }
}

// ===== semana: parcelas, obrigações e vencimentos (só mexe em contratos existentes; sem sorteio) =====
export function processContracts(state: GameState): { notes: string[]; paid: number; fines: number } {
  const out = { notes: [] as string[], paid: 0, fines: 0 };
  const list = state.rightsContracts;
  if (!list?.length) return out;
  const date = state.meta.date;
  const player = state.stations.find((s) => s.isPlayer);
  for (const c of list) {
    if (c.status !== 'ativo') continue;
    if (c.endDate && c.endDate < date) {
      c.status = 'encerrado';
      if (c.stationId === player?.id) out.notes.push(`Terminou o contrato de "${c.label}".`);
      continue;
    }
    if (c.stationId !== player?.id) continue;
    for (const pay of c.payments) {
      if (pay.paid || pay.date > date) continue;
      pay.paid = true;
      out.paid += pay.amount;
      if (c.holderId) adjustRelation(state, c.holderId, c.stationId, 1, 'parcela paga em dia');
    }
    // obrigação de horário: o programa precisa passar na faixa prometida (quando está no ar)
    for (const ob of c.obligations) {
      if (ob.kind !== 'faixa' || date < ob.from || !c.programId) continue;
      const p = state.programs.find((x) => x.id === c.programId);
      if (!p || p.status !== 'on_air') continue;
      const week = state.schedules[c.stationId] ?? [];
      const inBand = week.some((day) => day.some((b) => b.programId === p.id && bandsOf(b.start, b.len).includes(ob.band)));
      if (inBand) ob.met += 1;
      else {
        ob.missed += 1;
        const fine = Math.round((c.terms.valor ?? 0) * 0.01);
        out.fines += fine;
        if (c.holderId) adjustRelation(state, c.holderId, c.stationId, -2, 'fora do horário prometido');
        out.notes.push(`"${c.label}" está fora do horário prometido ao player (multa).`);
      }
    }
  }
  if (player && (out.paid || out.fines)) {
    const e = state.weekProgress.econ[player.id] ?? [0, 0, 0, 0, 0, 0];
    while (e.length < 6) e.push(0);
    e[5] += out.paid + out.fines;
    state.weekProgress.econ[player.id] = e;
  }
  return out;
}

function bandsOf(start: number, len: number): BandId[] {
  const out = new Set<BandId>();
  for (let s = start; s < start + len; s++) {
    const m = (360 + s * 15) % 1440;
    if (m < 360) out.add('madrugada');
    else if (m < 540) out.add('manha_cedo');
    else if (m < 720) out.add('manha');
    else if (m < 840) out.add('meio_dia');
    else if (m < 1080) out.add('vespertino');
    else if (m < 1200) out.add('pre_nobre');
    else if (m < 1350) out.add('nobre');
    else out.add('pos_nobre');
  }
  return [...out];
}

// ===== concorrência fechada (seção 8B.3, item 6): só a estrutura; produtos esportivos chegam na Fase 6.4 =====
export interface TenderBid { stationId: string; value: number; exposure: number; relation: number }
export function resolveTender(bids: TenderBid[], weights: { p: number; e: number; r: number }, reserve: number): { winner: TenderBid | null; ranking: { stationId: string; score: number }[] } {
  const valid = bids.filter((b) => b.value >= reserve);
  const top = Math.max(1, ...valid.map((b) => b.value));
  const ranking = valid
    .map((b) => ({ stationId: b.stationId, score: Math.round((weights.p * (b.value / top) + weights.e * clamp(b.exposure, 0, 1) + weights.r * clamp(b.relation / 100, 0, 1)) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score || a.stationId.localeCompare(b.stationId));
  return { winner: ranking.length ? valid.find((b) => b.stationId === ranking[0].stationId)! : null, ranking };
}

// produtos do catálogo que o player vende (vitrine do Mercado de Direitos)
export function holderCatalog(state: GameState, holderId: string): CatalogTitleSnap[] {
  const date = state.meta.date;
  return (state.catalog?.titles ?? []).filter((t) => t.holderId === holderId && (!t.availableFrom || t.availableFrom <= date) && (!t.availableTo || t.availableTo >= date)
    && genreAvailable(catalogGenre(t), state.meta.era));
}
