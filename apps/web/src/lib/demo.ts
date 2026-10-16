// Modo demonstração: sem Supabase e sem IA. Os mesmos handlers do servidor rodam aqui,
// com os dados guardados no IndexedDB deste navegador. O Mestre usa os textos de fallback.

import {
  applyIntentHandler, createGame, interpretHandler, liveModeHandler, mestreSceneHandler, resolveEventHandler, simulateHandler,
} from '@game/handlers.ts';
import { resolveLLMConfig } from '@game/llmConfig.ts';import { MemoryStore } from '@game/memoryStore.ts';
import type { GameRow, HandlerCtx, SelectOpts } from '@game/types.ts';
import { HttpError } from '@game/types.ts';
import { validateMestrePlain } from '@game/validators.ts';
import { ApiError } from './backend.ts';
import type { Backend, GameSummary, Row } from './backend.ts';
import { idbGet, idbKeys, idbSet } from './idb.ts';

const USER = { id: 'demo-user', email: null };

type HandlerFn = (ctx: HandlerCtx, body: Record<string, unknown>) => Promise<unknown>;

const HANDLERS: Record<string, HandlerFn> = {
  'create-game': createGame,
  'apply-intent': applyIntentHandler,
  'simulate-week': simulateHandler,
  'mestre-scene': mestreSceneHandler,
  'resolve-event': resolveEventHandler,
  'live-mode': liveModeHandler,
  'interpret-free-action': interpretHandler,
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function createDemoBackend(): Promise<Backend> {
  const store = new MemoryStore();
  for (const key of await idbKeys()) {
    if (!key.startsWith('tbl:')) continue;
    const rows = await idbGet<Row[]>(key);
    if (rows) store.load(key.slice(4), rows);
  }
  let chain = Promise.resolve();
  const persist = async () => {
    const dirty = [...store.dirty];
    store.dirty.clear();
    for (const t of dirty) await idbSet(`tbl:${t}`, store.tables.get(t) ?? []);
  };
  const ctx = (): HandlerCtx => ({
    store,
    llm: null,
    userId: USER.id,
    validateMestre: validateMestrePlain,
    env: { llm: resolveLLMConfig(), weeklyCap: 30, hourlyCap: 60 },
    now: () => new Date(),
    uuid,
  });

  const backend: Backend = {
    mode: 'demo',
    llmAvailable: false,
    async getUser() {
      return USER;
    },
    onAuth(cb) {
      cb(USER);
      return () => undefined;
    },
    async signInMagic() {},
    async signInPassword() {},
    async signUp() {
      return { needsConfirmation: false };
    },
    async signOut() {},
    async listGames() {
      const rows = await store.select('games', { owner_id: USER.id });
      return rows
        .map((r) => ({
          id: String(r.id), station_name: String(r.station_name), era_id: String(r.era_id), scenario: String(r.scenario), difficulty: String(r.difficulty),
          game_date: String(r.game_date), week_index: Number(r.week_index), status: String(r.status), player: r.player as { name?: string }, updated_at: String(r.updated_at ?? ''),
        }) as GameSummary)
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    },
    async getGame(id) {
      const g = await store.getGame(id);
      if (!g) throw new ApiError('Partida não encontrada', 404);
      return g as GameRow;
    },
    async deleteGame(id) {
      await store.deleteGame(id);
      await persist();
    },
    async select(table: string, eq: Row, opts?: SelectOpts) {
      return store.select(table, eq, opts);
    },
    async markRead(messageId) {
      await store.update('inbox_messages', { id: messageId }, { read: true });
      await persist();
    },
    async call<T>(fn: string, body: Row): Promise<T> {
      const h = HANDLERS[fn];
      if (!h) throw new ApiError(`Função desconhecida: ${fn}`, 404);
      // serializa as chamadas, como um servidor faria por partida
      const run = chain.then(async () => {
        try {
          return (await h(ctx(), body)) as T;
        } catch (e) {
          if (e instanceof HttpError) throw new ApiError(e.message, e.status);
          throw e;
        } finally {
          await persist();
        }
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return backend;
}
