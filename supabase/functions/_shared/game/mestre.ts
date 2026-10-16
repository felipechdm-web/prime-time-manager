// Orquestração do Mestre (seções 16 e 19): monta payload, chama o LLM, valida, confere números,
// filtra propostas e aplica o que for permitido. Se algo falhar, usa o texto de fallback.

import { ERAS } from '../engine/catalog/eras.ts';
import { EVENT_BY_ID, ARCS } from '../engine/catalog/events.ts';
import { fireEvent } from '../engine/eventsEngine.ts';
import { money } from '../engine/money.ts';
import { competitorsSummary } from '../engine/narrative.ts';
import { clamp } from '../engine/rng.ts';
import { getProgram, npcById, playerStation, rivals } from '../engine/state.ts';
import type { GameState, Npc } from '../engine/types.ts';
import { formatDateLong } from '../engine/time.ts';
import { ALLOWED_ACTIONS, ALLOWED_PROPOSAL_TAGS, MESTRE_JSON_SCHEMA, MESTRE_V1_FIXED, mestreContext, mestreUserMessage } from './prompt.ts';
import type { HandlerCtx, LLMRequest, LLMResponse, MestreOutput } from './types.ts';
import { callCost } from './llmConfig.ts';
import type { LLMFunction } from './llmConfig.ts';
import { parseJsonLoose } from './validators.ts';

const BACKGROUND_LABEL: Record<string, string> = {
  jornalista: 'ex-jornalista',
  publicitario: 'ex-publicitário',
  produtor_auditorio: 'ex-produtor de auditório',
  herdeiro: 'herdeiro da família dona',
  streaming: 'executivo de streaming',
};

export interface SceneRequest {
  state: GameState;
  gameId: string;
  sceneType: MestreOutput['scene_type'];
  npcIds: string[];
  payload: Record<string, unknown>;
  task: string;
  history: string;
  fallback: () => MestreOutput;
  fn: LLMFunction; // define modelo, esforço e max_tokens (llmConfig.ts) e o nome gravado em llm_calls
}

export interface SceneResult {
  output: MestreOutput;
  usedLLM: boolean;
  applied: string[];
  rejected: string[];
  pendingAction: { type: string; params: Record<string, unknown>; summary: string } | null;
  note?: string;
}

// ===== números =====
function numTokens(text: string): string[] {
  return text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
}

function parseNum(tok: string): number {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(tok)) return parseFloat(tok.replace(/\./g, '').replace(',', '.'));
  return parseFloat(tok.replace(',', '.'));
}

export function allowedNumbers(payload: unknown): number[] {
  const s = JSON.stringify(payload);
  const out = new Set<number>();
  for (const t of numTokens(s)) {
    const n = parseNum(t);
    if (!isFinite(n)) continue;
    out.add(n);
    out.add(Math.round(n * 10) / 10);
    out.add(Math.round(n));
  }
  return [...out];
}

function numberOk(n: number, allowed: number[], isInt: boolean): boolean {
  if (isInt && n >= 0 && n <= 31) return true; // dias, horas, contagens pequenas
  if (isInt && n >= 1950 && n <= 2045) return true; // anos
  for (const a of allowed) {
    const tol = Math.max(isInt ? 0.55 : 0.15, Math.abs(a) * 0.012);
    if (Math.abs(a - n) <= tol) return true;
  }
  return false;
}

function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    cur += text[i];
    if ('.!?'.includes(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
      parts.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function scrubNumbers(text: string, allowed: number[]): { text: string; removed: number } {
  const sentences = splitSentences(text);
  let removed = 0;
  const kept = sentences.filter((s) => {
    for (const t of numTokens(s)) {
      const n = parseNum(t);
      const isInt = !/[.,]/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t);
      if (!numberOk(n, allowed, isInt)) {
        removed++;
        return false;
      }
    }
    return true;
  });
  return { text: kept.join(' ').trim(), removed };
}

// ===== contexto =====
export function contextBlock(state: GameState): string {
  const ps = playerStation(state);
  const era = ERAS[state.meta.era];
  return mestreContext({
    playerName: state.player.name,
    stationName: ps.name,
    background: BACKGROUND_LABEL[state.player.background] ?? state.player.background,
    pronoun: state.player.pronoun,
    universe: state.meta.universe,
    gameDate: formatDateLong(state.meta.date),
    eraName: `${era.name} — ${era.tagline}`,
    eraSummary: era.summary,
    messageFormat: era.messageFormat,
    competitors: competitorsSummary(state),
  });
}

export async function npcSheets(ctx: HandlerCtx, state: GameState, gameId: string, npcIds: string[]): Promise<unknown[]> {
  const sheets: unknown[] = [];
  for (const id of npcIds) {
    const n = npcById(state, id);
    if (!n) continue;
    let memories: { fact: string; weight: number; game_date: string }[] = [];
    try {
      const rows = await ctx.store.select('npc_memories', { game_id: gameId, npc_id: id }, { order: 'id', ascending: false, limit: 40 });
      memories = rows
        .map((r) => ({ fact: String(r.fact), weight: Number(r.weight), game_date: String(r.game_date) }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 15);
    } catch {
      memories = [];
    }
    sheets.push(sheetOf(n, memories));
  }
  return sheets;
}

function sheetOf(n: Npc, memories: { fact: string; weight: number; game_date: string }[]) {
  return {
    id: n.id,
    nome: n.name,
    cargo: n.title,
    idade: n.age,
    estilo_de_fala: n.sheet.speech_style,
    bordoes: n.sheet.catchphrases,
    historico: n.sheet.bio,
    objetivo: n.sheet.main_goal,
    objetivo_secreto: n.sheet.secret_goal,
    linha_vermelha: n.sheet.red_line,
    humor: Math.round(n.mood),
    confianca_no_jogador: Math.round(n.trust),
    lealdade: Math.round(n.loyalty),
    paciencia: Math.round(n.patience),
    pedidos_em_aberto: n.requests.map((r) => r.text),
    memorias: memories,
    talento: n.talent ? { carisma: n.talent.carisma, popularidade: n.talent.popularity, ego: n.talent.ego } : undefined,
  };
}

// ===== propostas =====
const CAPS: Record<string, number> = { npc_mood: 15, npc_trust: 10, program_buzz: 10, reputation_public: 3, reputation_critics: 3 };

export function applyProposals(state: GameState, out: MestreOutput, sceneNpcs: string[]): { applied: string[]; rejected: string[] } {
  const applied: string[] = [];
  const rejected: string[] = [];
  const totals = new Map<string, number>();
  const ps = playerStation(state);
  let spawned = 0;
  for (const p of out.proposals) {
    if (!ALLOWED_PROPOSAL_TAGS.includes(p.tag)) {
      rejected.push(`${p.tag}: tag não permitida`);
      continue;
    }
    const v = Number(p.value);
    if (!isFinite(v)) {
      rejected.push(`${p.tag}: valor inválido`);
      continue;
    }
    const key = `${p.tag}|${p.target}`;
    if (CAPS[p.tag] !== undefined) {
      const prev = totals.get(key) ?? 0;
      const cap = CAPS[p.tag];
      const next = clamp(prev + v, -cap, cap);
      const delta = next - prev;
      totals.set(key, next);
      if (delta === 0) {
        rejected.push(`${p.tag} ${p.target}: limite da cena`);
        continue;
      }
      if (p.tag === 'npc_mood' || p.tag === 'npc_trust') {
        const n = npcById(state, p.target);
        if (!n || (!sceneNpcs.includes(n.id) && n.stationId !== ps.id)) {
          rejected.push(`${p.tag}: personagem ${p.target} fora da cena`);
          continue;
        }
        if (p.tag === 'npc_mood') n.mood = clamp(n.mood + delta, -100, 100);
        else n.trust = clamp(n.trust + delta, 0, 100);
        applied.push(`${n.name}: ${p.tag === 'npc_mood' ? 'humor' : 'confiança'} ${delta > 0 ? '+' : ''}${Math.round(delta)}`);
      } else if (p.tag === 'program_buzz') {
        const prog = getProgram(state, p.target);
        if (!prog || prog.stationId !== ps.id) {
          rejected.push('program_buzz: programa inválido');
          continue;
        }
        prog.buzz = clamp(prog.buzz + delta, 0, 100);
        applied.push(`"${prog.title}": buzz ${delta > 0 ? '+' : ''}${Math.round(delta)}`);
      } else {
        const k = p.tag === 'reputation_public' ? 'public' : 'critics';
        ps.reputation[k] = clamp(ps.reputation[k] + delta, 0, 100);
        applied.push(`Reputação (${k === 'public' ? 'público' : 'crítica'}) ${delta > 0 ? '+' : ''}${Math.round(delta)}`);
      }
      continue;
    }
    if (p.tag === 'flag_set') {
      if (!/^[a-z0-9_]{3,40}$/.test(p.target)) {
        rejected.push('flag_set: chave inválida');
        continue;
      }
      state.flags[`mestre_${p.target}`] = state.meta.weekIndex;
      applied.push(`Anotado: ${p.target.replace(/_/g, ' ')}`);
      continue;
    }
    if (p.tag === 'arc_advance') {
      const def = ARCS.find((a) => a.key === p.target);
      const arc = state.arcs.find((a) => a.key === p.target && !a.done);
      if (!def || !arc) {
        rejected.push('arc_advance: arco inativo');
        continue;
      }
      arc.lastAdvanceWeek = Math.min(arc.lastAdvanceWeek, state.meta.weekIndex - def.weeksPerStage);
      applied.push(`O arco "${def.name}" acelera`);
      continue;
    }
    if (p.tag === 'spawn_event') {
      const t = EVENT_BY_ID[p.target];
      if (!t || spawned >= 1 || t.arc || t.calendar) {
        rejected.push('spawn_event: modelo inválido ou limite atingido');
        continue;
      }
      if (state.events.filter((e) => !e.resolved).length >= 6) {
        rejected.push('spawn_event: caixa de entrada cheia');
        continue;
      }
      const last = state.flags[`evcd_${t.id}`];
      if (typeof last === 'number' && t.cooldownWeeks && state.meta.weekIndex - last < t.cooldownWeeks) {
        rejected.push('spawn_event: em espera (frequência)');
        continue;
      }
      let ctxEv = {};
      if (t.subject === 'program') {
        const prog = state.programs.find((x) => x.stationId === ps.id && x.status === 'on_air');
        if (!prog) {
          rejected.push('spawn_event: sem programa no ar');
          continue;
        }
        ctxEv = { program: prog };
      } else if (t.subject === 'talent') {
        const tal = state.npcs.find((n) => n.role === 'talento' && n.stationId === ps.id && sceneNpcs.includes(n.id)) ?? state.npcs.find((n) => n.role === 'talento' && n.stationId === ps.id);
        if (!tal) {
          rejected.push('spawn_event: sem talento');
          continue;
        }
        ctxEv = { talent: tal };
      }
      const ev = fireEvent(state, t.id, ctxEv);
      if (ev) {
        spawned++;
        applied.push(`Novo assunto na caixa de entrada: ${ev.title}`);
      }
    }
  }
  return { applied, rejected };
}

function sanitizeSpeakers(state: GameState, out: MestreOutput, sceneNpcs: string[]): void {
  for (const n of out.narrative) {
    if (n.speaker === 'narrador') continue;
    if (sceneNpcs.includes(n.speaker) || npcById(state, n.speaker)) continue;
    // aceita nome em vez de id
    const byName = state.npcs.find((x) => x.name.toLowerCase() === n.speaker.toLowerCase());
    n.speaker = byName ? byName.id : 'narrador';
  }
}

export function parseAction(out: MestreOutput): SceneResult['pendingAction'] {
  const a = out.player_action;
  if (!a || !ALLOWED_ACTIONS[a.type]) return null;
  let params: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(a.params_json || '{}');
    if (parsed && typeof parsed === 'object') params = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return { type: a.type, params, summary: a.summary || a.type };
}

export async function budgetOk(ctx: HandlerCtx, state: GameState): Promise<string | null> {
  if (state.llm.weekIndex !== state.meta.weekIndex) state.llm = { weekCalls: 0, weekIndex: state.meta.weekIndex };
  if (state.llm.weekCalls >= ctx.env.weeklyCap) return `limite de ${ctx.env.weeklyCap} chamadas do Mestre nesta semana de jogo`;
  try {
    const since = new Date(ctx.now().getTime() - 3600_000).toISOString();
    const n = await ctx.store.countSince('llm_calls', { user_id: ctx.userId }, 'created_at', since);
    if (n >= ctx.env.hourlyCap) return `limite de ${ctx.env.hourlyCap} chamadas por hora`;
  } catch {
    // sem contagem: segue
  }
  return null;
}

async function logCall(ctx: HandlerCtx, state: GameState, gameId: string, fn: LLMFunction, req: LLMRequest, res: LLMResponse) {
  const model = res.model || req.model;
  const base = {
    game_id: gameId, user_id: ctx.userId, function: fn, model, input_tokens: res.usage.input, output_tokens: res.usage.output,
    cache_read_tokens: res.usage.cacheRead, ok: res.ok, error: res.error ? res.error.slice(0, 300) : null, created_at: ctx.now().toISOString(),
  };
  const v2 = {
    cache_write_tokens: res.usage.cacheWrite, week_index: state.meta.weekIndex, effort: req.effort ?? null, max_tokens: req.maxTokens,
    thinking: req.thinking !== false, truncated: !!res.truncated, cost_usd: callCost(model, res.usage),
  };
  try {
    await ctx.store.insert('llm_calls', [{ ...base, ...v2 }]);
  } catch {
    // banco ainda sem as colunas da v2 (migração não aplicada): grava ao menos o formato da v1
    try {
      await ctx.store.insert('llm_calls', [base]);
    } catch {
      // auditoria não pode derrubar o jogo
    }
  }
}

// Única porta de saída para a Claude API: aplica a configuração da função, conta na cota da semana e registra o custo.
export async function callLLM(
  ctx: HandlerCtx,
  state: GameState,
  gameId: string,
  fn: LLMFunction,
  req: Pick<LLMRequest, 'system' | 'messages' | 'jsonSchema'> & { maxTokens?: number },
): Promise<LLMResponse> {
  const cfg = ctx.env.llm.fns[fn];
  const full: LLMRequest = { ...req, model: cfg.model, effort: cfg.effort, thinking: cfg.thinking, maxTokens: req.maxTokens ?? cfg.maxTokens };
  const res = await ctx.llm!.complete(full);
  state.llm.weekCalls += 1;
  await logCall(ctx, state, gameId, fn, full, res);
  return res;
}

export async function runScene(ctx: HandlerCtx, req: SceneRequest): Promise<SceneResult> {
  const fallbackResult = (note?: string): SceneResult => {
    const output = req.fallback();
    const { applied, rejected } = applyProposals(req.state, output, req.npcIds);
    return { output, usedLLM: false, applied, rejected, pendingAction: null, note };
  };
  if (!ctx.llm) return fallbackResult();
  const budgetMsg = await budgetOk(ctx, req.state);
  if (budgetMsg) return fallbackResult(`Mestre em modo econômico: ${budgetMsg}.`);

  const system = [{ text: MESTRE_V1_FIXED, cache: true }, { text: contextBlock(req.state) }];
  const sheets = await npcSheets(ctx, req.state, req.gameId, req.npcIds);
  const user = mestreUserMessage({ payload: req.payload, npcSheets: sheets, history: req.history, task: req.task });
  const messages: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: user }];
  let output: MestreOutput | null = null;
  let lastError = '';
  let maxTokens = ctx.env.llm.fns[req.fn].maxTokens;
  for (let attempt = 0; attempt < 2 && !output; attempt++) {
    const res = await callLLM(ctx, req.state, req.gameId, req.fn, { system, messages, jsonSchema: MESTRE_JSON_SCHEMA, maxTokens });
    if (!res.ok) {
      lastError = res.error ?? 'falha na chamada';
      if (res.refusal) break;
      // resposta cortada: uma nova tentativa com o dobro do limite (fica registrada em llm_calls.truncated)
      if (res.truncated) maxTokens *= 2;
      continue;
    }
    const parsed = parseJsonLoose(res.text);
    const v = ctx.validateMestre(parsed);
    if (v.ok) {
      output = v.value;
      break;
    }
    lastError = v.error;
    messages.push({ role: 'assistant', content: res.text.slice(0, 4000) });
    messages.push({ role: 'user', content: `Sua resposta anterior não seguiu o esquema (${v.error}). Responda novamente apenas com o objeto JSON completo e válido.` });
  }
  if (!output) return fallbackResult(`Mestre indisponível (${lastError}); usando texto padrão.`);

  // checagem de números (seção 19.3, item 2)
  const allowed = allowedNumbers(req.payload);
  let removed = 0;
  output.narrative = output.narrative
    .map((n) => {
      const r = scrubNumbers(n.text, allowed);
      removed += r.removed;
      return { speaker: n.speaker, text: r.text };
    })
    .filter((n) => n.text.length > 0);
  output.headlines = output.headlines
    .map((h) => scrubNumbers(h, allowed))
    .filter((r) => {
      removed += r.removed;
      return r.text.length > 0 && r.removed === 0;
    })
    .map((r) => r.text)
    .slice(0, 3);
  if (!output.narrative.length) {
    const fb = req.fallback();
    output.narrative = fb.narrative;
  }
  sanitizeSpeakers(req.state, output, req.npcIds);
  output.memory_notes = output.memory_notes.slice(0, 3);
  const { applied, rejected } = applyProposals(req.state, output, req.npcIds);
  // memórias dos personagens
  const mem = output.memory_notes
    .filter((m) => req.npcIds.includes(m.npc_id) || npcById(req.state, m.npc_id))
    .map((m) => ({ game_id: req.gameId, npc_id: m.npc_id, game_date: req.state.meta.date, fact: m.fact.slice(0, 240), weight: clamp(Math.round(m.weight), 1, 5) }));
  if (mem.length) {
    try {
      await ctx.store.insert('npc_memories', mem);
    } catch {
      // ignora
    }
  }
  return {
    output,
    usedLLM: true,
    applied,
    rejected,
    pendingAction: parseAction(output),
    note: removed ? `${removed} trecho(s) com números não confirmados pelo motor foram removidos.` : undefined,
  };
}

// ===== payloads =====
export function basePayload(state: GameState, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const ps = playerStation(state);
  const era = state.meta.era;
  const k = state.kpis;
  const lw = state.finance.lastWeek;
  const rank = [...state.stations].filter((s) => !s.closedWeek).sort((a, b) => (b.history.at(-1)?.prime ?? 0) - (a.history.at(-1)?.prime ?? 0));
  return {
    game_date: state.meta.date,
    player_station: {
      name: ps.name,
      rank_prime: rank.findIndex((s) => s.id === ps.id) + 1,
      pts_24h: ps.history.at(-1)?.pts24 ?? null,
      pts_nobre: ps.history.at(-1)?.prime ?? null,
      share_nobre: ps.history.at(-1)?.primeShare ?? null,
    },
    ranking_nobre: rank.map((s) => ({ emissora: s.name, pontos: s.history.at(-1)?.prime ?? 0 })),
    kpis: k ? {
      nota: k.score,
      capital_politico: k.political,
      faturamento_vs_meta_pct: Math.round(k.revenueVsTarget * 100),
      reputacao: { critica: Math.round(ps.reputation.critics), publico: Math.round(ps.reputation.public), mercado: Math.round(ps.reputation.market) },
    } : null,
    finance: lw ? {
      receita_semana: money(era, lw.revenue),
      custo_semana: money(era, lw.cost),
      ocupacao_pct: Math.round(lw.occupancy * 100),
      verba_semanal: money(era, state.finance.annualBudget / 52),
      meta_anual: money(era, state.finance.annualRevenueTarget),
    } : null,
    metas: state.targets.description,
    pending_events: state.events.filter((e) => !e.resolved).map((e) => ({ id: e.id, titulo: e.title })),
    arcos_ativos: state.arcs.filter((a) => !a.done).map((a) => ({ chave: a.key, etapa: a.stage })),
    rivais: rivals(state).map((s) => s.name),
    ...extra,
  };
}
