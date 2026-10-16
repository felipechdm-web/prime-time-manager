// Camada de dados do app: nuvem (Supabase + Edge Functions) ou demonstração offline (mesmo motor no navegador).

import type { GameRow, SelectOpts } from '@game/types.ts';

export type Row = Record<string, unknown>;

export interface GameSummary {
  id: string;
  station_name: string;
  era_id: string;
  scenario: string;
  difficulty: string;
  game_date: string;
  week_index: number;
  status: string;
  player: { name?: string };
  updated_at?: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface Backend {
  mode: 'cloud' | 'demo';
  llmAvailable: boolean | null; // null = desconhecido (descoberto na primeira cena)
  getUser(): Promise<AuthUser | null>;
  onAuth(cb: (u: AuthUser | null) => void): () => void;
  signInMagic(email: string): Promise<void>;
  signInPassword(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  listGames(): Promise<GameSummary[]>;
  getGame(id: string): Promise<GameRow>;
  deleteGame(id: string): Promise<void>;
  select(table: string, eq: Row, opts?: SelectOpts): Promise<Row[]>;
  markRead(messageId: string): Promise<void>;
  call<T = Row>(fn: string, body: Row): Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

let current: Backend | null = null;

export function cloudConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY));
}

export async function getBackend(preferDemo = false): Promise<Backend> {
  if (current && (preferDemo ? current.mode === 'demo' : true)) return current;
  if (!preferDemo && cloudConfigured()) {
    const { createCloudBackend } = await import('./cloud.ts');
    current = createCloudBackend(
      import.meta.env.VITE_SUPABASE_URL as string,
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string,
    );
  } else {
    const { createDemoBackend } = await import('./demo.ts');
    current = await createDemoBackend();
  }
  return current;
}

export function backendSync(): Backend {
  if (!current) throw new Error('Backend ainda não iniciado');
  return current;
}

export function resetBackend(): void {
  current = null;
}
