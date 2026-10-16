// Comercial (seção 10): faturamento vs meta, ocupação, política de preço, cotas e tabela.

import { useEffect, useState } from 'react';
import { Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { nominal } from '@engine/money.ts';
import { useAction } from '../lib/queries.ts';
import { go } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPct, fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Bar, Button, Card, Empty, Stat, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

export function Comercial({ gameId, state }: ScreenProps) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const openProgram = useUI((s) => s.openProgram);
  const f = state.finance;
  const era = state.meta.era;
  const ps = state.stations.find((s) => s.isPlayer)!;
  const lw = f.lastWeek;
  const [tableMult, setTableMult] = useState(f.tableMult);
  const [maxDisc, setMaxDisc] = useState(f.maxDiscount);
  const [adMin, setAdMin] = useState(f.adMinutes);
  useEffect(() => {
    setTableMult(f.tableMult);
    setMaxDisc(f.maxDiscount);
    setAdMin(f.adMinutes);
  }, [f.tableMult, f.maxDiscount, f.adMinutes]);

  const weeks = Math.max(1, state.ytd.weeks);
  const prorated = (f.annualRevenueTarget * weeks) / 52;
  const ratio = state.ytd.weeks > 0 ? f.ytdRevenue / prorated : (lw?.revenue ?? 0) / (f.annualRevenueTarget / 52);
  const idx = nominal(era, 1);
  const chart = ps.history.filter((h) => h.w >= 0).slice(-16).map((h) => ({ w: `S${h.w + 1}`, receita: Math.round((h.rev * idx) / 1e5) / 10, custo: Math.round((h.cost * idx) / 1e5) / 10 }));
  const onAir = state.programs.filter((p) => p.stationId === ps.id && p.status === 'on_air' && p.price30s > 0).sort((a, b) => b.price30s - a.price30s);
  const deals = state.deals.filter((d) => d.status === 'active' && d.endWeek >= state.meta.weekIndex);
  const dirty = tableMult !== f.tableMult || maxDisc !== f.maxDiscount || adMin !== f.adMinutes;
  const active = state.meta.status === 'active';

  const save = async () => {
    const r = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent: { type: 'set_price_policy', tableMult, maxDiscount: maxDisc, adMinutes: adMin } });
    if (r) toast(r.result.ok ? 'success' : 'error', r.result.message);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <h1 className="text-xl font-black sm:text-2xl">Comercial</h1>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Faturamento no ano" value={moneyEra(era, f.ytdRevenue)} sub={`${Math.round(ratio * 100)}% da meta proporcional`} tone={ratio >= 1 ? 'good' : ratio < 0.9 ? 'bad' : 'warn'} tip="Receita acumulada no ano comparada com a meta anual proporcional às semanas jogadas." />
        <Stat label="Margem de programação" value={moneyEra(era, f.ytdRevenue - f.ytdCost)} sub={`meta anual ${moneyEra(era, f.annualMarginTarget)}`} tip="Receita menos custo de programação (produção, direitos, talentos, chamadas e aquisições). A estrutura da emissora fica fora." />
        <Stat label="Ocupação" value={lw ? fmtPct(lw.occupancy * 100) : '—'} sub={lw ? `desconto médio ${fmtPct(lw.avgDiscount * 100)}` : ''} tone={lw && lw.occupancy < 0.7 ? 'bad' : undefined} tip="Parte do inventário de intervalo efetivamente vendida. Depende do preço relativo, sazonalidade, reputação no mercado e do humor do Comercial." />
        <Stat label="Verba de programação" value={moneyEra(era, f.annualBudget)} sub={`por semana ${moneyEra(era, f.annualBudget / 52)}`} tone={f.weeksOverBudget >= 2 ? 'bad' : undefined} tip="Verba anual definida pela presidência. Estourar exige explicações; superar a meta de margem libera verba extra no ano seguinte." />
      </div>
      <Card title="Meta anual de faturamento">
        <Bar value={f.ytdRevenue} max={f.annualRevenueTarget} tone={ratio >= 1 ? 'good' : 'accent'} />
        <div className="mt-1 flex justify-between text-xs text-muted"><span>{moneyEra(era, f.ytdRevenue)}</span><span>meta {moneyEra(era, f.annualRevenueTarget)}</span></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Política comercial">
          <div className="space-y-4">
            <Slider label="Tabela de preços" tip="Multiplica o preço de tabela do 30s de todos os programas. Mais caro = menos inventário vendido." value={tableMult} min={0.7} max={1.4} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setTableMult} disabled={!active} />
            <Slider label="Desconto máximo autorizado" tip="O Comercial pede mais desconto quando a audiência cai. Se o limite for menor que o necessário, a ocupação despenca." value={maxDisc} min={0} max={0.6} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setMaxDisc} disabled={!active} />
            <Slider label="Minutos de intervalo por hora" tip="Padrão de 12 min; até 15 (teto legal de 25% do tempo). Mais intervalo = mais inventário, mas o público foge." value={adMin} min={10} max={15} step={1} fmt={(v) => `${v} min`} onChange={setAdMin} disabled={!active} />
            {active && <Button variant="primary" disabled={!dirty} busy={busy} onClick={save}>Salvar política</Button>}
          </div>
        </Card>
        <Card title="Receita x custo semanal (R$ mi)">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -12, right: 6, top: 6, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="w" stroke="var(--muted)" fontSize={10} />
                <YAxis stroke="var(--muted)" fontSize={10} />
                <Tooltip contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
                <RBar dataKey="receita" name="Receita" fill="var(--good)" />
                <RBar dataKey="custo" name="Custo total" fill="var(--bad)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {lw && (
        <Card title="Extrato da última semana">
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {([
              ['Publicidade', lw.adRevenue, 1], ['Cotas de patrocínio', lw.quota, 1], ['Merchandising', lw.merch, 1], ['Arrendamento', lw.lease, 1], ['Outras receitas', lw.other, 1],
              ['Produção', lw.production, -1], ['Direitos', lw.rights, -1], ['Aquisições', lw.acquisitions, -1], ['Talentos', lw.talent, -1], ['Chamadas (inventário)', lw.promo, -1],
              ['Multas e eventos', lw.fines, -1], ['Compensações de cotas', lw.compensation, -1], ['Estrutura', lw.structure, -1],
            ] as [string, number, number][]).filter(([, v]) => Math.abs(v) > 0).map(([label, v, sign]) => (
              <div key={label} className="flex justify-between border-b border-border/50 py-1">
                <span className="text-muted">{label}</span>
                <span className={`tabular ${sign > 0 ? 'text-good' : 'text-bad'}`}>{sign > 0 ? '+' : '−'} {moneyEra(era, v)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Cotas de patrocínio" action={<Button size="sm" variant="ghost" onClick={() => go(`g/${gameId}/acervo`)}>Ver ofertas →</Button>}>
        {deals.length === 0 ? <p className="text-sm text-muted">Nenhuma cota ativa. Ofertas de cota aparecem no Mercado e em eventos.</p> : (
          <div className="space-y-2">
            {deals.map((d) => {
              const p = state.programs.find((x) => x.id === d.programId);
              const last = p?.stats.at(-1)?.pts ?? 0;
              const ok = last >= d.guaranteedPoints;
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-theme bg-surface-2 px-3 py-2 text-sm">
                  <div>
                    <div className="font-semibold">{d.advertiser} em "{p?.title}"</div>
                    <div className="text-xs text-muted">{moneyEra(era, d.weeklyValue)}/semana até a semana {d.endWeek + 1} · entrega mínima {fmtPts(d.guaranteedPoints)} pts</div>
                  </div>
                  <Badge tone={ok ? 'good' : 'bad'}>{ok ? 'entregando' : `abaixo (${fmtPts(last)})`}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={<Tip text="Preço de tabela do 30s = CPP da faixa × pontos (média de 4 semanas) × qualidade do público × marca. Reajustado a cada trimestre.">Tabela de preços (30s)</Tip>}>
        {onAir.length === 0 ? <Empty title="Sem programas no ar" /> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Programa</th><th className="px-2 py-2 text-right">Pontos</th><th className="px-2 py-2 text-right">Preço 30s</th><th className="px-4 py-2 text-right">Merch</th></tr>
              </thead>
              <tbody>
                {onAir.slice(0, 30).map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-1.5"><button className="text-left hover:underline" onClick={() => openProgram(p.id)}>{p.title}</button></td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtPts(p.stats.at(-1)?.pts)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{moneyEra(era, p.price30s * f.tableMult)}</td>
                    <td className="px-4 py-1.5 text-right">{p.merchLevel ? `nível ${p.merchLevel}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Slider({ label, tip, value, min, max, step, fmt, onChange, disabled }: { label: string; tip: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center"><Tip text={tip}>{label}</Tip></span>
        <span className="tabular font-bold">{fmt(value)}</span>
      </div>
      <input type="range" className="w-full accent-[var(--accent)]" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
