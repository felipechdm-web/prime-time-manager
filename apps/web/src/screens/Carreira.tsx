// Carreira (seção 15): KPIs, avaliações, conquistas, recordes, linha do tempo e retrospectiva.

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeKpis, KPI_WEIGHTS, scoreBreakdown } from '@engine/kpis.ts';
import { formatDate } from '@engine/time.ts';
import { useAction } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Bar, Button, Card, Modal, Stat, Tip } from '../components/ui.tsx';
import { startNewCareer } from '../components/EndGame.tsx';
import type { ScreenProps } from './GameShell.tsx';

const KPI_LABELS: Record<keyof typeof KPI_WEIGHTS, string> = {
  aud24: 'Audiência média 24h',
  prime: 'Audiência do nobre',
  rank: 'Posição por faixa',
  revenue: 'Faturamento vs meta',
  margin: 'Margem de programação',
  reputation: 'Reputação',
  political: 'Capital político',
};

export function Carreira({ gameId, state }: ScreenProps) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const openProgram = useUI((s) => s.openProgram);
  const [confirm, setConfirm] = useState(false);
  const k = state.kpis ?? computeKpis(state);
  const b = scoreBreakdown(state, k);
  const ps = state.stations.find((s) => s.isPlayer)!;
  const era = state.meta.era;
  const active = state.meta.status === 'active';
  const mine = state.programs.filter((p) => p.stationId === ps.id && p.stats.length > 0);
  const hits = [...mine].sort((a, b2) => b2.totals.peakPts - a.totals.peakPts).slice(0, 5);
  const flops = [...mine].filter((p) => p.totals.revenue - p.totals.cost < 0).sort((a, b2) => (a.totals.revenue - a.totals.cost) - (b2.totals.revenue - b2.totals.cost)).slice(0, 3);
  const monthChart = state.monthScores.slice(-24).map((m) => ({ m: m.month.slice(5) + '/' + m.month.slice(2, 4), nota: m.score }));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Carreira</h1>
          <p className="text-sm text-muted">{state.player.name} · reputação de carreira {state.player.reputation}/100{state.player.careerStations.length ? ` · passou por ${state.player.careerStations.join(', ')}` : ''}</p>
        </div>
        {active ? (
          <Button variant="ghost" onClick={() => setConfirm(true)}>Encerrar carreira</Button>
        ) : (
          <Button variant="primary" onClick={() => startNewCareer(state)}>Recomeçar em outra emissora</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Nota atual" value={`${k.score}/100`} tone={k.score >= 60 ? 'good' : k.score < 40 ? 'bad' : 'warn'} sub="< 40 no fim do ano = demissão" tip="Avaliação contínua da presidência. A anual é a média das notas mensais do ano." />
        <Stat label="Meta 24h" value={fmtPts(state.targets.aud24)} sub={`atual ${fmtPts(k.aud24)}`} />
        <Stat label="Meta nobre" value={fmtPts(state.targets.prime)} sub={`atual ${fmtPts(k.prime)}`} />
        <Stat label="Faixas na meta" value={`${k.bandsOk}/${k.bandsTotal}`} sub={state.targets.rankTarget ? `meta: ${state.targets.rankTarget}º lugar ou melhor` : 'canal pago: posição não conta'} />
      </div>

      <Card title="Composição da nota">
        <p className="mb-3 text-sm text-muted">{state.targets.description}</p>
        <div className="space-y-2">
          {(Object.keys(KPI_WEIGHTS) as (keyof typeof KPI_WEIGHTS)[]).map((key) => (
            <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[220px_1fr_60px]">
              <span className="text-sm">{KPI_LABELS[key]} <span className="text-xs text-muted">({Math.round(KPI_WEIGHTS[key] * 100)}%)</span></span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1"><Bar value={b[key]} tone={b[key] >= 60 ? 'good' : b[key] < 40 ? 'bad' : 'warn'} /></span>
              <span className="tabular text-right text-sm font-semibold">{Math.round(b[key])}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Nota mês a mês">
          {monthChart.length === 0 ? <p className="text-sm text-muted">O primeiro fechamento mensal ainda não aconteceu.</p> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthChart} margin={{ left: -18, right: 6, top: 6, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="m" stroke="var(--muted)" fontSize={10} />
                  <YAxis domain={[0, 100]} stroke="var(--muted)" fontSize={10} />
                  <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <ReferenceLine y={40} stroke="var(--bad)" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="var(--good)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="nota" stroke="var(--accent)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Avaliações anuais">
          {state.evaluations.length === 0 ? <p className="text-sm text-muted">A primeira avaliação anual acontece na virada do ano.</p> : (
            <ul className="space-y-2 text-sm">
              {state.evaluations.map((e) => (
                <li key={e.year} className="flex items-start justify-between gap-2 rounded-theme bg-surface-2 px-3 py-2">
                  <span><b>{e.year}</b> — {e.verdict}</span>
                  <Badge tone={e.score >= 80 ? 'good' : e.score < 40 ? 'bad' : 'warn'}>{e.score}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Conquistas">
          {state.achievements.length === 0 ? <p className="text-sm text-muted">Nenhuma ainda. Liderar o nobre já vale uma.</p> : (
            <ul className="space-y-1.5 text-sm">{state.achievements.map((a) => <li key={a.id}>🏅 {a.label} <span className="text-xs text-muted">(semana {a.week + 1})</span></li>)}</ul>
          )}
        </Card>
        <Card title="Recordes">
          {state.records.length === 0 ? <p className="text-sm text-muted">Sem recordes ainda.</p> : (
            <ul className="space-y-1.5 text-sm">
              {state.records.map((r) => (
                <li key={r.key}>🏆 {r.label}: <b className="tabular">{r.key === 'receita' ? moneyEra(era, r.value) : fmtPts(r.value)}</b></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<Tip text="Programas da sua emissora com maior pico e os que deram prejuízo.">Hall da Fama</Tip>}>
          <ul className="space-y-1.5 text-sm">
            {hits.map((p) => <li key={p.id}><button className="hover:underline" onClick={() => openProgram(p.id)}>⭐ {p.title}</button> <span className="text-xs text-muted">pico {fmtPts(p.totals.peakPts)}</span></li>)}
            {flops.map((p) => <li key={p.id} className="text-bad"><button className="hover:underline" onClick={() => openProgram(p.id)}>💸 {p.title}</button> <span className="text-xs">{moneyEra(era, p.totals.revenue - p.totals.cost)}</span></li>)}
            {hits.length === 0 && <li className="text-muted">Ainda sem histórico.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Linha do tempo">
        <ol className="relative space-y-3 border-l border-border pl-4">
          {[...state.timeline].reverse().slice(0, 80).map((t, i) => (
            <li key={i} className="text-sm">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="text-xs text-muted">{formatDate(t.date)}</span>
              <p>{t.text}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Encerrar a carreira nesta emissora?" footer={<div className="flex justify-end gap-2"><Button onClick={() => setConfirm(false)}>Continuar no cargo</Button><Button variant="danger" busy={busy} onClick={async () => { const r = await run<{ result: { message: string } }>('apply-intent', { intent: { type: 'retire' } }); setConfirm(false); if (r) toast('info', r.result.message); }}>Encerrar</Button></div>}>
        <p className="text-sm text-muted">A partida termina e fica disponível como retrospectiva. Você pode recomeçar em outra emissora levando sua reputação.</p>
      </Modal>
    </div>
  );
}
