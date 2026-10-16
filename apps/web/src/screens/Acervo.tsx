// Acervo e Mercado (seção 8.3): programas próprios, desenvolvimento, compras, formatos, talentos, cotas e leilões.

import { useState } from 'react';
import { GENRES } from '@engine/catalog/genres.ts';
import { DEV_STAGES } from '@engine/market.ts';
import { lockLabel } from '@engine/catalogWorld.ts';
import type { MarketOffer, Program } from '@engine/types.ts';
import { useAction } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Bar, Button, Card, Empty, GenreChip, inputClass, Modal, Tabs, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

const KIND_LABEL: Record<MarketOffer['kind'], string> = {
  enlatado: 'Enlatado',
  filmes: 'Pacote de filmes',
  formato: 'Formato internacional',
  projeto: 'Produção própria',
  coproducao: 'Coprodução',
  esporte: 'Direitos esportivos',
  arrendamento: 'Arrendamento',
  talento: 'Talento',
  cota: 'Cota de patrocínio',
  leilao: 'Leilão',
};

const GROUPS: { id: string; label: string; filter: (p: Program) => boolean }[] = [
  { id: 'on_air', label: 'No ar', filter: (p) => p.status === 'on_air' },
  { id: 'ready', label: 'Prontos', filter: (p) => p.status === 'ready' || p.status === 'hiatus' },
  { id: 'development', label: 'Em desenvolvimento', filter: (p) => p.status === 'development' },
  { id: 'archive', label: 'Reprises', filter: (p) => p.status === 'archive' },
  { id: 'ended', label: 'Encerrados', filter: (p) => p.status === 'ended' },
];

export function Acervo({ gameId, state }: ScreenProps) {
  const [tab, setTab] = useState<'acervo' | 'mercado'>('acervo');
  const [group, setGroup] = useState('on_air');
  const [q, setQ] = useState('');
  const openProgram = useUI((s) => s.openProgram);
  const ps = state.stations.find((s) => s.isPlayer)!;
  const era = state.meta.era;
  const mine = state.programs.filter((p) => p.stationId === ps.id && GENRES[p.genre].group !== 'sistema');
  const g = GROUPS.find((x) => x.id === group)!;
  const list = mine.filter(g.filter).filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || GENRES[p.genre].name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black sm:text-2xl">Acervo e Mercado</h1>
        <Tabs value={tab} onChange={setTab} items={[{ id: 'acervo', label: `Acervo (${mine.length})` }, { id: 'mercado', label: `Mercado (${state.offers.length})` }]} />
      </div>
      {tab === 'acervo' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Tabs value={group} onChange={setGroup} items={GROUPS.map((x) => ({ id: x.id, label: `${x.label} (${mine.filter(x.filter).length})` }))} />
            <input className={`${inputClass} sm:max-w-xs`} placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.length === 0 ? (
            <Empty title="Nada por aqui">{group === 'development' ? 'Aprove projetos no Mercado para começar a produzir.' : 'Mude o filtro ou visite o Mercado.'}</Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => {
                const last = p.stats.at(-1);
                return (
                  <button key={p.id} onClick={() => openProgram(p.id)} className="card flex flex-col gap-2 p-3 text-left hover:border-accent">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold leading-tight">{p.title}</span>
                      {p.locked && <span title="Protegido">🔒</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GenreChip genre={p.genre} small />
                      {p.isRerun && <Badge>reprise</Badge>}
                      {p.catalogTitleId && <Badge>título real</Badge>}
                      {p.origin === 'leased' && <Badge tone="warn">arrendado</Badge>}
                      <span className="text-[11px] text-muted">{p.durStd} min</span>
                    </div>
                    {p.status === 'development' && p.dev ? (
                      <div>
                        <div className="mb-1 text-xs text-muted">{DEV_STAGES[Math.min(5, p.dev.stage)]} · faltam {p.dev.weeksLeft} sem.</div>
                        <Bar value={p.dev.totalWeeks - p.dev.weeksLeft} max={p.dev.totalWeeks} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <span><span className="text-muted">Q</span> {p.quality}</span>
                        <span><span className="text-muted">A</span> {p.appeal}</span>
                        <span className="text-right">{last ? `${fmtPts(last.pts)} pts` : p.origin === 'leased' ? moneyEra(era, p.leaseWeeklyPerHour) + '/h' : moneyEra(era, p.costPerEp)}</span>
                      </div>
                    )}
                    {p.episodes.total !== null && p.status !== 'development' && <div className="text-[11px] text-muted">Capítulos: {p.episodes.aired}/{p.episodes.total}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <Market gameId={gameId} state={state} />
      )}
    </div>
  );
}

function Market({ gameId, state }: ScreenProps) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const [kind, setKind] = useState<'todos' | MarketOffer['kind']>('todos');
  const [confirm, setConfirm] = useState<MarketOffer | null>(null);
  const [bid, setBid] = useState('');
  const era = state.meta.era;
  const lw = state.finance.lastWeek;
  // ordem fixa das abas (a do catálogo), para não trocarem de lugar quando ofertas somem
  const present = new Set(state.offers.map((o) => o.kind));
  const kinds = (Object.keys(KIND_LABEL) as MarketOffer['kind'][]).filter((k) => present.has(k));
  const shown = kind !== 'todos' && !present.has(kind) ? 'todos' : kind;
  const offers = state.offers.filter((o) => shown === 'todos' || o.kind === shown);
  const active = state.meta.status === 'active';

  const buy = async (o: MarketOffer, amount?: number) => {
    const r = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent: { type: 'buy_offer', offerId: o.id, bid: amount } });
    if (r) toast(r.result.ok ? 'success' : 'error', r.result.message);
    setConfirm(null);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="card px-3 py-2 text-sm">
          <div className="text-xs text-muted">Verba de programação (semana)</div>
          <div className="tabular font-bold">{moneyEra(era, state.finance.annualBudget / 52)}</div>
        </div>
        <div className="card px-3 py-2 text-sm">
          <div className="text-xs text-muted">Gasto de programação na última semana</div>
          <div className="tabular font-bold">{lw ? moneyEra(era, lw.production + lw.rights + lw.talent + lw.promo + lw.acquisitions) : '—'}</div>
        </div>
        <div className="card flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <div>
            <div className="flex items-center text-xs text-muted"><Tip text="A faixa de qualidade e apelo que você vê no mercado fica mais estreita quanto mais precisa for a pesquisa.">Precisão da pesquisa</Tip></div>
            <div className="tabular font-bold">{state.research.precision}%</div>
          </div>
          {active && <Button size="sm" busy={busy} onClick={() => run('apply-intent', { intent: { type: 'invest_research' } }).then((r) => r && toast('success', (r as { result: { message: string } }).result.message))}>Investir</Button>}
        </div>
      </div>
      <Tabs value={shown} onChange={setKind} items={[{ id: 'todos' as const, label: 'Tudo' }, ...kinds.map((k) => ({ id: k, label: KIND_LABEL[k] }))]} />
      {offers.length === 0 ? <Empty title="Mercado vazio">Novas ofertas chegam toda semana.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {offers.map((o) => (
            <Card key={o.id} className={o.special ? 'border-accent/60' : ''}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={o.special ? 'accent' : 'neutral'}>{KIND_LABEL[o.kind]}</Badge>
                  {o.genre && o.kind !== 'cota' && o.kind !== 'talento' && <GenreChip genre={o.genre} small />}
                  {o.catalogTitleId && <Badge>título real</Badge>}
                  {o.lockedBy && <Badge tone="warn">🔒 {lockLabel(o.lockedBy)}</Badge>}
                  <span className="ml-auto text-[11px] text-muted">expira na semana {o.expiresWeek + 1}</span>
                </div>
                <div className="font-bold leading-tight">{o.title}</div>
                <p className="text-sm text-muted">{o.description}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {o.kind !== 'cota' && o.kind !== 'arrendamento' && o.kind !== 'leilao' && (
                    <>
                      <span className="text-muted">{o.kind === 'talento' ? 'Carisma' : 'Qualidade estimada'}</span>
                      <span className="tabular text-right">{o.quality[0] === o.quality[1] ? o.quality[0] : `${o.quality[0]}–${o.quality[1]}`}</span>
                      <span className="text-muted">{o.kind === 'talento' ? 'Popularidade' : 'Apelo estimado'}</span>
                      <span className="tabular text-right">{o.appeal[0] === o.appeal[1] ? o.appeal[0] : `${o.appeal[0]}–${o.appeal[1]}`}</span>
                    </>
                  )}
                  {o.price > 0 && o.kind !== 'leilao' && (<><span className="text-muted">{o.kind === 'talento' ? 'Luvas (assinatura)' : o.kind === 'projeto' || o.kind === 'coproducao' ? 'Desenvolvimento' : 'Pagamento inicial'}</span><span className="tabular text-right">{moneyEra(era, o.price)}</span></>)}
                  {o.costPerEp > 0 && o.kind !== 'arrendamento' && (<><span className="text-muted">{o.kind === 'talento' ? 'Salário semanal' : 'Custo por exibição'}</span><span className="tabular text-right">{moneyEra(era, o.costPerEp)}</span></>)}
                  {o.kind === 'arrendamento' && (<><span className="text-muted">Receita por hora</span><span className="tabular text-right text-good">{moneyEra(era, o.costPerEp)}</span></>)}
                  {o.kind === 'cota' && (<><span className="text-muted">Receita semanal</span><span className="tabular text-right text-good">{moneyEra(era, o.weeklyValue ?? 0)}</span><span className="text-muted">Entrega mínima</span><span className="tabular text-right">{fmtPts(o.guaranteedPoints)} pts</span></>)}
                  {o.weeksToAir > 0 && o.kind !== 'cota' && (<><span className="text-muted">Prazo até ir ao ar</span><span className="tabular text-right">{o.weeksToAir} sem.</span></>)}
                  {o.episodes && (<><span className="text-muted">Episódios</span><span className="tabular text-right">{o.episodes}</span></>)}
                  {o.exhibitions && o.kind !== 'enlatado' && (<><span className="text-muted">Exibições</span><span className="tabular text-right">{o.exhibitions}</span></>)}
                  {o.auction && (<><span className="text-muted">Lance mínimo</span><span className="tabular text-right">{moneyEra(era, o.auction.minBid)}</span><span className="text-muted">Seu lance</span><span className="tabular text-right">{o.auction.playerBid ? moneyEra(era, o.auction.playerBid) : '—'}</span></>)}
                </div>
                {active && (
                  o.lockedBy ? (
                    <p className="rounded border border-border px-3 py-2 text-center text-xs text-muted">Não está à venda: {lockLabel(o.lockedBy)}.</p>
                  ) : o.kind === 'leilao' ? (
                    <div className="flex gap-2">
                      <input className={inputClass} inputMode="decimal" placeholder="Lance em milhões de R$" value={bid} onChange={(e) => setBid(e.target.value)} />
                      <Button variant="primary" busy={busy} onClick={() => {
                        const v = parseFloat(bid.replace(',', '.'));
                        if (!isFinite(v) || v <= 0) return toast('error', 'Digite o valor em milhões.');
                        void buy(o, v * 1e6);
                      }}>Dar lance</Button>
                    </div>
                  ) : (
                    <Button variant="primary" full onClick={() => setConfirm(o)}>
                      {o.kind === 'projeto' || o.kind === 'coproducao' || o.kind === 'formato' ? 'Aprovar e produzir' : o.kind === 'talento' ? 'Contratar' : o.kind === 'cota' ? 'Fechar a cota' : o.kind === 'arrendamento' ? 'Aceitar arrendamento' : 'Comprar'}
                    </Button>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirmar"
        footer={<div className="flex justify-end gap-2"><Button onClick={() => setConfirm(null)}>Cancelar</Button><Button variant="primary" busy={busy} onClick={() => confirm && buy(confirm)}>Confirmar</Button></div>}
      >
        {confirm && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">{confirm.title}</p>
            {confirm.price > 0 && <p>Desembolso agora: <b>{moneyEra(era, confirm.price)}</b> (entra no custo de programação desta semana).</p>}
            {confirm.kind === 'arrendamento' && <p className="text-warn">A faixa arrendada sai do seu controle: pesa na reputação e na herança de público. O programa entra no acervo para você posicionar na grade.</p>}
            {confirm.kind === 'cota' && <p className="text-warn">Se o programa entregar menos que {fmtPts(confirm.guaranteedPoints)} pontos, a emissora paga compensação. O programa precisa ficar no ar.</p>}
            {(confirm.kind === 'projeto' || confirm.kind === 'formato' || confirm.kind === 'coproducao') && <p className="text-muted">A qualidade final só se confirma na estreia: a faixa mostrada é a estimativa da pesquisa.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
