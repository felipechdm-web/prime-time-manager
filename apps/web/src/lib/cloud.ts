// Modo nuvem: login e leituras pelo Supabase (RLS); toda escrita passa pelas Edge Functions.

import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import type { GameRow, SelectOpts } from '@game/types.ts';
import { ApiError } from './backend.ts';
import type { AuthUser, Backend, GameSummary, Row } from './backend.ts';

function redirectUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

export function createCloudBackend(url: string, key: string): Backend {
  const sb = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null => (u ? { id: u.id, email: u.email ?? null } : null);

  const backend: Backend = {
    mode: 'cloud',
    llmAvailable: null,
    async getUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuth(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signInMagic(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } });
      if (error) throw new ApiError(error.message, 400);
    },
    async signInPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new ApiError(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message, 400);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
      if (error) throw new ApiError(error.message, 400);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async listGames() {
      const { data, error } = await sb
        .from('games')
        .select('id, station_name, era_id, scenario, difficulty, game_date, week_index, status, player, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw new ApiError(error.message);
      return (data ?? []) as GameSummary[];
    },
    async getGame(id) {
      const { data, error } = await sb.from('games').select('*').eq('id', id).maybeSingle();
      if (error) throw new ApiError(error.message);
      if (!data) throw new ApiError('Partida não encontrada', 404);
      return data as GameRow;
    },
    async deleteGame(id) {
      const { error } = await sb.from('games').delete().eq('id', id);
      if (error) throw new ApiError(error.message);
    },
    async select(table: string, eq: Row, opts: SelectOpts = {}) {
      let q = sb.from(table).select(opts.columns ?? '*');
      for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as string);
      for (const [k, v] of Object.entries(opts.gte ?? {})) q = q.gte(k, v);
      for (const [k, v] of Object.entries(opts.lt ?? {})) q = q.lt(k, v);
      if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? true });
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw new ApiError(error.message);
      return (data ?? []) as unknown as Row[];
    },
    async markRead(messageId) {
      await sb.from('inbox_messages').update({ read: true }).eq('id', messageId);
    },
    async call<T>(fn: string, body: Row): Promise<T> {
      const { data, error } = await sb.functions.invoke(fn, { body });
      if (error) {
        let msg = error.message;
        let status = 500;
        if (error instanceof FunctionsHttpError) {
          status = error.context.status;
          try {
            const j = await error.context.json();
            msg = j.error ?? msg;
          } catch {
            // corpo não-JSON
          }
          if (status === 404 && /not found/i.test(msg)) msg = `A função "${fn}" não foi encontrada no Supabase. Confira o deploy das Edge Functions (tutorial, passo 6).`;
        } else if (/Failed to send a request/i.test(msg)) {
          msg = `Não consegui falar com a função "${fn}". Confira se as Edge Functions foram publicadas (tutorial, passo 6).`;
        }
        throw new ApiError(msg, status);
      }
      return data as T;
    },
  };
  return backend;
}
