// Boletim do Dia/Semana (seção 20): consolidado, ranking por faixa, praças, manchetes e alertas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MARKETS } from '@engine/catalog/markets.ts';
import { BAND_BY_ID, DAY_SHORT, formatDate } from '@engine/time.ts';
import type { WeekReport } from '@engine/types.ts';
import type { MestreOutput } from '@game/types.ts';
import { invalidateGameData, useAction, useReports } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { go } from '../lib/router.ts';
import { deltaClass, fmtDelta, fmtPct, fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Bar, Button, Card, Empty, Spinner, Stat, StationDot, Tabs, Tip } from '../components/ui.tsx';
import { SceneView } from '../components/SceneView.tsx';
import type { ScreenProps } from './GameShell.tsx';

export function Boletim({ gameId, state }: ScreenProps) {
  const weeks = useReports(gameId, 'week', 30);
  const days = useReports(gameId, 'day', 7);
  const [sel, setSel] = useState<string | null>(null);
  const [scene, setScene] = useState<MestreOutput | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const { run, busy } = useAction(gameId);
  const openProgram = useUI((s) => s.openProgram);
  const setLiveDay = useUI((s) => s.setLiveDay);
  const [marketView, setMarketView] = useState<'24h' | 'nobre'>('nobre');
  const asked = useRef<string | null>(null);

  const rows = weeks.data ?? [];
  const current = rows.find((r) => r.id === sel) ?? rows[0];
  const report = current?.data as WeekReport | undefined;
  const ps = state.stations.find((s) => s.isPlayer)!;
  const nameOf = (id: string) => state.stations.find((s) => s.id === id)?.name ?? '—';
  const colorOf = (id: string) => state.stations.find((s) => s.id === id)?.color ?? '#888';
  const era = state.meta.era;

  // narração do Mestre (uma vez por boletim)
  useEffect(() => {
    if (!current) return;
    setNote(undefined);
    if (current.narrated) {
      setScene({ scene_type: 'boletim', narrative: (current.narrative as MestreOutput['narrative']) ?? [], headlines: (report?.headlines ?? []), choices: [], player_action: null, proposals: [], memory_notes: [] });
      return;
    }
    setScene({ scene_type: 'boletim', narrative: report?.narrative ?? [], headlines: report?.headlines ?? [], choices: [], player_action: null, proposals: [], memory_notes: [] });
    if (asked.current === current.id) return;
    asked.current = String(current.id);
    void (async () => {
      const r = await run<{ scene: MestreOutput; note?: string }>('mestre-scene', { action: 'narrate_report', reportId: current.id }, { silent: true });
      if (r?.scene) {
        setScene(r.scene);
        setNote(r.note);
        invalidateGameData(gameId, ['reports']);
      }
    })();
  }, [current?.id]);

  const dailyChart = useMemo(() => {
    if (!report) return [];
    return report.daily.map((d) => {
      const row: Record<string, number | string> = { dia: DAY_SHORT[d.day] };
      for (const [sid, v] of Object.entries(d.prime)) row[sid] = v;
      return row;
    });
  }, [report]);

  if (weeks.isLoading) return <div className="flex justify-center p-10 text-muted"><Spinner /></div>;

  const liveNow = state.liveMoments.filter((m) => m.day >= state.weekProgress.day);
  const dayRows = (days.data ?? []).filter((d) => Number(d.week_index) === state.meta.weekIndex).sort((a, b) => Number(a.day) - Number(b.day));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Boletim</h1>
          <p className="text-sm text-muted">{report ? `Consolidado de ${formatDate(report.dateFrom)} a ${formatDate(report.dateTo)}` : 'Primeira semana no cargo'}</p>
        </div>
        {rows.length > 1 && (
          <select className="rounded-theme border border-border bg-surface-2 px-3 py-2 text-sm" value={String(current?.id ?? '')} onChange={(e) => setSel(e.target.value)}>
            {rows.map((r) => {
              const d = r.data as WeekReport;
              return <option key={String(r.id)} value={String(r.id)}>Semana de {formatDate(d.dateFrom)}</option>;
            })}
          </select>
        )}
      </div>

      {liveNow.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-theme border border-accent/50 bg-accent/10 p-3 text-sm">
          <span>🎬 <b>Momento ao vivo:</b> {liveNow.map((m) => `${m.reason} (${DAY_SHORT[m.day]})`).join(' · ')}</span>
          {liveNow.some((m) => m.day === state.weekProgress.day) ? (
            <Button size="sm" variant="primary" onClick={() => setLiveDay(state.weekProgress.day)}>Abrir Sala de Controle</Button>
          ) : (
            <span className="text-xs text-muted">Rode dia a dia até lá para comandar a transmissão.</span>
          )}
        </div>
      )}

      {dayRows.length > 0 && (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          {dayRows.map((d) => {
            const r = d.data as WeekReport;
            const mine = r.stations24.find((x) => x.stationId === ps.id);
            const pos = r.stations24.findIndex((x) => x.stationId === ps.id) + 1;
            return (
              <div key={String(d.id)} className="card min-w-36 shrink-0 px-3 py-2">
                <div className="text-xs uppercase text-muted">{DAY_SHORT[r.day ?? 0]} · {formatDate(r.dateFrom)}</div>
                <div className="tabular font-display text-lg font-bold">{fmtPts(mine?.pts)} <span className="text-xs font-normal text-muted">{pos}º</span></div>
                <div className="truncate text-xs text-muted">{r.programs[0]?.title}</div>
              </div>
            );
          })}
        </div>
      )}

      {!report ? (
        <FirstWeek gameId={gameId} state={state} />
      ) : (
        <>
          <KpiRow state={state} report={report} />
          <div className="grid gap-4 lg:grid-cols-5">
            <Card title="Bastidores" className="lg:col-span-3" crt action={busy ? <span className="text-xs text-muted">o Mestre está escrevendo...</span> : null}>
              {scene ? <SceneView scene={scene} state={state} /> : <Spinner />}
              {note && <p className="mt-2 text-xs text-muted">{note}</p>}
              {report.closings.length > 0 && (
                <div className="mt-3 space-y-1 rounded-theme bg-surface-2 p-3 text-sm">
                  {report.closings.map((c, i) => <p key={i}>📌 {c}</p>)}
                </div>
              )}
            </Card>
            <Card title="Ranking da semana" className="lg:col-span-2">
              <RankList title="24 horas" rows={report.stations24} max={report.stations24[0]?.pts ?? 1} nameOf={nameOf} colorOf={colorOf} me={ps.id} />
              <div className="h-3" />
              <RankList title="Horário nobre (18h–0h)" rows={report.stationsPrime} max={report.stationsPrime[0]?.pts ?? 1} nameOf={nameOf} colorOf={colorOf} me={ps.id} />
            </Card>
          </div>

          <Card title={<Tip text="Média de pontos (PNT) de cada emissora em cada faixa, somando segunda a domingo. O líder de cada faixa aparece primeiro.">Ranking por faixa</Tip>}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {report.bands.filter((b) => b.dayType === 'all' || b.band === 'vespertino').map((b) => {
                const myPos = b.ranking.findIndex((x) => x.stationId === ps.id) + 1;
                const leader = b.ranking[0];
                return (
                  <div key={`${b.band}-${b.dayType}`} className="rounded-theme bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{BAND_BY_ID[b.band].name}{b.dayType === 'sunday' ? ' de domingo' : ''}</span>
                      <Badge tone={myPos === 1 ? 'good' : myPos <= 3 ? 'warn' : 'bad'}>{myPos}º</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Líder: <span style={{ color: colorOf(leader?.stationId ?? '') }}>{nameOf(leader?.stationId ?? '')}</span> {fmtPts(leader?.pts)} · você {fmtPts(b.ranking.find((x) => x.stationId === ps.id)?.pts)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Nobre dia a dia">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChart} margin={{ left: -18, right: 6, top: 6, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="dia" stroke="var(--muted)" fontSize={11} />
                    <YAxis stroke="var(--muted)" fontSize={11} />
                    <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v, k) => [fmtPts(Number(v)), nameOf(String(k))]} />
                    <Legend formatter={(v: string) => <span className="text-xs">{nameOf(v)}</span>} />
                    {state.stations.filter((s) => !s.closedWeek).map((s) => (
                      <Line key={s.id} type="monotone" dataKey={s.id} stroke={s.color} strokeWidth={s.isPlayer ? 3 : 1.5} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Mais vistos da semana">
              <ol className="space-y-1">
                {report.topPrograms.slice(0, 10).map((p, i) => (
                  <li key={p.programId} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm ${p.stationId === ps.id ? 'bg-accent/10' : ''}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 text-right text-muted">{i + 1}</span>
                      <StationDot color={colorOf(p.stationId)} />
                      <button className="truncate text-left hover:underline" onClick={() => openProgram(p.programId)}>{p.title}</button>
                    </span>
                    <span className="tabular shrink-0">{fmtPts(p.pts)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <Card title="Seus programas" action={<Button size="sm" variant="ghost" onClick={() => go(`g/${gameId}/grade`)}>Abrir grade →</Button>}>
            {report.programs.length === 0 ? <Empty title="Sem dados" /> : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2">Programa</th>
                      <th className="px-2 py-2">Horário</th>
                      <th className="px-2 py-2 text-right"><Tip text="Média de pontos no PNT (15 praças ponderadas).">Pontos</Tip></th>
                      <th className="px-2 py-2 text-right">Share</th>
                      <th className="px-2 py-2 text-right"><Tip text="Posição média contra as emissoras concorrentes no mesmo horário.">Pos.</Tip></th>
                      <th className="px-4 py-2 text-right"><Tip text="Diferença para a média das 4 semanas anteriores.">Δ 4 sem.</Tip></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.programs.map((p) => (
                      <tr key={p.programId} className="border-t border-border hover:bg-surface-2">
                        <td className="px-4 py-1.5"><button className="text-left font-semibold hover:underline" onClick={() => openProgram(p.programId)}>{p.title}</button></td>
                        <td className="px-2 py-1.5 text-muted">{p.slotLabel}</td>
                        <td className="tabular px-2 py-1.5 text-right font-semibold">{fmtPts(p.pts)}</td>
                        <td className="tabular px-2 py-1.5 text-right">{fmtPct(p.share)}</td>
                        <td className="tabular px-2 py-1.5 text-right">{p.rank}º</td>
                        <td className={`tabular px-4 py-1.5 text-right ${deltaClass(p.delta4w)}`}>{fmtDelta(p.delta4w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={<Tip text="A audiência é calculada separadamente em cada uma das 15 praças medidas; o PNT é a média ponderada pelo tamanho de cada praça. A Grande SP é a referência do mercado publicitário.">Praças</Tip>} action={<Tabs value={marketView} onChange={setMarketView} items={[{ id: 'nobre', label: 'Nobre' }, { id: '24h', label: '24h' }]} />}>
              <div className="space-y-1">
                {report.markets.map((m) => {
                  const vals = marketView === 'nobre' ? m.prime : m.pts;
                  const sorted = Object.entries(vals).sort((a, b) => b[1] - a[1]);
                  const pos = sorted.findIndex(([id]) => id === ps.id) + 1;
                  const mk = MARKETS.find((x) => x.code === m.market);
                  return (
                    <div key={m.market} className="flex items-center justify-between gap-2 text-sm">
                      <span className="w-40 truncate text-muted sm:w-48">{mk?.name ?? m.market}</span>
                      <span className="flex-1"><Bar value={vals[ps.id] ?? 0} max={sorted[0]?.[1] || 1} tone={pos === 1 ? 'good' : 'accent'} /></span>
                      <span className="tabular w-12 text-right">{fmtPts(vals[ps.id])}</span>
                      <span className="w-8 text-right text-xs text-muted">{pos}º</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <div className="space-y-4">
              <Card title="Concorrência">
                {report.competitorMoves.length === 0 ? <p className="text-sm text-muted">Semana calma nos rivais.</p> : (
                  <ul className="space-y-2 text-sm">
                    {report.competitorMoves.map((m, i) => (
                      <li key={i} className="flex gap-2"><StationDot color={colorOf(m.stationId)} /><span>{m.text}</span></li>
                    ))}
                  </ul>
                )}
              </Card>
              {(report.alerts.length > 0 || report.records.length > 0) && (
                <Card title="Alertas e recordes">
                  <ul className="space-y-1.5 text-sm">
                    {report.records.map((r, i) => <li key={`r${i}`} className="text-good">🏆 {r}</li>)}
                    {report.alerts.map((a, i) => <li key={`a${i}`} className={a.level === 'warn' ? 'text-warn' : 'text-muted'}>⚠️ {a.text}</li>)}
                  </ul>
                </Card>
              )}
              {report.finance && (
                <Card title="Dinheiro da semana" action={<Button size="sm" variant="ghost" onClick={() => go(`g/${gameId}/comercial`)}>Comercial →</Button>}>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><div className="text-xs text-muted">Receita</div><div className="tabular font-bold">{moneyEra(era, report.finance.revenue)}</div></div>
                    <div><div className="text-xs text-muted">Custo total</div><div className="tabular font-bold">{moneyEra(era, report.finance.cost)}</div></div>
                    <div><div className="text-xs text-muted">Ocupação</div><div className="tabular font-bold">{fmtPct(report.finance.occupancy * 100)}</div></div>
                    <div><div className="text-xs text-muted">Margem de programação</div><div className={`tabular font-bold ${report.finance.margin >= 0 ? 'text-good' : 'text-bad'}`}>{moneyEra(era, report.finance.margin)}</div></div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiRow({ state, report }: { state: ScreenProps['state']; report: WeekReport }) {
  const ps = state.stations.find((s) => s.isPlayer)!;
  const my24 = report.stations24.find((s) => s.stationId === ps.id);
  const myPrime = report.stationsPrime.find((s) => s.stationId === ps.id);
  const pos24 = report.stations24.findIndex((s) => s.stationId === ps.id) + 1;
  const posPrime = report.stationsPrime.findIndex((s) => s.stationId === ps.id) + 1;
  const k = state.kpis;
  const era = state.meta.era;
  const weeklyTarget = state.finance.annualRevenueTarget / 52;
  const rev = report.finance?.revenue ?? 0;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Média 24h" value={fmtPts(my24?.pts)} sub={`${pos24}º lugar · meta ${fmtPts(state.targets.aud24)}`} tone={my24 && my24.pts >= state.targets.aud24 ? 'good' : undefined} tip="Média de pontos das 24 horas no PNT, de segunda a domingo." />
      <Stat label="Nobre" value={fmtPts(myPrime?.pts)} sub={`${posPrime}º · share ${fmtPct(myPrime?.share)}`} tip="Média das 18h à meia-noite. Share = sua audiência ÷ televisores ligados." />
      <Stat label="Faturamento" value={moneyEra(era, rev)} sub={`meta semanal ${moneyEra(era, weeklyTarget)}`} tone={rev >= weeklyTarget ? 'good' : 'bad'} tip="Receita da semana: publicidade, cotas, merchandising, arrendamento e outras. A meta é a meta anual dividida por 52." />
      <Stat label="Nota da gestão" value={`${k?.score ?? '—'}/100`} sub="avaliação anual: < 40 demite" tone={k && k.score >= 60 ? 'good' : k && k.score < 40 ? 'bad' : 'warn'} tip="Média ponderada: audiência 24h (15%), nobre (20%), posição por faixa (10%), faturamento vs meta (25%), margem (10%), reputação (10%) e capital político (10%)." />
      <Stat label="Capital político" value={String(k?.political ?? '—')} sub={k && k.political < 30 ? 'a presidência está de olho' : 'confiança da casa'} tone={k && k.political < 30 ? 'bad' : undefined} tip="Média ponderada da confiança: presidência (peso 3), Comercial (2), Jornalismo, Artístico e equipe (1 cada)." />
    </div>
  );
}

function RankList({ title, rows, max, nameOf, colorOf, me }: { title: string; rows: { stationId: string; pts: number; share: number }[]; max: number; nameOf: (id: string) => string; colorOf: (id: string) => string; me: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.stationId} className={`rounded-lg px-2 py-1 ${r.stationId === me ? 'bg-accent/10' : ''}`}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="w-4 text-muted">{i + 1}</span><StationDot color={colorOf(r.stationId)} /><span className={`truncate ${r.stationId === me ? 'font-bold' : ''}`}>{nameOf(r.stationId)}</span></span>
              <span className="tabular shrink-0">{fmtPts(r.pts)} <span className="text-xs text-muted">{fmtPct(r.share)}</span></span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${(r.pts / (max || 1)) * 100}%`, background: colorOf(r.stationId) }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FirstWeek({ gameId, state }: ScreenProps) {
  const ps = state.stations.find((s) => s.isPlayer)!;
  const last = ps.history.at(-1);
  const ranking = [...state.stations].filter((s) => !s.closedWeek).sort((a, b) => (b.history.at(-1)?.prime ?? 0) - (a.history.at(-1)?.prime ?? 0));
  const steps = [
    { done: true, text: 'Ler o boletim (você está aqui).' },
    { done: false, text: 'Ler a caixa de entrada: presidente, Bia, Comercial e Pesquisa deixaram recados.', to: 'caixa' },
    { done: false, text: 'Abrir a grade, conhecer o acervo e usar "Simular faixa" no nobre.', to: 'grade' },
    { done: false, text: 'Marcar uma reunião (até 3 por semana, gastam agenda).', to: 'reunioes' },
    { done: false, text: 'Clicar em "Colocar no ar" e acompanhar o primeiro consolidado.' },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Herança da gestão anterior">
        <p className="text-sm text-muted">Média da última semana antes da sua chegada:</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="24 horas" value={fmtPts(last?.pts24)} sub={`meta: ${fmtPts(state.targets.aud24)}`} />
          <Stat label="Nobre" value={fmtPts(last?.prime)} sub={`meta: ${fmtPts(state.targets.prime)}`} />
        </div>
        <div className="mt-3 space-y-1">
          {ranking.map((s, i) => (
            <div key={s.id} className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${s.isPlayer ? 'bg-accent/10 font-bold' : ''}`}>
              <span className="flex items-center gap-2"><span className="w-4 text-muted">{i + 1}</span><StationDot color={s.color} />{s.name}</span>
              <span className="tabular">{fmtPts(s.history.at(-1)?.prime)} <span className="text-xs text-muted">nobre</span></span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm"><b>Meta:</b> {state.targets.description}</p>
      </Card>
      <Card title="Roteiro da Bia para a 1ª semana">
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-good text-black' : 'bg-surface-3 text-muted'}`}>{s.done ? '✓' : i + 1}</span>
              <span className="flex-1">{s.text} {s.to && <button className="text-accent underline-offset-2 hover:underline" onClick={() => go(`g/${gameId}/${s.to}`)}>abrir →</button>}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
