// Caixa de entrada (seção 6.1): mensagens dos personagens no formato da era, eventos com decisão e pedidos de reunião.

import { useEffect, useMemo, useState } from 'react';
import { formatDate } from '@engine/time.ts';
import type { GameEvent, GameState } from '@engine/types.ts';
import type { MestreOutput } from '@game/types.ts';
import { backendSync } from '../lib/backend.ts';
import { invalidateGameData, queryClient, useAction, useInbox } from '../lib/queries.ts';
import { go } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { Badge, Button, Empty, Spinner, Tabs } from '../components/ui.tsx';
import { SceneView, speakerInfo } from '../components/SceneView.tsx';
import type { ScreenProps } from './GameShell.tsx';

type Msg = {
  id: string;
  from_npc: string | null;
  subject: string;
  body: string;
  kind: string;
  requires_action: boolean;
  event_id: string | null;
  read: boolean;
  game_date: string;
  created_at: string;
};

const KIND_ICON: Record<string, string> = { evento: '⚡', alerta: '⚠️', pedido: '📅', mensagem: '✉️', imprensa: '📰', sistema: '⚙️' };

export function Inbox({ gameId, state }: ScreenProps) {
  const inbox = useInbox(gameId);
  const [filter, setFilter] = useState<'todas' | 'acao' | 'nao_lidas'>('todas');
  const [sel, setSel] = useState<string | null>(null);
  const msgs = (inbox.data ?? []) as unknown as Msg[];
  const evById = useMemo(() => new Map(state.events.map((e) => [e.id, e])), [state.events]);
  const pendingEv = (m: Msg) => !!m.event_id && evById.has(m.event_id) && !evById.get(m.event_id)!.resolved;
  const list = msgs.filter((m) => (filter === 'acao' ? pendingEv(m) || (m.requires_action && !m.read) : filter === 'nao_lidas' ? !m.read : true));
  const current = msgs.find((m) => m.id === sel) ?? null;

  useEffect(() => {
    if (current && !current.read) {
      void backendSync().markRead(current.id).then(() => queryClient.invalidateQueries({ queryKey: ['inbox', gameId] }));
    }
  }, [current?.id]);

  const orphanEvents = state.events.filter((e) => !e.resolved && !msgs.some((m) => m.event_id === e.id));

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col p-3 sm:p-4 lg:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black sm:text-2xl">Caixa de entrada</h1>
        <Tabs value={filter} onChange={setFilter} items={[{ id: 'todas', label: 'Todas' }, { id: 'acao', label: `Exigem ação (${state.events.filter((e) => !e.resolved).length})` }, { id: 'nao_lidas', label: 'Não lidas' }]} />
      </div>
      {inbox.isLoading ? <div className="flex justify-center p-8 text-muted"><Spinner /></div> : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[360px_1fr]">
          <div className={`${current ? 'hidden lg:block' : ''} space-y-1.5`}>
            {orphanEvents.map((e) => (
              <button key={e.id} onClick={() => setSel(`ev:${e.id}`)} className="card w-full p-3 text-left hover:border-accent">
                <div className="flex items-center gap-2 text-sm font-bold">⚡ {e.title} {e.blocking && <Badge tone="bad">trava o "no ar"</Badge>}</div>
              </button>
            ))}
            {list.length === 0 && orphanEvents.length === 0 && <Empty title="Nada por aqui" />}
            {list.map((m) => {
              const sp = m.from_npc ? speakerInfo(state, m.from_npc) : { name: 'Sistema', avatar: '⚙️', title: '' };
              const ev = m.event_id ? evById.get(m.event_id) : undefined;
              return (
                <button key={m.id} onClick={() => setSel(m.id)} className={`card w-full p-3 text-left transition hover:border-accent ${sel === m.id ? 'border-accent' : ''} ${!m.read ? 'bg-surface-2' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-lg">{sp.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${!m.read ? 'font-bold' : 'font-semibold'}`}>{KIND_ICON[m.kind] ?? '✉️'} {m.subject}</span>
                        {!m.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      </div>
                      <div className="truncate text-xs text-muted">{sp.name} · {formatDate(m.game_date)}</div>
                      {ev && !ev.resolved && <div className="mt-1 flex gap-1"><Badge tone={ev.blocking ? 'bad' : 'warn'}>{ev.blocking ? 'Decisão obrigatória' : `Responder até a semana ${ev.deadlineWeek + 1}`}</Badge></div>}
                      {ev?.resolved && <div className="mt-1"><Badge tone="good">Resolvido</Badge></div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className={`${current || sel?.startsWith('ev:') ? '' : 'hidden lg:block'} min-h-0`}>
            {sel?.startsWith('ev:') ? (
              <div className="card p-4">
                <Button size="sm" variant="ghost" className="mb-2 lg:hidden" onClick={() => setSel(null)}>← Voltar</Button>
                <EventPanel gameId={gameId} state={state} event={evById.get(sel.slice(3))} />
              </div>
            ) : current ? (
              <MessageDetail gameId={gameId} state={state} msg={current} event={current.event_id ? evById.get(current.event_id) : undefined} onBack={() => setSel(null)} />
            ) : (
              <Empty title="Selecione uma mensagem">Assuntos com ⚡ pedem uma decisão; os que travam o "Colocar no ar" aparecem em vermelho.</Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageDetail({ gameId, state, msg, event, onBack }: { gameId: string; state: GameState; msg: Msg; event?: GameEvent; onBack: () => void }) {
  const sp = msg.from_npc ? speakerInfo(state, msg.from_npc) : { name: 'Sistema', avatar: '⚙️', title: '' };
  const npc = msg.from_npc ? state.npcs.find((n) => n.id === msg.from_npc) : undefined;
  return (
    <div className="card space-y-4 p-4">
      <Button size="sm" variant="ghost" className="lg:hidden" onClick={onBack}>← Voltar</Button>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xl">{sp.avatar}</span>
        <div>
          <h2 className="text-lg font-bold leading-tight">{msg.subject}</h2>
          <div className="text-xs text-muted">{sp.name}{sp.title ? ` · ${sp.title}` : ''} · {formatDate(msg.game_date)}</div>
        </div>
      </div>
      {event ? <EventPanel gameId={gameId} state={state} event={event} /> : <p className="whitespace-pre-line text-sm leading-relaxed">{msg.body}</p>}
      {msg.kind === 'pedido' && npc && state.meta.status === 'active' && (
        <Button variant="primary" onClick={() => go(`g/${gameId}/reunioes?npc=${npc.id}`)}>📅 Marcar reunião com {npc.name.split(' ')[0]}</Button>
      )}
    </div>
  );
}

const narrated = new Map<string, MestreOutput>();

function EventPanel({ gameId, state, event }: { gameId: string; state: GameState; event?: GameEvent }) {
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const [scene, setScene] = useState<MestreOutput | null>(event ? narrated.get(event.id) ?? null : null);
  const [epilogue, setEpilogue] = useState<MestreOutput | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!event || event.resolved || narrated.has(event.id)) return;
    setLoading(true);
    void run<{ scene: MestreOutput }>('mestre-scene', { action: 'narrate_event', eventId: event.id }, { silent: true }).then((r) => {
      if (r?.scene) {
        narrated.set(event.id, r.scene);
        setScene(r.scene);
      }
      setLoading(false);
    });
  }, [event?.id]);

  if (!event) return <Empty title="Evento não encontrado">Ele pode ter expirado e sido resolvido por padrão.</Empty>;

  const base: MestreOutput = scene ?? { scene_type: 'evento', narrative: [{ speaker: event.speaker && state.npcs.some((n) => n.id === event.speaker) ? event.speaker : 'narrador', text: event.scene }], headlines: [], choices: [], player_action: null, proposals: [], memory_notes: [] };
  const choose = async (optionId: string) => {
    const r = await run<{ result: { optionLabel: string; summary: string; outcome: string }; epilogue: MestreOutput | null }>('resolve-event', { eventId: event.id, optionId }, { invalidate: ['inbox'] });
    if (r) {
      toast('success', `${r.result.optionLabel}${r.result.summary ? ` — ${r.result.summary}` : ''}`);
      setEpilogue(r.epilogue);
      invalidateGameData(gameId, ['inbox']);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={event.severity === 'grave' ? 'bad' : event.severity === 'medio' ? 'warn' : 'neutral'}>{event.severity === 'grave' ? 'Crise grave' : event.severity === 'medio' ? 'Assunto importante' : 'Assunto leve'}</Badge>
        {event.blocking && !event.resolved && <Badge tone="bad">Precisa de resposta antes de colocar no ar</Badge>}
        {loading && <span className="flex items-center gap-1 text-xs text-muted"><Spinner small /> o Mestre está escrevendo a cena...</span>}
      </div>
      <SceneView scene={base} state={state} />
      {event.resolved ? (
        <div className="rounded-theme border border-good/40 bg-good/10 p-3 text-sm">
          <b>{event.outcome}</b>
          {epilogue && <div className="mt-2"><SceneView scene={epilogue} state={state} compact /></div>}
        </div>
      ) : state.meta.status === 'active' ? (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Sua decisão</div>
          {event.options.map((o) => {
            const label = scene?.choices.find((c) => c.id === o.id)?.label ?? o.label;
            return (
              <button key={o.id} disabled={busy} onClick={() => choose(o.id)} className="w-full rounded-theme border border-border bg-surface-2 p-3 text-left transition hover:border-accent disabled:opacity-50">
                <div className="text-sm font-semibold">{label}</div>
                <div className="mt-0.5 text-xs text-muted">{o.hint}</div>
              </button>
            );
          })}
          <p className="text-xs text-muted">Sem resposta até o prazo, vale a opção padrão: "{event.options.find((o) => o.id === event.defaultOption)?.label}".</p>
        </div>
      ) : null}
    </div>
  );
}
