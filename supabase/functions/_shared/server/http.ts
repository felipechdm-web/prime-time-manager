// Infra comum das Edge Functions: CORS, autenticação do usuário e montagem do contexto.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { HttpError } from '../game/types.ts';
import type { HandlerCtx } from '../game/types.ts';
import { AnthropicProvider } from './anthropic.ts';
import { SupabaseStore } from './supabaseStore.ts';
import { validateMestreZod } from './zod.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

function env(name: string, fallback = ''): string {
  return Deno.env.get(name) ?? fallback;
}

export type Handler = (ctx: HandlerCtx, body: Record<string, unknown>) => Promise<unknown>;

export function serve(handler: Handler): void {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    try {
      const url = env('SUPABASE_URL');
      const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
      if (!url || !serviceKey) throw new HttpError(500, 'Função sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!token) throw new HttpError(401, 'Faça login para jogar');
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData?.user) throw new HttpError(401, 'Sessão inválida ou expirada. Entre de novo.');
      const user = userData.user;
      const allowed = env('ALLOWED_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (allowed.length && !allowed.includes((user.email ?? '').toLowerCase())) throw new HttpError(403, 'Este e-mail não está autorizado a jogar (ALLOWED_EMAILS).');
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, 'Corpo JSON inválido');
      }
      const apiKey = env('ANTHROPIC_API_KEY');
      const effort = env('MESTRE_EFFORT', 'low');
      const ctx: HandlerCtx = {
        store: new SupabaseStore(admin),
        llm: apiKey ? new AnthropicProvider(apiKey) : null,
        userId: user.id,
        validateMestre: validateMestreZod,
        env: {
          sceneModel: env('MESTRE_MODEL', 'claude-sonnet-5-5'),
          fastModel: env('MESTRE_FAST_MODEL', 'claude-haiku-5-5'),
          weeklyCap: parseInt(env('LLM_WEEKLY_CAP', '30'), 10) || 30,
          hourlyCap: parseInt(env('LLM_HOURLY_CAP', '60'), 10) || 60,
          effort: (['low', 'medium', 'high'].includes(effort) ? effort : 'low') as 'low' | 'medium' | 'high',
        },
        now: () => new Date(),
        uuid: () => crypto.randomUUID(),
      };
      const result = await handler(ctx, body);
      return json(result);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500);
    }
  });
}
