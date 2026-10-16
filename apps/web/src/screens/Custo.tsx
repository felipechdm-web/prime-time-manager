// Painel de Custo da IA (seção 20.1, Fase 6.1): gasto por função e por semana de jogo, lido de llm_calls.
// Só leitura: modelo, esforço, max_tokens e modo premium são ajustados pelos segredos do Supabase.

import { useMemo, useState } from 'react';
import { LLM_FUNCTIONS, resolveLLMConfig, summarizeLLMCalls } from '@game/llmConfig.ts';
import type { LLMFunction } from '@game/llmConfig.ts';
import { backendSync } from '../lib/backend.ts';
import { useRows } from '../lib/queries.ts';
import { Card, Empty, Spinner, Stat, Tabs } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

const usd = (v: number) => (v === 0 ? 'US$ 0' : v < 0.01 ? `US$ ${v.toFixed(4)}` : `US$ ${v.toFixed(3)}`);
const int = (v: number) => Math.round(v).toLocaleString('pt-BR');
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '—');
const modelName = (m: string) => (m.includes('haiku') ? 'Haiku 5.5' : m.includes('sonnet') ? 'Sonnet 5.5' : m || '—');

export function Custo({ gameId, state }: ScreenProps) {
  const [scope, setScope] = useState<'partida' | 'todas'>('partida');
  const demo = backendSync().mode === 'demo';
  const rows = useRows(['llm', scope, scope === 'partida' ? gameId : 'all'], 'llm_calls', scope === 'partida' ? { game_id: gameId } : {}, { order: 'id', ascending: false, limit: 5000 });
  const defaults = useMemo(() => resolveLLMConfig(), []);

  const data = useMemo(() => summarizeLLMCalls(rows.data ?? []), [rows.data]);
  const { total, cacheHit } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Custo da IA</h1>
          <p className="text-sm text-muted">Estimativa a partir das chamadas registradas. O valor cobrado de fato está em Usage, no Claude Console.</p>
        </div>
        <Tabs value={scope} onChange={setScope} items={[{ id: 'partida', label: 'Esta partida' }, { id: 'todas', label: 'Todas as partidas' }]} />
      </div>

      {demo ? (
        <Empty title="Modo demonstração">Aqui o Mestre usa só textos-modelo, sem chamar a IA, então não há custo.</Empty>
      ) : rows.isLoading ? (
        <div className="flex justify-center p-8 text-muted"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Gasto estimado" value={usd(total.usd)} sub={`${int(total.calls)} chamada(s)`} tip="Soma do custo estimado de cada chamada, pelos preços da Claude API (Haiku 5.5: US$ 0,10 entrada / 0,50 saída por milhão de tokens)." />
            <Stat label="Por semana de jogo" value={data.perWeek === null ? '—' : usd(data.perWeek)} sub="média das semanas registradas" tip="Média do gasto por semana de jogo, só com as chamadas da v2 (que guardam a semana)." />
            <Stat label="Chamadas nesta semana" value={`${state.llm.weekCalls}`} sub="cota semanal do Mestre" tip="Ao estourar a cota (LLM_WEEKLY_CAP, padrão 30), o Mestre passa a usar textos-modelo até a semana seguinte." />
            <Stat label="Acerto do cache" value={cacheHit === null ? '—' : `${Math.round(cacheHit * 100)}%`} sub="tokens lidos do cache" tip="Parte fixa do prompt do Mestre reaproveitada do cache (custa 10% da entrada). Chamadas com mais de 5 minutos de intervalo escrevem o cache de novo." />
          </div>

          <Card title="Por função">
            {data.byFunction.length === 0 ? <Empty title="Nenhuma chamada registrada" /> : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-1.5 pr-2">Função</th>
                      <th className="py-1.5 pr-2">Modelo</th>
                      <th className="py-1.5 pr-2 text-right">Chamadas</th>
                      <th className="py-1.5 pr-2 text-right">Entrada</th>
                      <th className="py-1.5 pr-2 text-right">Saída</th>
                      <th className="py-1.5 pr-2 text-right">Cortadas</th>
                      <th className="py-1.5 pr-2 text-right">Custo</th>
                      <th className="py-1.5 text-right">% do total</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {data.byFunction.map(({ fn, agg: a }) => (
                      <tr key={fn} className="border-t border-border/60">
                        <td className="py-1.5 pr-2 font-semibold">{LLM_FUNCTIONS[fn as LLMFunction]?.label ?? fn}</td>
                        <td className="py-1.5 pr-2 text-muted">{a.models.map(modelName).join(', ')}</td>
                        <td className="py-1.5 pr-2 text-right">{int(a.calls)}{a.failed ? <span className="text-muted"> ({a.failed} falha)</span> : null}</td>
                        <td className="py-1.5 pr-2 text-right">{int(a.input + a.cacheRead + a.cacheWrite)}</td>
                        <td className="py-1.5 pr-2 text-right">{int(a.output)}</td>
                        <td className="py-1.5 pr-2 text-right">{pct(a.truncated, a.calls)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold">{usd(a.usd)}</td>
                        <td className="py-1.5 text-right">{pct(a.usd, total.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Por semana de jogo">
            {data.byWeek.length === 0 ? <Empty title="Nenhuma chamada registrada" /> : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-1.5 pr-2">Semana</th>
                      <th className="py-1.5 pr-2 text-right">Chamadas</th>
                      <th className="py-1.5 pr-2 text-right">Tokens</th>
                      <th className="py-1.5 text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {data.byWeek.map(({ week, agg: w }) => (
                      <tr key={week ?? 'v1'} className="border-t border-border/60">
                        <td className="py-1.5 pr-2 font-semibold">{week === null ? 'Antes da v2 (sem semana)' : `Semana ${week + 1}`}</td>
                        <td className="py-1.5 pr-2 text-right">{int(w.calls)}</td>
                        <td className="py-1.5 pr-2 text-right">{int(w.input + w.cacheRead + w.cacheWrite + w.output)}</td>
                        <td className="py-1.5 text-right font-semibold">{usd(w.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Configuração padrão por função">
        <p className="mb-2 text-xs text-muted">
          Valores de fábrica da v2. Os segredos do Supabase podem mudá-los (ex.: <code>LLM_REUNIAO_MAX_TOKENS</code>, <code>LLM_PREMIUM=on</code>).
          Raciocínio desligado no Haiku. Modo premium: {defaults.premium ? 'ligado' : 'desligado'} (Sonnet 5.5 só na avaliação com a presidência).
        </p>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-1.5 pr-2">Função</th>
                <th className="py-1.5 pr-2">Modelo</th>
                <th className="py-1.5 pr-2">Esforço</th>
                <th className="py-1.5 text-right">max_tokens</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {(Object.keys(LLM_FUNCTIONS) as LLMFunction[]).map((fn) => (
                <tr key={fn} className="border-t border-border/60">
                  <td className="py-1.5 pr-2">{LLM_FUNCTIONS[fn].label}</td>
                  <td className="py-1.5 pr-2 text-muted">{modelName(defaults.fns[fn].model)}</td>
                  <td className="py-1.5 pr-2 text-muted">baixo</td>
                  <td className="py-1.5 text-right">{int(defaults.fns[fn].maxTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
