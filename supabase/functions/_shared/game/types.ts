// Tipos da camada de jogo (handlers), compartilhada entre Edge Functions (Deno) e o modo demo (navegador).

import type { GameState } from '../engine/types.ts';
import type { LLMConfig } from './llmConfig.ts';

export interface GameRow {
  id: string;
  owner_id: string;
  universe: string;
  era_id: string;
  scenario: string;
  difficulty: string;
  seed: number;
  game_date: string;
  week_index: number;
  status: string;
  player: Record<string, unknown>;
  station_name: string;
  state: GameState;
  version: number;
  created_at?: string;
  updated_at?: string;
}

export interface SelectOpts {
  order?: string;
  ascending?: boolean;
  limit?: number;
  gte?: Record<string, string | number>;
  lt?: Record<string, string | number>;
  columns?: string;
}

// Persistência abstrata: SupabaseStore (servidor) ou LocalStore (IndexedDB, modo demo)
export interface GameStore {
  getGame(id: string): Promise<GameRow | null>;
  insertGame(row: GameRow): Promise<void>;
  updateGame(id: string, patch: Partial<GameRow>, expectedVersion: number): Promise<boolean>;
  insert(table: string, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]>;
  select(table: string, eq: Record<string, unknown>, opts?: SelectOpts): Promise<Record<string, unknown>[]>;
  update(table: string, eq: Record<string, unknown>, patch: Record<string, unknown>): Promise<void>;
  remove(table: string, eq: Record<string, unknown>, lt?: Record<string, number>): Promise<void>;
  countSince(table: string, eq: Record<string, unknown>, column: string, sinceIso: string): Promise<number>;
}

export interface LLMUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface LLMRequest {
  system: { text: string; cache?: boolean }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
  model: string;
  maxTokens: number;
  jsonSchema?: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  thinking?: boolean; // false desliga o raciocínio onde o modelo permite (Haiku 5.5 com esforço até "high")
}

export interface LLMResponse {
  ok: boolean;
  text: string;
  usage: LLMUsage;
  model: string;
  error?: string;
  refusal?: boolean;
  truncated?: boolean; // parou em max_tokens
}

// Interface do provedor (seção 19.5): trocar de provedor não muda o resto do código
export interface LLMProvider {
  name: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

export interface MestreNarrative {
  speaker: string;
  text: string;
}

export interface MestreOutput {
  scene_type: 'boletim' | 'mensagem' | 'reuniao' | 'evento' | 'ao_vivo' | 'avaliacao' | 'livre';
  narrative: MestreNarrative[];
  headlines: string[];
  choices: { id: string; label: string }[];
  player_action: { type: string; params_json: string; summary: string } | null;
  proposals: { tag: string; target: string; value: number; reason: string }[];
  memory_notes: { npc_id: string; fact: string; weight: number }[];
}

export type Validator = (obj: unknown) => { ok: true; value: MestreOutput } | { ok: false; error: string };

export interface HandlerEnv {
  llm: LLMConfig; // modelo, esforço e max_tokens por função (llmConfig.ts)
  weeklyCap: number;
  hourlyCap: number;
}

export interface HandlerCtx {
  store: GameStore;
  llm: LLMProvider | null;
  userId: string;
  validateMestre: Validator;
  env: HandlerEnv;
  now: () => Date;
  uuid: () => string;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
