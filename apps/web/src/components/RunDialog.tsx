// "Colocar no ar": valida a grade, escolhe o ritmo (dia, semana, temporada) e roda o motor no servidor.

import { useMemo, useState } from 'react';
import { validateSchedule } from '@engine/validate.ts';
import { DAY_NAMES } from '@engine/time.ts';
import type { GameState, WeekReport } from '@engine/types.ts';
import type { Validation } from '@engine/validate.ts';
import { invalidateGameData, useAction } from '../lib/queries.ts';
import { go } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts } from '../lib/format.ts';
import { Badge, Button, Modal } from './ui.tsx';

interface SimSummary {
  weekClosed: boolean;
  reports: { id: string; kind: string; week: number; day: number | null; data: WeekReport }[];
  notes: string[];
  endGame: { status: string; reason: string } | null;
  daysSimulated: number[];
}

export function RunDialog({ gameId, state }: { gameId: string; state: GameState }) {
  const open = useUI((s) => s.runOpen);
  const setOpen = useUI((s) => s.setRunOpen);
  const setLiveDay = useUI((s) => s.setLiveDay);
  const toast = useUI((s) => s.toast);
  const { run, busy } = useAction(gameId);
  const [mode, setMode] = useState<'day' | 'week' | 'season'>('week');
  const [dayResult, setDayResult] = useState<WeekReport | null>(null);
  const [serverBlock, setServerBlock] = useState<Validation | null>(null);

  const validation = useMemo(() => (open ? validateSchedule(state) : null), [open, state]);
  const blocks = (serverBlock ?? validation)?.issues.filter((i) => i.level === 'block') ?? [];
  const warns = validation?.issues.filter((i) => i.level === 'warn') ?? [];
  const day = state.weekProgress.day;
  const liveToday = state.liveMoments.find((m) => m.day === day && !m.done);
  const ps = state.stations.find((s) => s.isPlayer)!;

  const close = () => {
    setOpen(false);
    setDayResult(null);
    setServerBlock(null);
  };

  const go2 = async () => {
    setServerBlock(null);
    const res = await run<{ blocked: boolean; validation?: Validation; summary?: SimSummary }>('simulate-week', { mode });
    if (!res) return;
    if (res.blocked) {
      setServerBlock(res.validation ?? null);
      return;
    }
    const s = res.summary!;
    invalidateGameData(gameId);
    if (s.endGame) {
      toast('warn', s.endGame.reason);
      close();
      go(`g/${gameId}/carreira`);
      return;
    }
    if (s.weekClosed) {
      toast('success', 'Semana encerrada. O consolidado chegou.');
      close();
      go(`g/${gameId}/boletim`);
      return;
    }
    const dr = s.reports.filter((r) => r.kind === 'day').at(-1);
    setDayResult(dr ? dr.data : null);
  };

  if (!open) return null;
  const myDay = dayResult ? dayResult.stations24.find((x) => x.stationId === ps.id) : null;
  const pos = dayResult ? dayResult.stations24.findIndex((x) => x.stationId === ps.id) + 1 : 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title={dayResult ? `Consolidado de ${DAY_NAMES[dayResult.day ?? 0].toLowerCase()}` : 'Colocar no ar'}
      footer={
        dayResult ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={close}>Voltar ao jogo</Button>
            {state.weekProgress.day < 7 && (
              liveToday ? (
                <Button variant="primary" onClick={() => { close(); setLiveDay(day); }}>🎬 Abrir Sala de Controle ({DAY_NAMES[day].toLowerCase()})</Button>
              ) : (
                <Button variant="primary" busy={busy} onClick={() => { setDayResult(null); void go2(); }}>Próximo dia: {DAY_NAMES[state.weekProgress.day].toLowerCase()}</Button>
              )
            )}
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancelar</Button>
            {liveToday && mode === 'day' ? (
              <Button variant="primary" disabled={blocks.length > 0} onClick={() => { close(); setLiveDay(day); }}>🎬 Abrir Sala de Controle</Button>
            ) : (
              <Button variant="primary" busy={busy} disabled={blocks.length > 0} onClick={go2}>▶ Colocar no ar</Button>
            )}
          </div>
        )
      }
    >
      {dayResult ? (
        <div className="space-y-3">
          <p className="text-sm">
            A <b>{ps.name}</b> marcou <b className="tabular">{fmtPts(myDay?.pts)}</b> pontos nas 24 horas ({pos}º lugar).
          </p>
          <div className="space-y-1">
            {dayResult.programs.slice(0, 8).map((p) => (
              <div key={p.programId} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                <span className="truncate">{p.title}</span>
                <span className="tabular shrink-0 font-semibold">{fmtPts(p.pts)} <span className="text-xs font-normal text-muted">({fmtPts(p.share, 0)}%)</span></span>
              </div>
            ))}
          </div>
          {liveToday && <p className="rounded-theme border border-accent/40 bg-accent/10 p-3 text-sm">Próximo: <b>{liveToday.reason}</b>. Abra a Sala de Controle para acompanhar o minuto a minuto e tomar decisões rápidas.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.length > 0 ? (
            <div className="rounded-theme border border-bad/40 bg-bad/10 p-3">
              <div className="mb-1 font-semibold text-bad">Antes de ir ao ar, resolva:</div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {blocks.slice(0, 8).map((b, i) => <li key={i}>{b.text}</li>)}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => { close(); go(`g/${gameId}/grade`); }}>Abrir grade</Button>
                {blocks.some((b) => b.code === 'evento') && <Button size="sm" onClick={() => { close(); go(`g/${gameId}/caixa`); }}>Abrir caixa de entrada</Button>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Grade validada. {day > 0 ? `A semana está em andamento: faltam ${7 - day} dia(s).` : 'Escolha o ritmo:'}</p>
          )}
          <div className="grid gap-2">
            {(
              [
                ['day', 'Dia a dia (detalhado)', `Roda só ${DAY_NAMES[day]?.toLowerCase() ?? 'o próximo dia'} e mostra o consolidado. Necessário para a Sala de Controle.`],
                ['week', 'Semana inteira', 'Roda até domingo e mostra o boletim e os alertas.'],
                ['season', 'Temporada', 'Simula até 4 semanas, parando em estreias, finais, crises ou decisões pendentes.'],
              ] as const
            ).map(([id, label, text]) => (
              <button key={id} onClick={() => setMode(id)} className={`rounded-theme border p-3 text-left ${mode === id ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>
                <div className="font-semibold">{label}</div>
                <div className="text-xs text-muted">{text}</div>
              </button>
            ))}
          </div>
          {state.liveMoments.filter((m) => m.day >= day).length > 0 && (
            <div className="rounded-theme bg-surface-2 p-3 text-sm">
              <div className="mb-1 font-semibold">🎬 Momentos ao vivo nesta semana</div>
              {state.liveMoments.filter((m) => m.day >= day).map((m, i) => (
                <div key={i} className="text-muted">{DAY_NAMES[m.day]}: {m.reason}</div>
              ))}
              <div className="mt-1 text-xs text-muted">Use o modo dia a dia para comandar a Sala de Controle.</div>
            </div>
          )}
          {warns.length > 0 && (
            <details className="rounded-theme bg-surface-2 p-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                Alertas <Badge tone="warn">{warns.length}</Badge>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {warns.map((w, i) => <li key={i}>{w.text}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
