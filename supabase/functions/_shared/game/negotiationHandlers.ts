// Funções da Mesa de Negociação (seção 19.7): catalog-browse, negotiation-open, negotiation-turn, negotiation-close
// e tender-resolve (só estrutura). A mesma lógica roda nas Edge Functions e no modo demonstração.
//
// Regra de ouro: a IA conversa, o motor decide. O Haiku (esforço baixo) só (1) lê a fala do jogador e devolve a
// proposta estruturada e (2) dá voz à decisão que o motor já tomou. Preço, aceite e contraproposta vêm do motor.
// O segredo do player (piso, alvo, pesos, paciência, lances rivais) fica em negotiation_secrets e nunca é devolvido.

import { GENRES } from '../engine/catalog/genres.ts';
import { catalogGenre, exclusiveRight, lockLabel, recordDivergence, stationArticle, titleById } from '../engine/catalogWorld.ts';
import { recomputePrice } from '../engine/commercial.ts';
import { money } from '../engine/money.ts';
import {
  acceptCounter, adjustRelation, ARGUMENT_TAGS, BLUFF_DISTRUST_DAYS, contractFromDeal, evaluateRound, holderCatalog, holderOf, normalizeTerms,
  openNegotiation, referencePrice, relationOf, researchDossier, rivalSnipe,
} from '../engine/negotiation.ts';
import type { NegDecision, NegHidden, NegPublic, RivalBid } from '../engine/negotiation.ts';
import { rngFor } from '../engine/rng.ts';
import { makeCtx, programFromCatalog } from '../engine/setup.ts';
import { nextId, playerStation, pushTimeline } from '../engine/state.ts';
import type { BandId, CatalogTitleSnap, GameState, TermSheet } from '../engine/types.ts';
import { addDays } from '../engine/time.ts';
import { diffPatch, flushInbox, loadGame, saveGame, snapshot } from './handlers.ts';
import { allowedNumbers, budgetOk, callLLM, contextBlock, scrubNumbers } from './mestre.ts';
import { decisionLines, LEAVE_LINES, openingLines, PAUSE_LINES, termsText } from './negotiationTexts.ts';
import { MESTRE_V1_FIXED, NEG_INTERPRET_SCHEMA, NEG_VOICE_SCHEMA, negInterpretSystem } from './prompt.ts';
import { syncRights } from './rightsSync.ts';
import { HttpError } from './types.ts';
import type { GameRow, HandlerCtx, MestreNarrative } from './types.ts';
import { parseJsonLoose } from './validators.ts';

export const NEG_AGENDA_COST = 3; // pontos de agenda por reunião de negociação (seção 6.4)
const PAUSE_DAYS = 14; // prazo do "vamos pensar"

type Row = Record<string, unknown>;

function requireCatalog(state: GameState): void {
  if (!state.catalog) throw new HttpError(400, 'Esta partida não tem o catálogo real (Brasil fictício, modo demonstração ou partida criada antes do catálogo). Crie uma partida nova no Brasil real.');
}

// título real já está com outra emissora (no ar ou no acervo dela)?
function heldBy(state: GameState, t: CatalogTitleSnap, exceptStationId: string): string | null {
  const p = state.programs.find((x) => x.catalogTitleId === t.id && x.stationId !== exceptStationId && x.status !== 'ended');
  return p ? state.stations.find((s) => s.id === p.stationId)?.name ?? null : null;
}

function publicDecision(d: NegDecision) {
  return { type: d.type, reasons: d.reasons, counter: d.counter, final: d.final, patiencePct: d.patiencePct, bluff: d.bluff, argumentTags: d.argumentTags };
}

// ===== IA: voz do representante (chamada 2) =====
async function voice(ctx: HandlerCtx, state: GameState, gameId: string, pub: NegPublic, envelope: Record<string, unknown>, history: string, fallback: () => MestreNarrative[]): Promise<{ narrative: MestreNarrative[]; usedLLM: boolean; note?: string }> {
  if (!ctx.llm) return { narrative: fallback(), usedLLM: false };
  const budget = await budgetOk(ctx, state);
  if (budget) return { narrative: fallback(), usedLLM: false, note: `Representante em modo econômico: ${budget}.` };
  const payload = { negociacao: envelope };
  const repSheet = pub.representative ? { id: 'representante', nome: pub.representative.nome, cargo: `${pub.representative.cargo} da ${pub.holderName}`, estilo_de_fala: pub.representative.estilo, ficticio: true } : { id: 'representante', nome: `Representante da ${pub.holderName}`, ficticio: true };
  const user = `## DADOS DO MOTOR (fonte única de verdade)
${JSON.stringify(payload)}

## Personagem presente nesta cena
${JSON.stringify(repSheet)}

## Histórico recente
${history || '(início da reunião)'}

## Tarefa desta chamada
Cena de NEGOCIAÇÃO. Dê voz ao representante (speaker "representante") em 1 a 3 falas curtas, reagindo à fala do jogador e comunicando EXATAMENTE a decisão do motor ("decisao_do_motor"). Se houver contraproposta, apresente os termos dela; para dinheiro, use só o texto de "valor_texto". Não cite nenhum outro número. Não aceite, não recuse e não proponha nada diferente do envelope. Pode usar "narrador" para uma rubrica curta. Responda só com JSON: {"scene_type":"negociacao","narrative":[{"speaker":"representante|narrador","text":"..."}]}.`;
  const res = await callLLM(ctx, state, gameId, 'negociacao', {
    system: [{ text: MESTRE_V1_FIXED, cache: true }, { text: contextBlock(state) }],
    messages: [{ role: 'user', content: user }],
    jsonSchema: NEG_VOICE_SCHEMA,
  });
  if (!res.ok) return { narrative: fallback(), usedLLM: false, note: 'Representante sem a IA nesta rodada; usando falas-modelo.' };
  const parsed = parseJsonLoose(res.text) as { narrative?: unknown } | null;
  const lines = Array.isArray(parsed?.narrative) ? (parsed!.narrative as Row[]).filter((n) => (n.speaker === 'representante' || n.speaker === 'narrador') && typeof n.text === 'string') : [];
  const allowed = allowedNumbers(payload);
  let removed = 0;
  const narrative = lines.map((n) => {
    const r = scrubNumbers(String(n.text), allowed);
    removed += r.removed;
    return { speaker: String(n.speaker), text: r.text };
  }).filter((n) => n.text.length > 0).slice(0, 4);
  if (!narrative.length) return { narrative: fallback(), usedLLM: true, note: 'Fala da IA descartada; usando falas-modelo.' };
  return { narrative, usedLLM: true, note: removed ? `${removed} trecho(s) com números fora do envelope foram removidos.` : undefined };
}

function withMoney(state: GameState, t: TermSheet | null) {
  return t ? { ...t, valor_texto: money(state.meta.era, t.valor) } : null;
}

function patienceText(pct: number): string {
  return pct > 66 ? 'alta' : pct > 33 ? 'média' : 'baixa';
}

function envelopeOf(state: GameState, pub: NegPublic, decision: { type: string; reasons?: string[]; final?: boolean; bluff?: string | null; counter?: TermSheet | null } , playerOffer: TermSheet | null, playerText: string | null) {
  return {
    player: pub.holderName,
    produto: pub.label,
    rodada: pub.round,
    de: pub.maxRounds,
    decisao_do_motor: decision.type,
    motivos: decision.reasons ?? [],
    ultima_oferta: !!decision.final,
    contraproposta: withMoney(state, decision.counter ?? null),
    proposta_do_jogador: withMoney(state, playerOffer),
    fala_do_jogador: playerText ? `<<<${playerText.slice(0, 600)}>>>` : null,
    termos_que_podem_ser_flexibilizados: pub.flexible,
    paciencia_do_representante: patienceText(pub.patiencePct),
    concorrencia_que_pode_citar: pub.rivalMentions,
    blefe_do_jogador: decision.bluff ?? null,
    produto_travado: pub.locked,
  };
}

async function roundHistory(ctx: HandlerCtx, negotiationId: string): Promise<string> {
  try {
    const rows = await ctx.store.select('negotiation_rounds', { negotiation_id: negotiationId }, { order: 'round', ascending: false, limit: 3 });
    return rows.reverse().map((r) => {
      const parts: string[] = [];
      if (r.player_text) parts.push(`JOGADOR: <<<${String(r.player_text).slice(0, 300)}>>>`);
      for (const n of (Array.isArray(r.holder_text) ? r.holder_text : []) as MestreNarrative[]) parts.push(`${n.speaker === 'narrador' ? 'NARRADOR' : 'REPRESENTANTE'}: ${n.text}`);
      return parts.join('\n');
    }).join('\n').split('\n').slice(-6).join('\n');
  } catch {
    return '';
  }
}

// ===== IA: ler a proposta do jogador (chamada 1) =====
interface Interpreted { intent: 'proposta' | 'aceitar' | 'levantar' | 'pensar' | 'conversa'; terms: Partial<TermSheet>; tags: string[]; claim: { station: string | null; valor: number | null } | null }

async function interpret(ctx: HandlerCtx, state: GameState, gameId: string, pub: NegPublic, text: string): Promise<Interpreted | null> {
  if (!ctx.llm || await budgetOk(ctx, state)) return null;
  const res = await callLLM(ctx, state, gameId, 'negociacao-interpretar', {
    system: [{ text: negInterpretSystem(ARGUMENT_TAGS), cache: true }],
    messages: [{ role: 'user', content: JSON.stringify({ produto: pub.label, proposta_na_mesa: pub.onTable, sua_ultima_proposta: pub.playerLast, fala: `<<<${text.slice(0, 800)}>>>` }) }],
    jsonSchema: NEG_INTERPRET_SCHEMA,
  });
  if (!res.ok) return null;
  const o = parseJsonLoose(res.text) as Row | null;
  if (!o || typeof o !== 'object') return null;
  const intent = ['proposta', 'aceitar', 'levantar', 'pensar', 'conversa'].includes(String(o.intent)) ? o.intent as Interpreted['intent'] : 'conversa';
  const offer = (o.offer && typeof o.offer === 'object' ? o.offer : {}) as Row;
  const rawTerms = (offer.terms && typeof offer.terms === 'object' ? offer.terms : {}) as Row;
  const terms: Partial<TermSheet> = {};
  for (const [k, v] of Object.entries(rawTerms)) if (v !== null && v !== undefined) (terms as Row)[k] = v;
  const tags = Array.isArray(offer.argument_tags) ? (offer.argument_tags as unknown[]).map(String).filter((x) => x in ARGUMENT_TAGS) : [];
  const c = (o.claim && typeof o.claim === 'object' ? o.claim : null) as Row | null;
  const claim = c ? { station: typeof c.station === 'string' ? c.station : null, valor: typeof c.valor === 'number' ? c.valor : null } : null;
  return { intent, terms, tags, claim };
}

function stationIdByName(state: GameState, name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const st = state.stations.find((s) => !s.isPlayer && (n.includes(s.name.toLowerCase()) || n.includes(s.short.toLowerCase()) || (s.realKey && n.includes(s.realKey))));
  return st?.id ?? null;
}

// ===== carregar a negociação (com checagem de dono) =====
async function loadNegotiation(ctx: HandlerCtx, negotiationId: string): Promise<{ n: Row; row: GameRow; pub: NegPublic; hidden: NegHidden }> {
  if (!negotiationId) throw new HttpError(400, 'negotiationId obrigatório');
  const [n] = await ctx.store.select('negotiations', { id: negotiationId });
  if (!n) throw new HttpError(404, 'Negociação não encontrada');
  const row = await loadGame(ctx, String(n.game_id));
  const [sec] = await ctx.store.select('negotiation_secrets', { negotiation_id: negotiationId });
  if (!sec) throw new HttpError(500, 'Negociação sem estado interno');
  return { n, row, pub: n.public_state as NegPublic, hidden: sec.hidden_state as NegHidden };
}

async function persistNegotiation(ctx: HandlerCtx, id: string, pub: NegPublic, hidden: NegHidden | null, extra: Row = {}): Promise<void> {
  const now = ctx.now().toISOString();
  await ctx.store.update('negotiations', { id }, { public_state: pub, status: pub.status, round: pub.round, rival_interest: pub.rivalMentions.map((x) => ({ emissora: x })), updated_at: now, ...extra });
  if (hidden) await ctx.store.update('negotiation_secrets', { negotiation_id: id }, { hidden_state: hidden, updated_at: now });
}

// rival que fecha durante o "vamos pensar": leva o título (contrato e programa no acervo dele)
function giveToRival(state: GameState, t: CatalogTitleSnap, bid: RivalBid): void {
  const st = state.stations.find((s) => s.id === bid.stationId);
  if (!st) return;
  const ctx = makeCtx(state, rngFor(state.meta.seed, 'snipe-program', t.id));
  const g = catalogGenre(t);
  const p = programFromCatalog(ctx, st, t, { minutes: t.durationMin ?? GENRES[g].dur[0], status: 'ready' });
  st.ai.reserve.push(p.id);
  state.offers = state.offers.filter((o) => o.catalogTitleId !== t.id);
  state.rightsContracts ??= [];
  state.rightsContracts.push({
    id: nextId(state, 'rc'), stationId: st.id, holderId: t.holderId, productRef: t.id, label: t.titleBr, origin: 'negociacao',
    terms: { valor: bid.offer, exclusividade: 'exclusivo', plataformas: 'tv_aberta' }, startDate: state.meta.date, endDate: addDays(state.meta.date, 730),
    payments: [], obligations: [], status: 'ativo', programId: p.id,
  });
}

// ===== catalog-browse: vitrine do Mercado de Direitos (sem IA) =====
export async function catalogBrowseHandler(ctx: HandlerCtx, body: Record<string, unknown>) {
  const row = await loadGame(ctx, String(body.gameId));
  const state = row.state;
  if (!state.catalog) return { available: false, reason: 'Esta partida não tem o catálogo real. O Mercado de Direitos aparece nas partidas novas no Brasil real, com o catálogo aprovado.' };
  const ps = playerStation(state);
  let open: Row[] = [];
  try {
    open = await ctx.store.select('negotiations', { game_id: row.id });
  } catch {
    open = [];
  }
  const negByProduct = new Map<string, Row>();
  for (const n of open) if (n.status === 'aberta' || n.status === 'pausada') negByProduct.set(String(n.product_ref), n);
  const holders = state.catalog.holders.map((h) => {
    const rel = relationOf(state, h.id, ps.id);
    const titles = holderCatalog(state, h.id).map((t) => {
      const lock = exclusiveRight(state, t, state.meta.date);
      const lockedFor = lock && lock.stationKey !== ps.realKey ? lockLabel({ stationName: state.stations.find((s) => s.realKey === lock.stationKey)?.name ?? lock.stationKey.toUpperCase(), until: lock.until }) : null;
      const neg = negByProduct.get(t.id);
      return {
        id: t.id, titleBr: t.titleBr, kind: t.kind, genre: catalogGenre(t), country: t.country, year: t.year, episodes: t.episodes, durationMin: t.durationMin,
        reference: referencePrice(state, ps.id, t),
        locked: lockedFor ?? (heldBy(state, t, ps.id) ? `com a ${heldBy(state, t, ps.id)}` : null),
        owned: state.programs.some((p) => p.stationId === ps.id && p.catalogTitleId === t.id),
        negotiation: neg ? { id: String(neg.id), status: String(neg.status) } : null,
        brStations: t.brStations,
      };
    });
    return {
      id: h.id, name: h.name, category: h.category ?? null, representative: h.representative ?? null,
      relation: rel.score, distrust: !!rel.distrustUntil && rel.distrustUntil >= state.meta.date, titles,
    };
  }).filter((h) => h.titles.length);
  const t = body.titleId ? titleById(state, String(body.titleId)) : undefined;
  const band = typeof body.band === 'string' ? body.band as BandId : undefined;
  return { available: true, agendaPoints: state.agenda.points, cost: NEG_AGENDA_COST, holders, dossier: t ? researchDossier(state, ps.id, t, band) : null };
}

// ===== negotiation-open =====
export async function negotiationOpenHandler(ctx: HandlerCtx, body: Record<string, unknown>) {
  const row = await loadGame(ctx, String(body.gameId));
  const state = row.state;
  if (state.meta.status !== 'active') throw new HttpError(400, 'A partida está encerrada');
  requireCatalog(state);
  const ps = playerStation(state);
  const t = titleById(state, String(body.titleId ?? ''));
  if (!t) throw new HttpError(404, 'Título não encontrado no catálogo desta partida');
  if (!t.holderId || !holderOf(state, t.holderId)) throw new HttpError(400, 'Este título não tem um player de direitos cadastrado');
  if (state.programs.some((p) => p.stationId === ps.id && p.catalogTitleId === t.id)) throw new HttpError(400, `"${t.titleBr}" já está no seu acervo`);
  const before = snapshot(state);

  // reunião já aberta ou pausada para este título
  const existing = (await ctx.store.select('negotiations', { game_id: row.id, product_ref: t.id })).find((n) => n.status === 'aberta' || n.status === 'pausada');
  if (existing && existing.status === 'aberta') {
    return { negotiationId: String(existing.id), pub: existing.public_state as NegPublic, narrative: [], resumed: true, agendaPoints: state.agenda.points, dossier: researchDossier(state, ps.id, t), patch: {}, version: row.version };
  }
  if (state.agenda.points < NEG_AGENDA_COST) throw new HttpError(400, `Faltam pontos de agenda (a reunião custa ${NEG_AGENDA_COST})`);

  if (existing && existing.status === 'pausada') {
    // voltando do "vamos pensar": um rival pode ter fechado antes
    const id = String(existing.id);
    const [sec] = await ctx.store.select('negotiation_secrets', { negotiation_id: id });
    const hidden = sec.hidden_state as NegHidden;
    const pub = existing.public_state as NegPublic & { pausedOn?: string };
    const days = pub.pausedOn ? Math.max(0, (Date.parse(state.meta.date) - Date.parse(pub.pausedOn)) / 86400000) : 0;
    const sniped = rivalSnipe(state, hidden, Math.floor(days / 7)) ?? (existing.deadline && String(existing.deadline) < state.meta.date && hidden.rivals[0] ? hidden.rivals[0] : null);
    state.agenda.points -= NEG_AGENDA_COST;
    state.agenda.meetings += 1;
    if (sniped) {
      pub.status = 'fracassada';
      giveToRival(state, t, sniped);
      pushTimeline(state, `A ${sniped.stationName} fechou "${t.titleBr}" enquanto você pensava.`, 'mercado');
      const narrative = [{ speaker: 'representante', text: `Sinto muito: enquanto você pensava, fechamos "${t.titleBr}" com a ${sniped.stationName}.` }];
      await saveGame(ctx, row, state);
      await persistNegotiation(ctx, id, pub, null);
      await syncRights(ctx, row.id, state);
      return { negotiationId: id, pub, narrative, sniped: true, agendaPoints: state.agenda.points, patch: diffPatch(before, state), version: row.version };
    }
    pub.status = 'aberta';
    hidden.patience = Math.max(1, hidden.patience - 1); // levantar da mesa e voltar cansa o representante
    pub.patiencePct = Math.round((hidden.patience / hidden.patienceMax) * 100);
    const v = await voice(ctx, state, row.id, pub, envelopeOf(state, pub, { type: 'retomada', counter: pub.onTable }, pub.playerLast, null), await roundHistory(ctx, id), () => [{ speaker: 'representante', text: pub.onTable ? `Voltamos a conversar. Na mesa continua: ${termsText(state.meta.era, pub.onTable)}.` : 'Voltamos a conversar.' }]);
    await saveGame(ctx, row, state);
    await persistNegotiation(ctx, id, pub, hidden, { deadline: null });
    return { negotiationId: id, pub, narrative: v.narrative, usedLLM: v.usedLLM, note: v.note, resumed: true, agendaPoints: state.agenda.points, dossier: researchDossier(state, ps.id, t), patch: diffPatch(before, state), version: row.version };
  }

  // reunião nova
  const negotiationId = ctx.uuid();
  const o = openNegotiation(state, { stationId: ps.id, titleId: t.id, key: negotiationId });
  if ('error' in o) throw new HttpError(400, o.error);
  const { hidden, pub } = o;
  const holderNow = heldBy(state, t, ps.id);
  if (holderNow && pub.kind === 'titulo') {
    // título no ar ou no acervo de um rival: só relacionamento
    pub.kind = 'relacionamento';
    pub.locked = `com a ${holderNow}`;
    pub.onTable = null;
    hidden.rivals = [];
    pub.rivalMentions = [];
  }
  state.agenda.points -= NEG_AGENDA_COST;
  state.agenda.meetings += 1;
  const v = await voice(ctx, state, row.id, pub, envelopeOf(state, pub, { type: pub.kind === 'relacionamento' ? 'produto_travado' : 'abertura', counter: pub.onTable }, null, null), '', () => openingLines(state.meta.era, pub));
  await saveGame(ctx, row, state);
  await ctx.store.insert('negotiations', [{
    id: negotiationId, game_id: row.id, station_id: ps.id, rights_holder_id: t.holderId, product_ref: t.id, kind: pub.kind, status: 'aberta',
    round: 0, max_rounds: pub.maxRounds, public_state: pub, rival_interest: pub.rivalMentions.map((x) => ({ emissora: x })), game_date: state.meta.date,
    created_at: ctx.now().toISOString(), updated_at: ctx.now().toISOString(),
  }]);
  await ctx.store.insert('negotiation_secrets', [{ negotiation_id: negotiationId, hidden_state: hidden, created_at: ctx.now().toISOString(), updated_at: ctx.now().toISOString() }]);
  await ctx.store.insert('negotiation_rounds', [{ negotiation_id: negotiationId, round: 0, holder_counter: pub.onTable, holder_text: v.narrative, engine_decision: { type: 'abertura' }, argument_tags: [], created_at: ctx.now().toISOString() }]);
  return { negotiationId, pub, narrative: v.narrative, usedLLM: v.usedLLM, note: v.note, agendaPoints: state.agenda.points, dossier: researchDossier(state, ps.id, t), patch: diffPatch(before, state), version: row.version };
}

// ===== negotiation-turn =====
export async function negotiationTurnHandler(ctx: HandlerCtx, body: Record<string, unknown>) {
  const id = String(body.negotiationId ?? '');
  const { row, pub, hidden } = await loadNegotiation(ctx, id);
  const state = row.state;
  const before = snapshot(state);
  if (pub.status !== 'aberta') throw new HttpError(400, 'Esta reunião não está aberta');
  const ps = playerStation(state);
  const t = titleById(state, pub.productRef);
  if (!t) throw new HttpError(404, 'Título não encontrado');
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 800) : '';
  let action = ['aceitar', 'levantar', 'pensar', 'proposta'].includes(String(body.action)) ? String(body.action) : 'proposta';
  let notes: string[] = [];

  // 1) a IA lê a fala (se houver texto e IA disponível)
  let interp: Interpreted | null = null;
  if (text && action === 'proposta') {
    interp = await interpret(ctx, state, row.id, pub, text);
    if (!interp && ctx.llm) notes.push('Não consegui ler a sua fala; vale a proposta do formulário.');
    if (!ctx.llm) notes.push('Sem a IA, a proposta vale pelo formulário (o texto fica só no histórico).');
    if (interp?.intent === 'aceitar' && pub.onTable && pub.kind === 'titulo') action = 'aceitar';
    else if (interp?.intent === 'levantar') action = 'levantar';
    else if (interp?.intent === 'pensar') action = 'pensar';
  }

  const now = ctx.now().toISOString();
  const saveRound = async (round: number, offer: TermSheet | null, decision: Row, counter: TermSheet | null, narrative: MestreNarrative[], tags: string[]) => {
    await ctx.store.insert('negotiation_rounds', [{ negotiation_id: id, round, player_text: text || null, player_offer: offer, argument_tags: tags, engine_decision: decision, holder_counter: counter, holder_text: narrative, created_at: now }]);
  };

  if (action === 'levantar') {
    pub.status = 'fracassada';
    adjustRelation(state, pub.holderId, ps.id, -2, 'levantou da mesa');
    await saveGame(ctx, row, state);
    await persistNegotiation(ctx, id, pub, null);
    await saveRound(pub.round, null, { type: 'levantou' }, null, LEAVE_LINES, []);
    await syncRights(ctx, row.id, state);
    return { pub, decision: { type: 'fim', reasons: ['jogador_levantou'] }, narrative: LEAVE_LINES, notes, patch: diffPatch(before, state), version: row.version };
  }
  if (action === 'pensar') {
    if (pub.kind === 'relacionamento') throw new HttpError(400, 'Nesta reunião não há proposta para pensar');
    pub.status = 'pausada';
    (pub as NegPublic & { pausedOn?: string }).pausedOn = state.meta.date;
    const deadline = addDays(state.meta.date, PAUSE_DAYS);
    await persistNegotiation(ctx, id, pub, null, { deadline });
    await saveRound(pub.round, null, { type: 'pausa', prazo: deadline }, pub.onTable, PAUSE_LINES, []);
    return { pub, decision: { type: 'pausa', reasons: ['jogador_pediu_tempo'], deadline }, narrative: PAUSE_LINES, notes, patch: {}, version: row.version };
  }
  if (action === 'aceitar') {
    const acc = acceptCounter(hidden, pub);
    if ('error' in acc) throw new HttpError(400, acc.error);
    const d = { type: 'aceite' as const, reasons: ['jogador_aceitou_a_contraproposta'], counter: null, final: false, patiencePct: acc.pub.patiencePct, bluff: null, relationDelta: 0, argumentTags: [] };
    const v = await voice(ctx, state, row.id, acc.pub, envelopeOf(state, acc.pub, { type: 'aceite', reasons: d.reasons }, acc.terms, text || null), await roundHistory(ctx, id), () => decisionLines(state.meta.era, acc.pub, d));
    await saveGame(ctx, row, state);
    await persistNegotiation(ctx, id, acc.pub, acc.hidden);
    await saveRound(acc.pub.round, acc.terms, publicDecision(d), null, v.narrative, []);
    return { pub: acc.pub, decision: publicDecision(d), narrative: v.narrative, usedLLM: v.usedLLM, notes: v.note ? [...notes, v.note] : notes, patch: diffPatch(before, state), version: row.version };
  }

  // 2) o motor avalia a proposta (formulário + o que a IA leu da fala)
  const formTerms = (body.terms && typeof body.terms === 'object' ? body.terms : {}) as Partial<TermSheet>;
  const base = normalizeTerms(t, { ...(pub.playerLast ?? pub.onTable ?? {}), ...formTerms }, pub.onTable ?? undefined);
  const offer = normalizeTerms(t, { ...base, ...(interp?.terms ?? {}) }, base);
  const formTags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String).filter((x) => x in ARGUMENT_TAGS) : [];
  const tags = [...new Set([...formTags, ...(interp?.tags ?? [])])];
  const claim = interp?.claim ? { stationId: stationIdByName(state, interp.claim.station), valor: interp.claim.valor } : null;
  if (!text && !Object.keys(formTerms).length && !formTags.length) throw new HttpError(400, 'Faça uma proposta (formulário ou fala)');
  const res = evaluateRound(state, ps.id, hidden, pub, { offer, tags, claim });
  const d = res.decision;
  if (d.relationDelta) adjustRelation(state, pub.holderId, ps.id, d.relationDelta, d.bluff === 'descoberto' ? 'blefe descoberto' : 'reunião', d.bluff === 'descoberto' ? addDays(state.meta.date, BLUFF_DISTRUST_DAYS) : undefined);
  if (d.type === 'fim') adjustRelation(state, pub.holderId, ps.id, -1, 'reunião sem acordo');

  // 3) a IA dá voz à decisão
  const v = await voice(ctx, state, row.id, res.pub, envelopeOf(state, res.pub, d, offer, text || null), await roundHistory(ctx, id), () => decisionLines(state.meta.era, res.pub, d));
  await saveGame(ctx, row, state);
  await persistNegotiation(ctx, id, res.pub, res.hidden);
  await saveRound(res.pub.round, offer, publicDecision(d), d.counter, v.narrative, d.argumentTags);
  await syncRights(ctx, row.id, state);
  if (v.note) notes = [...notes, v.note];
  return { pub: res.pub, decision: publicDecision(d), narrative: v.narrative, usedLLM: v.usedLLM || !!interp, interpreted: { terms: offer, tags }, notes, patch: diffPatch(before, state), version: row.version };
}

// ===== negotiation-close: contrato, pagamentos e título no acervo (sem IA) =====
export async function negotiationCloseHandler(ctx: HandlerCtx, body: Record<string, unknown>) {
  const id = String(body.negotiationId ?? '');
  const { row, pub } = await loadNegotiation(ctx, id);
  const state = row.state;
  const before = snapshot(state);
  const done = state.rightsContracts?.find((c) => c.negotiationId === id);
  if (done) return { contract: done, programId: done.programId, message: 'Contrato já assinado.', patch: {}, version: row.version };
  if (pub.status === 'fracassada') return { contract: null, message: 'Reunião encerrada sem acordo.', patch: {}, version: row.version };
  if (pub.status !== 'fechada' || !pub.onTable) throw new HttpError(400, 'Ainda não há acordo para assinar');
  const ps = playerStation(state);
  const t = titleById(state, pub.productRef);
  if (!t) throw new HttpError(404, 'Título não encontrado');
  const terms = pub.onTable;
  const holder = holderOf(state, pub.holderId);

  // título no acervo
  const g = catalogGenre(t);
  const pctx = makeCtx(state, rngFor(state.meta.seed, 'negclose', id));
  const p = programFromCatalog(pctx, ps, t, { minutes: t.durationMin ?? GENRES[g].dur[0], status: 'ready' });
  p.createdWeek = state.meta.weekIndex;
  p.premiereWeek = null;
  p.habitWeeks = 0;
  p.habitKey = '';
  p.isRerun = false;
  if (p.episodes.total) p.episodes = { total: p.episodes.total, aired: 0, planned: p.episodes.total };
  if (p.origin === 'format') {
    // formato licenciado: a produção local leva algumas semanas e segue com custo de produção por programa
    p.status = 'development';
    p.dev = { stage: 1, weeksLeft: 10, totalWeeks: 10, spent: 0 };
  } else {
    // direitos pagos no contrato: exibir não gera custo de direitos por exibição
    p.costPerEp = 0;
    p.rights = { exhibitionsLeft: terms.exibicoes, untilWeek: state.meta.weekIndex + terms.anos * 52 };
  }
  recomputePrice(state, p);

  const contract = contractFromDeal(state, { stationId: ps.id, holderId: pub.holderId, titleId: t.id, label: t.titleBr, terms, negotiationId: id, programId: p.id });
  state.rightsContracts ??= [];
  state.rightsContracts.push(contract);
  state.offers = state.offers.filter((o) => o.catalogTitleId !== t.id); // o título sai do Mercado
  // a 1ª parcela vence na assinatura: entra no custo de aquisições desta semana
  const econ = state.weekProgress.econ[ps.id] ?? [0, 0, 0, 0, 0, 0];
  while (econ.length < 6) econ.push(0);
  for (const pay of contract.payments) if (pay.date <= state.meta.date) { pay.paid = true; econ[5] += pay.amount; }
  state.weekProgress.econ[ps.id] = econ;
  adjustRelation(state, pub.holderId, ps.id, 5, 'contrato assinado');
  if (t.brStations.length && !t.brStations.includes(ps.realKey ?? '')) {
    const where = t.brStations.map((k) => { const nm = state.stations.find((s) => s.realKey === k)?.name ?? k.toUpperCase(); return `${stationArticle(nm).em} ${nm}`; }).join(' e ');
    recordDivergence(state, { date: state.meta.date, productRef: t.id, description: `${ps.name} fechou com a ${holder?.name ?? pub.holderName} por "${t.titleBr}", que no Brasil real passou ${where}.` });
  }
  pushTimeline(state, `Assinou com a ${holder?.name ?? pub.holderName}: "${t.titleBr}" por ${money(state.meta.era, terms.valor)}.`, 'mercado');
  const parcelas = contract.payments.map((x, i) => `${i + 1}ª parcela: ${money(state.meta.era, x.amount)} em ${x.date.split('-').reverse().join('/')}`).join('\n');
  state.pendingInbox.push({
    fromNpc: 'npc_juridico',
    subject: `Contrato assinado: ${t.titleBr}`,
    body: `Contrato com a ${holder?.name ?? pub.holderName} registrado.\n\nTermos: ${termsText(state.meta.era, terms)}.\n\n${parcelas}\n\nObrigação: exibir ${p.origin === 'format' ? 'o programa' : 'o título'} na faixa prometida. Fora dela, há multa e o relacionamento com o player cai.`,
    requiresAction: false, eventId: null, kind: 'mensagem',
  });
  await saveGame(ctx, row, state);
  await flushInbox(ctx, row.id, state);
  await syncRights(ctx, row.id, state);
  return {
    contract, programId: p.id,
    message: p.status === 'development' ? `Contrato assinado. "${t.titleBr}" entra em produção: estreia possível em 10 semanas.` : `Contrato assinado. "${t.titleBr}" já está no acervo, pronto para entrar na grade.`,
    patch: diffPatch(before, state), version: row.version,
  };
}

// ===== tender-resolve: concorrências fechadas (estrutura pronta; produtos esportivos chegam na Fase 6.4) =====
export async function tenderResolveHandler(ctx: HandlerCtx, body: Record<string, unknown>) {
  await loadGame(ctx, String(body.gameId));
  return { available: false, message: 'As concorrências fechadas (direitos esportivos) chegam na Fase 6.4. O motor já sabe resolver lances fechados, mas ainda não há produtos em disputa.' };
}
