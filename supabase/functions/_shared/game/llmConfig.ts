// Configuração de custo do Mestre por função (seção 17.5 da v2): modelo, esforço, max_tokens e raciocínio.
// Módulo puro: o servidor passa um leitor de variáveis de ambiente; o site importa só a tabela e os preços.

export const HAIKU = 'claude-haiku-5-5';
export const SONNET = 'claude-sonnet-5-5';

export type Effort = 'low' | 'medium' | 'high';

// Nomes iguais aos gravados em llm_calls desde a v1, para o painel comparar as versões.
export type LLMFunction =
  | 'create-game'
  | 'boletim'
  | 'avaliacao'
  | 'evento'
  | 'resolve-event'
  | 'reuniao'
  | 'bia'
  | 'live-mode'
  | 'interpret-free-action'
  | 'campaign-summary'
  | 'negociacao'
  | 'negociacao-interpretar';

export interface FnDefault {
  label: string;
  maxTokens: number;
  premium?: boolean; // usa o modelo premium quando LLM_PREMIUM=on
}

// Tabela da seção 17.5 + funções que ela não lista (entrevista, Bia, desfecho e resumo)
export const LLM_FUNCTIONS: Record<LLMFunction, FnDefault> = {
  'create-game': { label: 'Entrevista inicial', maxTokens: 700 },
  boletim: { label: 'Boletim semanal', maxTokens: 1200 },
  avaliacao: { label: 'Avaliação com a presidência', maxTokens: 1500, premium: true },
  evento: { label: 'Evento com escolha', maxTokens: 700 },
  'resolve-event': { label: 'Desfecho de evento', maxTokens: 400 }, // na v2, só eventos graves
  reuniao: { label: 'Reunião (por fala)', maxTokens: 600 },
  bia: { label: 'Perguntas à Bia', maxTokens: 600 },
  'live-mode': { label: 'Narração ao vivo', maxTokens: 500 },
  'interpret-free-action': { label: 'Interpretar ação livre', maxTokens: 300 },
  'campaign-summary': { label: 'Resumo mensal da campanha', maxTokens: 400 },
  negociacao: { label: 'Negociação (fala do representante, por rodada)', maxTokens: 700 },
  'negociacao-interpretar': { label: 'Negociação (ler a proposta do jogador)', maxTokens: 300 },
};

export interface FnConfig {
  model: string;
  effort: Effort;
  maxTokens: number;
  thinking: boolean;
}

export interface LLMConfig {
  premium: boolean;
  fns: Record<LLMFunction, FnConfig>;
}

type EnvGet = (name: string) => string | undefined;

const EFFORTS: Effort[] = ['low', 'medium', 'high'];
const on = (v: string | undefined) => /^(on|true|1|sim|yes)$/i.test((v ?? '').trim());
const effortOf = (v: string | undefined, fb: Effort): Effort => (EFFORTS.includes(v as Effort) ? (v as Effort) : fb);
const envKey = (fn: LLMFunction) => fn.toUpperCase().replace(/-/g, '_');

// Variáveis (todas opcionais): LLM_MODEL, LLM_EFFORT, LLM_THINKING, LLM_PREMIUM, LLM_PREMIUM_MODEL
// e, por função, LLM_<FUNCAO>_MODEL / _EFFORT / _MAX_TOKENS (ex.: LLM_REUNIAO_MAX_TOKENS=800).
export function resolveLLMConfig(get: EnvGet = () => undefined): LLMConfig {
  const premium = on(get('LLM_PREMIUM'));
  const baseModel = get('LLM_MODEL')?.trim() || HAIKU;
  const premiumModel = get('LLM_PREMIUM_MODEL')?.trim() || SONNET;
  const baseEffort = effortOf(get('LLM_EFFORT'), 'low');
  const thinking = on(get('LLM_THINKING'));
  const fns = {} as Record<LLMFunction, FnConfig>;
  for (const [fn, d] of Object.entries(LLM_FUNCTIONS) as [LLMFunction, FnDefault][]) {
    const k = envKey(fn);
    const max = parseInt(get(`LLM_${k}_MAX_TOKENS`) ?? '', 10);
    fns[fn] = {
      model: get(`LLM_${k}_MODEL`)?.trim() || (d.premium && premium ? premiumModel : baseModel),
      effort: effortOf(get(`LLM_${k}_EFFORT`), baseEffort),
      maxTokens: Number.isFinite(max) && max >= 100 ? Math.min(max, 16000) : d.maxTokens,
      thinking,
    };
  }
  return { premium, fns };
}

// ===== preços (US$ por milhão de tokens, prompts até 100 mil tokens) =====
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number; // cache de 5 minutos: 1,25 × entrada
}

export const PRICES: { prefix: string; price: Price }[] = [
  { prefix: 'claude-haiku-5-5', price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } },
  { prefix: 'claude-sonnet-5-5', price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
];

export function priceFor(model: string | null | undefined): Price | null {
  const m = model ?? '';
  return PRICES.find((p) => m.startsWith(p.prefix))?.price ?? null;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number | null;
  cacheWrite?: number | null;
}

// ===== resumo para o Painel de Custo (linhas de llm_calls) =====
export interface CallAgg {
  calls: number;
  failed: number;
  truncated: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  usd: number;
  models: string[];
}

export interface CallSummary {
  total: CallAgg;
  byFunction: { fn: string; agg: CallAgg }[]; // do mais caro para o mais barato
  byWeek: { week: number | null; agg: CallAgg }[]; // null = chamadas da v1, que não guardavam a semana
  perWeek: number | null; // média por semana de jogo registrada
  cacheHit: number | null; // fração dos tokens de cache que foram lidos (e não escritos)
}

type CallRow = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const newAgg = (): CallAgg => ({ calls: 0, failed: 0, truncated: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0, models: [] });

// linhas da v1 não têm cost_usd: o custo sai dos tokens (sem a escrita do cache, que a v1 não registrava)
export function rowCost(r: CallRow): number {
  if (r.cost_usd !== null && r.cost_usd !== undefined) return num(r.cost_usd);
  return callCost(String(r.model ?? ''), { input: num(r.input_tokens), output: num(r.output_tokens), cacheRead: num(r.cache_read_tokens), cacheWrite: num(r.cache_write_tokens) }) ?? 0;
}

function addRow(a: CallAgg, r: CallRow): void {
  a.calls += 1;
  if (r.ok === false) a.failed += 1;
  if (r.truncated) a.truncated += 1;
  a.input += num(r.input_tokens);
  a.output += num(r.output_tokens);
  a.cacheRead += num(r.cache_read_tokens);
  a.cacheWrite += num(r.cache_write_tokens);
  a.usd += rowCost(r);
  const m = String(r.model ?? '');
  if (m && !a.models.includes(m)) a.models.push(m);
}

export function summarizeLLMCalls(rows: CallRow[]): CallSummary {
  const total = newAgg();
  const fns = new Map<string, CallAgg>();
  const weeks = new Map<number | null, CallAgg>();
  for (const r of rows) {
    addRow(total, r);
    const fn = String(r.function ?? '—');
    if (!fns.has(fn)) fns.set(fn, newAgg());
    addRow(fns.get(fn)!, r);
    const w = r.week_index === null || r.week_index === undefined ? null : num(r.week_index);
    if (!weeks.has(w)) weeks.set(w, newAgg());
    addRow(weeks.get(w)!, r);
  }
  const byWeek = [...weeks.entries()].map(([week, agg]) => ({ week, agg })).sort((a, b) => (b.week ?? -1) - (a.week ?? -1));
  const played = byWeek.filter((w) => w.week !== null);
  const cacheTotal = total.cacheRead + total.cacheWrite;
  return {
    total,
    byFunction: [...fns.entries()].map(([fn, agg]) => ({ fn, agg })).sort((a, b) => b.agg.usd - a.agg.usd),
    byWeek,
    perWeek: played.length ? played.reduce((s, w) => s + w.agg.usd, 0) / played.length : null,
    cacheHit: cacheTotal ? total.cacheRead / cacheTotal : null,
  };
}

// Custo estimado em US$ (o valor cobrado de fato está na tela Usage do Claude Console)
export function callCost(model: string | null | undefined, u: TokenUsage): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (u.input * p.input + u.output * p.output + (u.cacheRead ?? 0) * p.cacheRead + (u.cacheWrite ?? 0) * p.cacheWrite) / 1e6;
}
