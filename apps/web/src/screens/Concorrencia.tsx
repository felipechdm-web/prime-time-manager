// Concorrência (seção 11): grades e audiências dos rivais, movimentos e rumores (informação imperfeita).

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ARCHETYPES } from '@engine/catalog/archetypes.ts';
import { GENRES } from '@engine/catalog/genres.ts';
import { DAY_NAMES, DAY_SHORT, formatDate, slotLabel } from '@engine/time.ts';
import { useAction, useRows } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts } from '../lib/format.ts';
import { Badge, Button, Card, StationDot, Tabs, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

export function Concorrencia({ gameId, state }: ScreenProps) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const openProgram = useUI((s) => s.openProgram);
  const actions = useRows(['competitor', gameId], 'competitor_actions', { game_id: gameId }, { order: 'id', ascending: false, limit: 60 });
  const rivals = state.stations.filter((s) => !s.isPlayer && !s.closedWeek);
  const [rid, setRid] = useState(rivals[0]?.id ?? '');
  const [day, setDay] = useState(0);
  const analyst = state.research.analyst || (typeof state.flags.informante_until === 'number' && Number(state.flags.informante_until) >= state.meta.weekIndex);
  const week = analyst ? state.schedules[rid] : state.rivalSnapshot[rid] ?? state.schedules[rid];
  const programs = useMemo(() => new Map(state.programs.map((p) => [p.id, p])), [state.programs]);
  const stations = state.stations.filter((s) => !s.closedWeek);
  const chart = useMemo(() => {
    const weeks = new Set<number>();
    for (const s of stations) for (const h of s.history) if (h.w >= 0) weeks.add(h.w);
    return [...weeks].sort((a, b) => a - b).slice(-16).map((w) => {
      const row: Record<string, number | string> = { w: `S${w + 1}` };
      for (const s of stations) {
        const h = s.history.find((x) => x.w === w);
        if (h) row[s.id] = h.prime;
      }
      return row;
    });
  }, [stations]);
  const visible = (actions.data ?? []).filter((a) => a.public || analyst);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black sm:text-2xl">Concorrência</h1>
        {!state.research.analyst && state.meta.status === 'active' && (
          <Button busy={busy} onClick={() => run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent: { type: 'hire_analyst' } }).then((r) => r && toast(r.result.ok ? 'success' : 'error', r.result.message))}>
            Contratar analista de concorrência
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((s) => {
          const h = s.history.at(-1);
          const prev = s.history.at(-5);
          const d = h && prev ? h.prime - prev.prime : 0;
          return (
            <div key={s.id} className={`card p-3 ${s.isPlayer ? 'border-accent/60' : ''}`}>
              <div className="flex items-center gap-2">
                <StationDot color={s.color} size={12} />
                <span className="font-bold">{s.name}</span>
                {s.isPlayer && <Badge tone="accent">você</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted">{ARCHETYPES[s.archetype].name}: {ARCHETYPES[s.archetype].strategy.toLowerCase()}</div>
              <div className="mt-2 flex justify-between text-sm">
                <span>24h <b className="tabular">{fmtPts(h?.pts24)}</b></span>
                <span>Nobre <b className="tabular">{fmtPts(h?.prime)}</b></span>
                <span className={d > 0.05 ? 'text-good' : d < -0.05 ? 'text-bad' : 'text-muted'}>{d > 0.05 ? '▲' : d < -0.05 ? '▼' : '＝'} {fmtPts(Math.abs(d))}</span>
              </div>
            </div>
          );
        })}
      </div>
      <Card title="Horário nobre semana a semana">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ left: -18, right: 6, top: 6, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke="var(--muted)" fontSize={10} />
              <YAxis stroke="var(--muted)" fontSize={10} />
              <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v, k) => [fmtPts(Number(v)), stations.find((s) => s.id === String(k))?.name ?? String(k)]} />
              {stations.map((s) => <Line key={s.id} type="monotone" dataKey={s.id} stroke={s.color} strokeWidth={s.isPlayer ? 3 : 1.5} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title={<Tip text="A grade dos rivais é vista com uma semana de atraso, como na vida real. Com analista ou informante, você vê a grade atual.">Grade dos rivais {analyst ? '(atual)' : '(semana passada)'}</Tip>}>
          <div className="space-y-2">
            <select className="w-full rounded-theme border border-border bg-surface-2 px-3 py-2 text-sm" value={rid} onChange={(e) => setRid(e.target.value)}>
              {rivals.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Tabs value={String(day)} onChange={(v) => setDay(Number(v))} items={DAY_NAMES.map((n, i) => ({ id: String(i), label: DAY_SHORT[i] }))} />
            <div className="space-y-1">
              {(week?.[day] ?? []).map((b) => {
                const p = programs.get(b.programId);
                const g = p ? GENRES[p.genre] : null;
                return (
                  <button key={b.start} onClick={() => p && openProgram(p.id)} className="flex w-full items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-left text-sm hover:brightness-125" style={{ borderLeft: `3px solid ${g?.color ?? '#666'}` }}>
                    <span className="tabular w-12 shrink-0 text-xs text-muted">{slotLabel(b.start)}</span>
                    <span className="min-w-0 flex-1 truncate">{g?.icon} {p?.label ?? p?.title}</span>
                    <span className="tabular shrink-0 text-xs text-muted">{p?.stats.at(-1) ? `${fmtPts(p.stats.at(-1)!.pts)} pts` : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2" title="Movimentos e rumores">
          {visible.length === 0 ? <p className="text-sm text-muted">Nada relevante por enquanto.</p> : (
            <ul className="space-y-2 text-sm">
              {visible.map((a) => {
                const s = state.stations.find((x) => x.id === a.station_id);
                return (
                  <li key={String(a.id)} className="flex gap-2">
                    <StationDot color={s?.color ?? '#888'} />
                    <span>
                      {!a.public && <Badge tone="warn">rumor</Badge>} {String(a.text)}
                      <span className="block text-xs text-muted">{a.date ? formatDate(String(a.date)) : ''}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
