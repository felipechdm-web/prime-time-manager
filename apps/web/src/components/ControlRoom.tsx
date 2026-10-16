// Sala de Controle (modo ao vivo): minuto a minuto do jogador vs rivais e decisões rápidas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { applyLiveDecisionToValue } from '@engine/live.ts';
import type { LiveSeries } from '@engine/live.ts';
import type { GameState, LiveMoment, WeekReport } from '@engine/types.ts';
import { DAY_NAMES } from '@engine/time.ts';
import { invalidateGameData, useAction } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts } from '../lib/format.ts';
import { Button, Modal, Spinner } from './ui.tsx';

interface LiveResponse {
  series: LiveSeries;
  commentary: { minute: number; text: string }[];
  moment: LiveMoment;
}

export function ControlRoom({ gameId, state }: { gameId: string; state: GameState }) {
  const day = useUI((s) => s.liveDay);
  const setDay = useUI((s) => s.setLiveDay);
  const { run, busy } = useAction(gameId);
  const [data, setData] = useState<LiveResponse | null>(null);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [answered, setAnswered] = useState<number[]>([]);
  const [result, setResult] = useState<WeekReport | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (day === null) return;
    setData(null);
    setMinute(0);
    setDecisions([]);
    setAnswered([]);
    setResult(null);
    setPaused(false);
    void (async () => {
      const r = await run<LiveResponse>('live-mode', { day });
      if (r) setData(r);
      else setDay(null);
    })();
  }, [day]);

  const total = data?.series.minutes.length ?? 0;
  const pendingDecision = data?.series.decisionPoints.findIndex((dp, i) => minute >= dp.minute && !answered.includes(i)) ?? -1;

  useEffect(() => {
    if (!data || paused || pendingDecision >= 0 || minute >= total - 1 || result) return;
    timer.current = window.setTimeout(() => setMinute((m) => Math.min(total - 1, m + 1)), 320 / speed);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [data, minute, paused, pendingDecision, speed, total, result]);

  const chart = useMemo(() => {
    if (!data) return [];
    const s = data.series;
    return s.minutes.slice(0, minute + 1).map((m) => {
      const row: Record<string, number | string> = { m: m.m, clock: m.clock };
      for (const st of s.stations) {
        let v = m.values[st.id] ?? 0;
        if (st.id === s.playerStationId) v = applyLiveDecisionToValue(decisions, m.m, total, v);
        row[st.id] = Math.round(v * 100) / 100;
      }
      return row;
    });
  }, [data, minute, decisions, total]);

  if (day === null) return null;
  const s = data?.series;
  const now = chart.at(-1);
  const ranking = s && now ? [...s.stations].sort((a, b) => Number(now[b.id] ?? 0) - Number(now[a.id] ?? 0)) : [];
  const finished = !!s && minute >= total - 1;
  const comments = data ? data.commentary.filter((c) => c.minute <= minute) : [];

  const finish = async () => {
    if (!data) return;
    const r = await run<{ blocked: boolean; summary?: { reports: { kind: string; data: WeekReport }[] } }>('simulate-week', {
      mode: 'day',
      live: { day: data.moment.day, programId: data.moment.programId, decisions },
    });
    if (r && !r.blocked) {
      invalidateGameData(gameId);
      const dr = r.summary?.reports.filter((x) => x.kind === 'day').at(-1);
      setResult(dr?.data ?? null);
    }
  };

  return (
    <Modal open onClose={() => setDay(null)} title={<span>🎬 Sala de Controle · {DAY_NAMES[day]}</span>} wide
      footer={
        result ? (
          <div className="flex justify-end"><Button variant="primary" onClick={() => setDay(null)}>Fechar</Button></div>
        ) : finished ? (
          <div className="flex justify-end gap-2"><Button variant="primary" busy={busy} onClick={finish}>Fechar o dia e ver o consolidado</Button></div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {[1, 2, 4].map((v) => <Button key={v} size="sm" variant={speed === v ? 'primary' : 'secondary'} onClick={() => setSpeed(v)}>{v}×</Button>)}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setPaused((p) => !p)}>{paused ? '▶ Continuar' : '⏸ Pausar'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setMinute(total - 1)}>Pular para o fim</Button>
            </div>
          </div>
        )
      }
    >
      {!data || !s ? (
        <div className="flex flex-col items-center gap-2 p-8 text-muted"><Spinner /><span>Ligando os monitores...</span></div>
      ) : result ? (
        <div className="space-y-3">
          <p className="text-sm">Consolidado oficial do dia (as decisões ao vivo já estão no número):</p>
          {result.programs.slice(0, 8).map((p) => (
            <div key={p.programId} className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${p.programId === data.moment.programId ? 'bg-accent/15 font-semibold' : 'bg-surface-2'}`}>
              <span className="truncate">{p.title}</span>
              <span className="tabular">{fmtPts(p.pts)} pts · {fmtPts(p.share, 0)}%</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-theme bg-black/40 p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">{data.moment.reason}</div>
                <div className="font-display text-lg font-black">{s.title}</div>
              </div>
              <div className="text-right">
                <div className="tabular font-display text-3xl font-black text-accent">{now?.clock}</div>
                <div className="text-xs text-muted">minuto {minute + 1} de {total} {!finished && !paused && pendingDecision < 0 && <span className="blink text-bad">● AO VIVO</span>}</div>
              </div>
            </div>
            <div className="mt-2 h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ left: -18, right: 6, top: 6, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="clock" stroke="var(--muted)" fontSize={10} minTickGap={24} />
                  <YAxis stroke="var(--muted)" fontSize={10} />
                  <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v, k) => [fmtPts(Number(v)), s.stations.find((x) => x.id === String(k))?.name ?? String(k)]} />
                  {s.breaks.map((b) => <ReferenceLine key={b} x={s.minutes[b]?.clock} stroke="var(--muted)" strokeDasharray="2 4" />)}
                  {s.stations.map((st) => (
                    <Line key={st.id} type="monotone" dataKey={st.id} stroke={st.color} strokeWidth={st.id === s.playerStationId ? 3.5 : 1.5} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ranking.map((st, i) => (
              <div key={st.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${st.id === s.playerStationId ? 'bg-accent/15 font-semibold' : 'bg-surface-2'}`}>
                <span className="flex min-w-0 items-center gap-2"><span className="w-4 text-muted">{i + 1}</span><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: st.color }} /><span className="truncate">{st.name} <span className="font-normal text-muted">· {st.program}</span></span></span>
                <span className="tabular">{fmtPts(Number(now?.[st.id] ?? 0))}</span>
              </div>
            ))}
          </div>
          {pendingDecision >= 0 && (
            <div className="fade-in rounded-theme border-2 border-accent bg-accent/10 p-3">
              <div className="mb-2 font-bold">Decisão rápida! O que você faz?</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {s.decisionPoints[pendingDecision].options.map((o) => (
                  <button key={o.id} onClick={() => { setDecisions((d) => [...d, o.id]); setAnswered((a) => [...a, pendingDecision]); }} className="rounded-theme border border-border bg-surface-2 p-3 text-left hover:border-accent">
                    <div className="text-sm font-semibold">{o.label}</div>
                    <div className="text-xs text-muted">{o.hint}</div>
                  </button>
                ))}
                <button onClick={() => setAnswered((a) => [...a, pendingDecision])} className="rounded-theme border border-border bg-surface-2 p-3 text-left text-sm text-muted hover:border-muted">Manter como está</button>
              </div>
            </div>
          )}
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {comments.slice().reverse().map((c, i) => (
              <p key={i} className="fade-in text-sm"><span className="tabular mr-2 font-bold text-accent">{c.minute}'</span>{c.text}</p>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
