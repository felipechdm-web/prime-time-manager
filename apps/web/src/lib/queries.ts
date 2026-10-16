// Hooks de dados (TanStack Query) e ações que falam com o servidor.

import { QueryClient, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { GameRow } from '@game/types.ts';
import type { GameState } from '@engine/types.ts';
import { ApiError, backendSync } from './backend.ts';
import type { Row } from './backend.ts';
import { useUI } from './ui.ts';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 } },
});

export function useGame(gameId: string | undefined) {
  return useQuery({
    queryKey: ['game', gameId],
    queryFn: () => backendSync().getGame(gameId!),
    enabled: !!gameId,
    staleTime: 60_000,
  });
}

export function applyPatch(gameId: string, patch: Partial<GameState> | undefined, version?: number): void {
  if (!patch) return;
  queryClient.setQueryData<GameRow>(['game', gameId], (old) => {
    if (!old) return old;
    const state = { ...old.state, ...patch } as GameState;
    return { ...old, state, version: version ?? old.version, week_index: state.meta.weekIndex, game_date: state.meta.date, status: state.meta.status };
  });
}

export function setGameState(gameId: string, state: GameState): void {
  queryClient.setQueryData<GameRow>(['game', gameId], (old) => (old ? { ...old, state } : old));
}

export function useRows(key: unknown[], table: string, eq: Row, opts: Parameters<ReturnType<typeof backendSync>['select']>[2] = {}, enabled = true) {
  return useQuery({
    queryKey: key,
    queryFn: () => backendSync().select(table, eq, opts),
    enabled,
  });
}

export function useReports(gameId: string, kind: 'week' | 'day' | 'month' | 'year' | 'quarter', limit = 20) {
  return useRows(['reports', gameId, kind, limit], 'reports', { game_id: gameId, kind }, { order: 'created_at', ascending: false, limit });
}

export function useInbox(gameId: string) {
  return useRows(['inbox', gameId], 'inbox_messages', { game_id: gameId }, { order: 'created_at', ascending: false, limit: 120 });
}

export function invalidateGameData(gameId: string, which: string[] = ['reports', 'inbox', 'competitor', 'ledger', 'kpis', 'conversations', 'slots', 'memories']): void {
  for (const w of which) void queryClient.invalidateQueries({ queryKey: [w, gameId] });
}

export interface ActionResponse {
  patch?: Partial<GameState>;
  version?: number;
  [k: string]: unknown;
}

// executa uma função do servidor com tratamento de erro, patch de estado e invalidação
export function useAction(gameId: string | undefined) {
  const [busy, setBusy] = useState(false);
  const toast = useUI((s) => s.toast);
  const run = useCallback(
    async <T extends object>(fn: string, body: Row, opts: { invalidate?: string[]; silent?: boolean } = {}): Promise<T | null> => {
      setBusy(true);
      try {
        const res = await backendSync().call<T>(fn, gameId ? { gameId, ...body } : body);
        const ar = res as ActionResponse | null;
        if (gameId && ar && ar.patch) applyPatch(gameId, ar.patch, ar.version);
        if (gameId && opts.invalidate) invalidateGameData(gameId, opts.invalidate);
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!opts.silent) toast('error', msg);
        if (e instanceof ApiError && e.status === 409 && gameId) await queryClient.invalidateQueries({ queryKey: ['game', gameId] });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [gameId, toast],
  );
  return { run, busy };
}
