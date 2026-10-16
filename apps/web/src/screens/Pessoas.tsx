// Pessoas (seção 12): fichas dos NPCs, humor, confiança, contratos, memórias e capital político.

import { useState } from 'react';
import { politicalCapital } from '@engine/state.ts';
import type { Npc } from '@engine/types.ts';
import { useAction, useRows } from '../lib/queries.ts';
import { go } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { moneyEra } from '../lib/format.ts';
import { Avatar, Badge, Bar, Button, Card, Empty, Modal, moodLabel, Tabs, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

export function Pessoas({ gameId, state }: ScreenProps) {
  const [tab, setTab] = useState<'casa' | 'talentos'>('casa');
  const [sel, setSel] = useState<string | null>(null);
  const ps = state.stations.find((s) => s.isPlayer)!;
  const staff = state.npcs.filter((n) => n.stationId === ps.id && n.role !== 'talento');
  const talents = state.npcs.filter((n) => n.stationId === ps.id && n.role === 'talento');
  const pol = politicalCapital(state);
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black sm:text-2xl">Pessoas</h1>
        <Tabs value={tab} onChange={setTab} items={[{ id: 'casa', label: `Diretoria (${staff.length})` }, { id: 'talentos', label: `Talentos (${talents.length})` }]} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted"><Tip text="Média ponderada da confiança: presidência (peso 3), Comercial (2), Jornalismo (1), Artístico (1) e equipe (1). Abaixo de 30 a presidência cogita substituir você; abaixo de 15, a demissão é avaliada na reunião trimestral.">Capital político</Tip></div>
            <div className={`tabular font-display text-3xl font-black ${pol < 30 ? 'text-bad' : pol >= 60 ? 'text-good' : ''}`}>{pol}</div>
          </div>
          <div className="min-w-48 flex-1"><Bar value={pol} tone={pol < 30 ? 'bad' : pol >= 60 ? 'good' : 'warn'} /></div>
        </div>
      </Card>
      {tab === 'casa' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((n) => <NpcCard key={n.id} n={n} onOpen={() => setSel(n.id)} />)}
        </div>
      ) : talents.length === 0 ? (
        <Empty title="Nenhum talento contratado">Contrate no Mercado (Acervo e Mercado → Talento).</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {talents.map((n) => <NpcCard key={n.id} n={n} onOpen={() => setSel(n.id)} contract={state.contracts.find((c) => c.id === n.contractId && c.status === 'active')} era={state.meta.era} week={state.meta.weekIndex} programs={state.programs.filter((p) => p.talentIds.includes(n.id)).map((p) => p.title)} />)}
        </div>
      )}
      <NpcModal gameId={gameId} state={state} id={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function NpcCard({ n, onOpen, contract, era, week, programs }: { n: Npc; onOpen: () => void; contract?: { salaryWeekly: number; endWeek: number }; era?: ScreenProps['state']['meta']['era']; week?: number; programs?: string[] }) {
  const left = contract && week !== undefined ? contract.endWeek - week : null;
  return (
    <button onClick={onOpen} className="card flex flex-col gap-3 p-3 text-left hover:border-accent">
      <div className="flex items-center gap-3">
        <Avatar emoji={n.avatar} name={n.name} mood={n.mood} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{n.name}</div>
          <div className="truncate text-xs text-muted">{n.title}</div>
        </div>
        {n.requests.length > 0 && <Badge tone="warn">pedido</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <Meter label={`Humor: ${moodLabel(n.mood)}`} value={(n.mood + 100) / 2} tone={n.mood < -20 ? 'bad' : n.mood > 20 ? 'good' : 'warn'} />
        <Meter label={`Confiança ${Math.round(n.trust)}`} value={n.trust} />
        <Meter label={`Lealdade ${Math.round(n.loyalty)}`} value={n.loyalty} />
        <Meter label={`Paciência ${Math.round(n.patience)}`} value={n.patience} />
      </div>
      {contract && era && (
        <div className="text-xs text-muted">
          {moneyEra(era, contract.salaryWeekly)}/semana · contrato {left !== null && left <= 8 ? <span className="font-semibold text-warn">vence em {left} sem.</span> : `até a semana ${contract.endWeek + 1}`}
        </div>
      )}
      {programs && programs.length > 0 && <div className="truncate text-xs text-muted">Em: {programs.join(', ')}</div>}
    </button>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div>
      <div className="mb-0.5 text-muted">{label}</div>
      <Bar value={value} tone={tone ?? 'accent'} />
    </div>
  );
}

function NpcModal({ gameId, state, id, onClose }: ScreenProps & { id: string | null; onClose: () => void }) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const [confirmFire, setConfirmFire] = useState(false);
  const memories = useRows(['memories', gameId, id], 'npc_memories', { game_id: gameId, npc_id: id ?? '' }, { order: 'id', ascending: false, limit: 20 }, !!id);
  const n = id ? state.npcs.find((x) => x.id === id) : undefined;
  if (!n) return null;
  const era = state.meta.era;
  const contract = state.contracts.find((c) => c.id === n.contractId && c.status === 'active');
  const act = async (intent: Record<string, unknown>) => {
    const r = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent });
    if (r) toast(r.result.ok ? 'success' : 'error', r.result.message);
  };
  const active = state.meta.status === 'active';
  return (
    <Modal open onClose={() => { setConfirmFire(false); onClose(); }} title={`${n.avatar} ${n.name}`}>
      <div className="space-y-4 text-sm">
        <div className="text-muted">{n.title} · {n.age} anos</div>
        <p>{n.sheet.bio}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-theme bg-surface-2 p-3"><div className="text-xs font-semibold uppercase text-muted">Quer</div>{n.sheet.main_goal}</div>
          <div className="rounded-theme bg-surface-2 p-3"><div className="text-xs font-semibold uppercase text-muted">Linha vermelha</div>{n.sheet.red_line}</div>
        </div>
        <div className="text-xs text-muted">Estilo: {n.sheet.speech_style.join(', ')}{n.sheet.catchphrases[0] ? ` · "${n.sheet.catchphrases[0]}"` : ''}</div>
        {n.talent && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-theme bg-surface-2 p-2"><div className="text-muted">Carisma</div><div className="text-base font-bold">{n.talent.carisma}</div></div>
            <div className="rounded-theme bg-surface-2 p-2"><div className="text-muted">Popularidade</div><div className="text-base font-bold">{n.talent.popularity}</div></div>
            <div className="rounded-theme bg-surface-2 p-2"><div className="text-muted">Ego</div><div className="text-base font-bold">{n.talent.ego}</div></div>
          </div>
        )}
        {n.requests.length > 0 && (
          <div className="rounded-theme border border-warn/40 bg-warn/10 p-3">
            <div className="font-semibold text-warn">Pedidos em aberto</div>
            {n.requests.map((r) => <div key={r.id}>{r.text} (até a semana {r.dueWeek + 1})</div>)}
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">O que {n.name.split(' ')[0]} lembra de você</div>
          {(memories.data ?? []).length === 0 ? <p className="text-muted">Nada marcante ainda.</p> : (
            <ul className="space-y-1">
              {(memories.data ?? []).map((m) => <li key={String(m.id)} className="rounded-lg bg-surface-2 px-3 py-1.5">{'★'.repeat(Number(m.weight))} {String(m.fact)}</li>)}
            </ul>
          )}
        </div>
        {contract && (
          <div className="rounded-theme bg-surface-2 p-3">
            <div className="font-semibold">Contrato</div>
            <div className="text-muted">{moneyEra(era, contract.salaryWeekly)} por semana · até a semana {contract.endWeek + 1} · multa rescisória {moneyEra(era, contract.terminationFee)}{contract.guaranteed ? ' · horário garantido em contrato' : ''}</div>
          </div>
        )}
        {active && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => { onClose(); go(`g/${gameId}/reunioes?npc=${n.id}`); }}>Marcar reunião</Button>
            {contract && <Button busy={busy} onClick={() => act({ type: 'renew_contract', npcId: n.id, weeks: 52 })}>Renovar por 1 ano</Button>}
            {contract && <Button busy={busy} onClick={() => act({ type: 'renew_contract', npcId: n.id, weeks: 104 })}>Renovar por 2 anos</Button>}
            {n.role === 'talento' && (confirmFire ? (
              <Button variant="danger" busy={busy} onClick={() => { setConfirmFire(false); void act({ type: 'fire_talent', npcId: n.id }).then(onClose); }}>Confirmar demissão ({moneyEra(era, contract?.terminationFee ?? 0)})</Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirmFire(true)}>Demitir</Button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
