// Provedor do Mestre: Claude API via SDK oficial da Anthropic (roda só no servidor, Deno).
// A chave fica em Supabase secrets (ANTHROPIC_API_KEY), nunca no front nem no GitHub.

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import type { LLMProvider, LLMRequest, LLMResponse } from '../game/types.ts';

let fallbacksSupported = true;

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const empty = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const system = req.system.map((b) => (b.cache ? { type: 'text' as const, text: b.text, cache_control: { type: 'ephemeral' as const } } : { type: 'text' as const, text: b.text }));
    const outputConfig: Record<string, unknown> = { effort: req.effort ?? 'low' };
    if (req.jsonSchema) outputConfig.format = { type: 'json_schema', schema: req.jsonSchema };
    // fallback de recusa no servidor: recomendado para Sonnet 5.5 (não existe para Haiku 5.5)
    const useFallbacks = fallbacksSupported && req.model.includes('sonnet');
    const params: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens,
      system,
      messages: req.messages,
      output_config: outputConfig,
    };
    // Haiku 5.5 aceita desligar o raciocínio com esforço até "high"; nos outros modelos ele fica adaptativo
    // (o raciocínio é cobrado como saída, então desligá-lo é a maior economia nas cenas curtas)
    if (req.thinking === false && req.model.includes('haiku')) params.thinking = { type: 'disabled' };
    if (useFallbacks) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    try {
      // deno-lint-ignore no-explicit-any
      const resp: any = useFallbacks
        // deno-lint-ignore no-explicit-any
        ? await (this.client.beta.messages.create as any)(params)
        // deno-lint-ignore no-explicit-any
        : await (this.client.messages.create as any)(params);
      const usage = {
        input: resp.usage?.input_tokens ?? 0,
        output: resp.usage?.output_tokens ?? 0,
        cacheRead: resp.usage?.cache_read_input_tokens ?? 0,
        cacheWrite: resp.usage?.cache_creation_input_tokens ?? 0,
      };
      if (resp.stop_reason === 'refusal') {
        return { ok: false, text: '', usage, model: resp.model ?? req.model, error: `recusa (${resp.stop_details?.category ?? 'sem categoria'})`, refusal: true };
      }
      const text = (resp.content ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((b: any) => b.type === 'text')
        // deno-lint-ignore no-explicit-any
        .map((b: any) => b.text)
        .join('');
      if (resp.stop_reason === 'max_tokens' && !text.trim().endsWith('}')) {
        return { ok: false, text, usage, model: resp.model ?? req.model, error: 'resposta cortada (max_tokens)', truncated: true };
      }
      return { ok: true, text, usage, model: resp.model ?? req.model };
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && useFallbacks && /fallback/i.test(err.message)) {
        // conta/plataforma sem suporte ao parâmetro: tenta de novo sem ele
        fallbacksSupported = false;
        return this.complete(req);
      }
      let msg = 'erro desconhecido';
      if (err instanceof Anthropic.AuthenticationError) msg = 'chave da API inválida (ANTHROPIC_API_KEY)';
      else if (err instanceof Anthropic.PermissionDeniedError) msg = 'sem permissão para o modelo ou limite de gasto atingido';
      else if (err instanceof Anthropic.RateLimitError) msg = 'limite de taxa da API atingido';
      else if (err instanceof Anthropic.BadRequestError) msg = `requisição inválida: ${err.message}`;
      else if (err instanceof Anthropic.APIError) msg = `erro da API ${err.status}: ${err.message}`;
      else if (err instanceof Error) msg = err.message;
      return { ok: false, text: '', usage: empty, model: req.model, error: msg };
    }
  }
}
