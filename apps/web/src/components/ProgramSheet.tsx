// Ficha do programa (seção 20): atributos, curva, "vale a pena?", "por que caí?" e ações.

import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GENRES } from '@engine/catalog/genres.ts';
import { explainProgram, FACTOR_LABELS } from '@engine/explain.ts';
import { minuteCurve } from '@engine/live.ts';
import { slotLabelFor } from '@engine/report.ts';
import { DEV_STAGES } from '@engine/market.ts';
import type { GameState } from '@engine/types.ts';
import { useAction } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { go } from '../lib/router.ts';
import { fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Bar, Button, GenreChip, inputClass, Modal, Tip } from './ui.tsx';

const STATUS_LABEL: Record<string, string> = {
  development: 'Em desenvolvimento', ready: 'Pronto (fora do ar)', on_air: 'No ar', hiatus: 'Em hiato', ended: 'Encerrado', archive: 'Acervo / reprise',
};

export function ProgramSheet({ gameId, state }: { gameId: string; state: GameState }) {
  const id = useUI((s) => s.programSheet);
  const close = useUI((s) => s.openProgram);
  const { run, busy } = useAction(gameId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const p = id ? state.programs.find((x) => x.id === id) : undefined;
  const ps = state.stations.find((s) => s.isPlayer)!;
  const mine = p?.stationId === ps.id;
  const era = state.meta.era;
  const explanation = useMemo(() => (p && mine ? explainProgram(state, p.id) : null), [p, mine, state]);
  const curve = useMemo(() => {
    if (!p) return [];
    const minutes = Math.min(240, Math.max(15, p.durStd));
    const c = minuteCurve(GENRES[p.genre].curve, minutes, state.meta.seed);
    const base = p.stats.at(-1)?.pts ?? 0;
    return c.map((v, m) => ({ m, pts: Math.round(base * v * 100) / 100 }));
  }, [p, state.meta.seed]);

  if (!p) return null;
  const g = GENRES[p.genre];
  const station = state.stations.find((s) => s.id === p.stationId);
  const last = p.stats.at(-1);
  const talents = p.talentIds.map((t) => state.npcs.find((n) => n.id === t)).filter(Boolean);
  const myTalents = state.npcs.filter((n) => n.role === 'talento' && n.stationId === ps.id && !p.talentIds.includes(n.id));
  const totalRev = p.totals.revenue;
  const totalCost = p.totals.cost;
  const avgPts = p.stats.length ? p.stats.reduce((s, x) => s + x.pts, 0) / p.stats.length : 0;
  const cpp = avgPts > 0 && p.stats.length ? totalCost / p.stats.length / avgPts : 0;
  const series = p.stats.map((s) => ({ w: `S${s.w + 1}`, pts: s.pts, share: s.share, rev: s.rev, cost: s.cost }));
  const active = state.meta.status === 'active';
  const act = async (intent: Record<string, unknown>) => {
    const r = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent });
    if (r) useUI.getState().toast(r.result.ok ? 'success' : 'error', r.result.message);
  };

  return (
    <Modal open onClose={() => close(null)} title={p.title} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <GenreChip genre={p.genre} />
          <Badge tone={p.status === 'on_air' ? 'good' : p.status === 'ended' ? 'bad' : 'neutral'}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
          {p.isRerun && <Badge>Reprise</Badge>}
          {p.locked && <Badge tone="warn">🔒 Protegido</Badge>}
          <span className="text-sm text-muted">{station?.name} · {slotLabelFor(state, p.id) || 'fora da grade'}</span>
        </div>

        {p.status === 'development' && p.dev && (
          <div className="rounded-theme bg-surface-2 p-3 text-sm">
            <div className="mb-1 font-semibold">Pipeline: {DEV_STAGES[Math.min(5, p.dev.stage)]}</div>
            <Bar value={p.dev.totalWeeks - p.dev.weeksLeft} max={p.dev.totalWeeks} />
            <div className="mt-1 text-xs text-muted">Faltam {p.dev.weeksLeft} semana(s) para estrear.</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mine ? (
            <>
              <Attr label="Qualidade" value={p.quality} tip="Força base de audiência e reputação com a crítica (0-100)." bar />
              <Attr label="Apelo popular" value={p.appeal} tip="Força junto ao público massivo; pode divergir da qualidade (0-100)." bar />
              <Attr label="Buzz" value={Math.round(p.buzz)} tip="Expectativa e repercussão (chamadas, imprensa, redes). Cai 15% por semana." bar />
              <Attr label="Fadiga" value={Math.round(p.fatigue)} tip="Desgaste com o tempo e as reprises. Programa fora do ar descansa." bar tone="bad" />
              <Attr label="Hábito" value={`${p.habitWeeks}/8 sem.`} tip="Semanas seguidas no mesmo horário (satura em 8). Mudar de horário zera." />
              <Attr label="Potencial comercial" value={p.commercial} tip="Facilidade de vender cotas e merchandising." bar />
              <Attr label="Custo por exibição" value={moneyEra(era, p.costPerEp)} tip="Custo de produção ou direitos por episódio padrão. Esticar aumenta proporcionalmente." />
              <Attr label="Tabela 30s" value={moneyEra(era, p.price30s)} tip="Preço de tabela do comercial de 30s, reajustado por trimestre: CPP da faixa × pontos (média 4 semanas) × qualidade do público × marca." />
            </>
          ) : (
            <>
              <Attr label="Última média" value={fmtPts(last?.pts)} tip="Audiência pública divulgada (PNT). Custos e contratos dos rivais não são públicos." />
              <Attr label="Share" value={last ? `${fmtPts(last.share, 0)}%` : '—'} tip="Fatia entre os televisores ligados." />
            </>
          )}
          <Attr label="Classificação" value={p.rating === 'L' ? 'Livre' : `${p.rating} anos`} tip="Livre e 10 anos a qualquer hora; 12 a partir das 20h; 14 das 21h; 16 das 22h; 18 das 23h." />
          <Attr label="Duração" value={`${p.durStd} min`} tip={`Mínimo ${p.durMin} e máximo ${p.durMax} min (pode esticar até +30 min com custo e fadiga).`} />
          {p.episodes.total !== null && <Attr label="Capítulos" value={`${p.episodes.aired}/${p.episodes.total}`} tip="Exibidos / total planejado. Esticar aumenta a fadiga e pode inverter a curva." />}
          {p.rights?.exhibitionsLeft !== null && p.rights?.exhibitionsLeft !== undefined && <Attr label="Exibições restantes" value={String(p.rights.exhibitionsLeft)} tip="Número de exibições que o contrato de direitos ainda permite." />}
        </div>

        {series.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Audiência semanal (PNT)</div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ left: -20, right: 8, top: 6, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="w" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => fmtPts(Number(v))} />
                  <Line type="monotone" dataKey="pts" name="Pontos" stroke="var(--accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {mine && series.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-theme bg-surface-2 p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Vale a pena?</div>
              <dl className="space-y-1 text-sm">
                <Row label="Receita acumulada" value={moneyEra(era, totalRev)} />
                <Row label="Custo acumulado" value={moneyEra(era, totalCost)} />
                <Row label="Margem" value={moneyEra(era, totalRev - totalCost)} tone={totalRev - totalCost >= 0 ? 'good' : 'bad'} />
                <Row label="Custo por ponto (semana)" value={moneyEra(era, cpp)} />
                <Row label="ROI" value={totalCost > 0 ? `${Math.round(((totalRev - totalCost) / totalCost) * 100)}%` : '—'} />
              </dl>
            </div>
            <div className="h-40 rounded-theme bg-surface-2 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series.slice(-10)} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                  <XAxis dataKey="w" stroke="var(--muted)" fontSize={10} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => moneyEra(era, Number(v))} />
                  <RBar dataKey="rev" name="Receita" fill="var(--good)" />
                  <RBar dataKey="cost" name="Custo" fill="var(--bad)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {curve.length > 0 && last && (
          <div>
            <div className="mb-1 flex items-center text-xs font-bold uppercase tracking-wide text-muted">
              <Tip text="Formato típico da curva do gênero aplicado à última média: novela sobe nos minutos finais e cai nos intervalos; futebol cai no intervalo do jogo; auditório tem picos nos quadros fortes.">Curva típica minuto a minuto</Tip>
            </div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                  <XAxis dataKey="m" stroke="var(--muted)" fontSize={10} />
                  <YAxis stroke="var(--muted)" fontSize={10} />
                  <Area type="monotone" dataKey="pts" stroke="var(--accent-2)" fill="var(--accent-2)" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {explanation && (
          <div className="rounded-theme border border-border p-3">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Por que subiu ou caiu?</div>
            <p className="text-sm">{explanation.summary}</p>
            {explanation.changes.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {explanation.changes.map((c) => (
                  <li key={c.label} className="flex justify-between gap-2">
                    <span>{c.label} <span className="text-muted">— {c.text}</span></span>
                    <span className={`tabular shrink-0 ${c.delta > 0 ? 'text-good' : 'text-bad'}`}>{c.delta > 0 ? '+' : ''}{c.delta.toLocaleString('pt-BR')}</span>
                  </li>
                ))}
              </ul>
            )}
            {explanation.current.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted">Peso de cada fator nesta semana</summary>
                <div className="mt-2 grid gap-1">
                  {explanation.current.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-48 shrink-0 text-xs text-muted">{FACTOR_LABELS[i]}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div className={`h-full ${f.value >= 0 ? 'bg-good' : 'bg-bad'}`} style={{ width: `${Math.min(100, Math.abs(f.value) * 45)}%` }} />
                      </div>
                      <span className="tabular w-10 text-right text-xs">{f.value.toLocaleString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {mine && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Talento principal</div>
            {talents.length === 0 && <p className="text-sm text-muted">Nenhum talento escalado.</p>}
            {talents.map((t) => t && (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-theme bg-surface-2 px-3 py-2 text-sm">
                <span>{t.avatar} {t.name} <span className="text-muted">· {t.title}</span></span>
                {active && <Button size="sm" variant="ghost" busy={busy} onClick={() => act({ type: 'unassign_talent', npcId: t.id, programId: p.id })}>Tirar</Button>}
              </div>
            ))}
            {active && myTalents.length > 0 && (
              <select className={inputClass} value="" onChange={(e) => e.target.value && act({ type: 'assign_talent', npcId: e.target.value, programId: p.id })}>
                <option value="">+ Escalar talento da casa...</option>
                {myTalents.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.title}{t.talent?.specialty.includes(p.genre) ? '' : ' (fora da especialidade)'}</option>)}
              </select>
            )}
          </div>
        )}

        {mine && active && (
          <div className="space-y-3 border-t border-border pt-4">
            {['on_air', 'ready', 'archive', 'hiatus'].includes(p.status) && !p.locked && g.group !== 'sistema' && (
              <>
                <Segment label="Chamadas nesta semana" tip="Usa inventário promocional (deixa de vender ~1% do intervalo por nível) e aumenta o buzz. Estreias com chamadas rendem mais." value={p.promo} onChange={(v) => act({ type: 'set_promo', programId: p.id, level: v })} />
                {p.origin !== 'leased' && <Segment label="Merchandising" tip="Ações comerciais dentro do conteúdo: mais receita, menos qualidade percebida e crítica mais dura." value={p.merchLevel} onChange={(v) => act({ type: 'set_merch', programId: p.id, level: v })} />}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {['ready', 'archive', 'on_air', 'hiatus'].includes(p.status) && <Button onClick={() => { close(null); go(`g/${gameId}/grade?place=${p.id}`); }}>🗓️ Colocar na grade</Button>}
              {p.episodes.total !== null && !p.isRerun && p.status !== 'ended' && (
                <>
                  <Button busy={busy} onClick={() => act({ type: 'stretch', programId: p.id, deltaEps: 12 })}>Esticar +12 cap.</Button>
                  <Button busy={busy} onClick={() => act({ type: 'stretch', programId: p.id, deltaEps: -12 })}>Encurtar −12 cap.</Button>
                </>
              )}
              {(p.status === 'ended' || (p.status === 'archive' && !p.isRerun)) && g.group !== 'sistema' && <Button busy={busy} onClick={() => act({ type: 'rerun', programId: p.id })}>Criar reprise</Button>}
              {!p.locked && p.status !== 'ended' && g.group !== 'sistema' && (
                confirmCancel ? (
                  <Button variant="danger" busy={busy} onClick={() => { setConfirmCancel(false); void act({ type: 'cancel_program', programId: p.id }); }}>Confirmar cancelamento</Button>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmCancel(true)}>{p.status === 'development' ? 'Cancelar projeto' : 'Cancelar programa'}</Button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Attr({ label, value, tip, bar, tone }: { label: string; value: number | string; tip: string; bar?: boolean; tone?: 'bad' }) {
  return (
    <div className="rounded-theme bg-surface-2 px-3 py-2">
      <div className="flex items-center text-[10px] font-semibold uppercase tracking-wide text-muted"><Tip text={tip}>{label}</Tip></div>
      <div className="tabular font-display text-lg font-bold">{value}</div>
      {bar && typeof value === 'number' && <Bar value={value} tone={tone === 'bad' ? 'bad' : 'accent'} />}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular font-semibold ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : ''}`}>{value}</dd>
    </div>
  );
}

function Segment({ label, tip, value, onChange }: { label: string; tip: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center text-sm"><Tip text={tip}>{label}</Tip></span>
      <div className="flex gap-1 rounded-theme bg-surface-2 p-1">
        {[0, 1, 2, 3].map((v) => (
          <button key={v} onClick={() => v !== value && onChange(v)} className={`h-8 w-10 rounded-md text-sm font-semibold ${v === value ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'}`}>{v === 0 ? '—' : v}</button>
        ))}
      </div>
    </div>
  );
}
