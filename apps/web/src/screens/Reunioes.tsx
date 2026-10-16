// Reuniões (seções 6.4 e 12): chat com personagens, custo de agenda, escolhas e ações livres.

import { useEffect, useRef, useState } from 'react';
import { MEETING_TYPES } from '@game/handlers.ts';
import type { MestreOutput } from '@game/types.ts';
import type { Intent } from '@engine/intents.ts';
import { formatDate } from '@engine/time.ts';
import type { Npc } from '@engine/types.ts';
import { backendSync } from '../lib/backend.ts';
import { invalidateGameData, useAction, useRows } from '../lib/queries.ts';
import { useRoute } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { Avatar, Badge, Button, Card, Empty, inputClass, moodLabel, Spinner } from '../components/ui.tsx';
import { SceneView } from '../components/SceneView.tsx';
import type { ScreenProps } from './GameShell.tsx';

interface Conv {
  id: string;
  npc_ids: string[];
  meeting_type: string;
  status: string;
  turns: number;
  max_turns: number;
  game_date: string;
  week_index: number;
}

interface SceneResp {
  scene: MestreOutput;
  conversationId?: string;
  closed?: boolean;
  applied?: string[];
  pendingAction?: { type: string; params: Record<string, unknown>; summary: string } | null;
  note?: string;
  usedLLM?: boolean;
}

export function Reunioes({ gameId, state }: ScreenProps) {
  const route = useRoute();
  const toast = useUI((s) => s.toast);
  const { run, busy } = useAction(gameId);
  const ps = state.stations.find((s) => s.isPlayer)!;
  const convs = useRows(['conversations', gameId], 'conversations', { game_id: gameId, scene_type: 'reuniao' }, { order: 'created_at', ascending: false, limit: 40 });
  const [type, setType] = useState('curta');
  const [picked, setPicked] = useState<string[]>([]);
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [mobileNew, setMobileNew] = useState(false);

  useEffect(() => {
    const npc = route.query.get('npc');
    if (npc) {
      setPicked([npc]);
      setMobileNew(true);
    }
  }, [route.query.get('npc')]);

  const people = state.npcs.filter((n) => n.stationId === ps.id);
  const staff = people.filter((n) => n.role !== 'talento');
  const talents = people.filter((n) => n.role === 'talento');
  const list = (convs.data ?? []) as unknown as Conv[];
  const activeConv = list.find((c) => c.status === 'open' && c.week_index === state.meta.weekIndex);
  const shown = openConv ?? activeConv?.id ?? null;
  const mt = MEETING_TYPES[type];
  const canStart = state.meta.status === 'active' && picked.length > 0 && state.agenda.meetings < 3 && state.agenda.points >= mt.cost && !activeConv;

  const start = async () => {
    const r = await run<SceneResp>('mestre-scene', { action: 'start_meeting', npcIds: picked, meetingType: type }, { invalidate: ['conversations', 'inbox'] });
    if (r?.conversationId) {
      setOpenConv(r.conversationId);
      setPicked([]);
      setMobileNew(false);
      if (r.note) toast('info', r.note);
    }
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  const Person = ({ n }: { n: Npc }) => (
    <button onClick={() => toggle(n.id)} className={`flex w-full items-center gap-2 rounded-theme border p-2 text-left ${picked.includes(n.id) ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>
      <Avatar emoji={n.avatar} name={n.name} mood={n.mood} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{n.name}</span>
        <span className="block truncate text-xs text-muted">{n.title} · {moodLabel(n.mood)} · confiança {Math.round(n.trust)}</span>
      </span>
      {n.requests.length > 0 && <Badge tone="warn">pediu reunião</Badge>}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Reuniões</h1>
          <p className="text-sm text-muted">Agenda: {state.agenda.points}/20 pontos · {state.agenda.meetings}/3 reuniões nesta semana</p>
        </div>
        <Button className="lg:hidden" variant="primary" onClick={() => setMobileNew((v) => !v)}>{mobileNew ? 'Fechar' : '+ Nova reunião'}</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className={`${mobileNew ? '' : 'hidden'} space-y-3 lg:block`}>
          <Card title="Nova reunião">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(MEETING_TYPES).map(([id, m]) => (
                  <button key={id} onClick={() => setType(id)} className={`rounded-theme border px-2 py-2 text-left text-xs ${type === id ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>
                    <div className="font-semibold">{m.label}</div>
                    <div className="text-muted">{m.cost} pt(s) · {m.turns} falas</div>
                  </button>
                ))}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Quem participa (até 3)</div>
              <div className="space-y-1.5">{staff.map((n) => <Person key={n.id} n={n} />)}</div>
              {talents.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">Talentos ({talents.length})</summary>
                  <div className="mt-2 space-y-1.5">{talents.map((n) => <Person key={n.id} n={n} />)}</div>
                </details>
              )}
              {activeConv && <p className="text-xs text-warn">Encerre a reunião em andamento antes de começar outra.</p>}
              <Button variant="primary" full busy={busy} disabled={!canStart} onClick={start}>Começar ({mt.cost} pt{mt.cost > 1 ? 's' : ''} de agenda)</Button>
            </div>
          </Card>
          <Card title="Reuniões anteriores">
            {list.length === 0 ? <p className="text-sm text-muted">Nenhuma ainda.</p> : (
              <div className="space-y-1">
                {list.map((c) => (
                  <button key={c.id} onClick={() => { setOpenConv(c.id); setMobileNew(false); }} className={`w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${shown === c.id ? 'bg-surface-2' : ''}`}>
                    <span className="font-semibold">{c.npc_ids.map((id) => state.npcs.find((n) => n.id === id)?.name.split(' ')[0] ?? id).join(', ')}</span>
                    <span className="block text-xs text-muted">{MEETING_TYPES[c.meeting_type]?.label ?? c.meeting_type} · {formatDate(c.game_date)} {c.status === 'open' ? '· em andamento' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className={mobileNew ? 'hidden lg:block' : ''}>
          {shown ? <Conversation key={shown} gameId={gameId} state={state} conv={list.find((c) => c.id === shown)} convId={shown} /> : (
            <Empty title="Nenhuma reunião aberta">Escolha o tipo e as pessoas. Cada reunião gasta agenda; ignorar pedidos de reunião custa humor e confiança.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversation({ gameId, state, conv, convId }: ScreenProps & { conv?: Conv; convId: string }) {
  const msgs = useRows(['conversations', gameId, convId, 'msgs'], 'messages', { conversation_id: convId }, { order: 'id', ascending: true, limit: 60 });
  const { run, busy } = useAction(gameId);
  const toast = useUI((s) => s.toast);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<SceneResp['pendingAction']>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const rows = (msgs.data ?? []) as { id: number; role: string; content: Record<string, unknown> }[];
  const lastMestre = [...rows].reverse().find((r) => r.role === 'mestre');
  const open = conv?.status === 'open' && state.meta.status === 'active';
  const llm = backendSync().mode === 'cloud';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [rows.length]);

  const say = async (payload: { text?: string; choiceId?: string; choiceLabel?: string }) => {
    const r = await run<SceneResp>('mestre-scene', { action: 'say', conversationId: convId, ...payload });
    if (r) {
      setText('');
      setApplied(r.applied ?? []);
      setPending(r.pendingAction ?? null);
      if (r.note) toast('info', r.note);
      invalidateGameData(gameId, ['conversations']);
    }
  };

  const end = async () => {
    await run('mestre-scene', { action: 'end_meeting', conversationId: convId });
    invalidateGameData(gameId, ['conversations']);
  };

  const confirmAction = async () => {
    if (!pending) return;
    const r = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent: { type: pending.type, ...pending.params } as Intent });
    if (r) toast(r.result.ok ? 'success' : 'error', r.result.message);
    setPending(null);
  };

  return (
    <div className="card flex h-full max-h-[calc(100dvh-180px)] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-bold">{conv?.npc_ids.map((id) => state.npcs.find((n) => n.id === id)?.name ?? id).join(', ')}</div>
          <div className="text-xs text-muted">{conv ? `${MEETING_TYPES[conv.meeting_type]?.label ?? ''} · fala ${conv.turns}/${conv.max_turns}` : ''}</div>
        </div>
        {open && <Button size="sm" onClick={end} busy={busy}>Encerrar</Button>}
      </div>
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.isLoading && <Spinner />}
        {rows.map((m) => m.role === 'player' ? (
          <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/20 px-3 py-2 text-sm">{String(m.content.text ?? '')}</div>
        ) : (
          <SceneView key={m.id} scene={m.content as unknown as MestreOutput} state={state} onChoice={open && m === lastMestre ? (id, label) => say({ choiceId: id, choiceLabel: label }) : undefined} choicesDisabled={busy} />
        ))}
        {applied.length > 0 && (
          <div className="flex flex-wrap gap-1">{applied.map((a, i) => <Badge key={i} tone="accent">{a}</Badge>)}</div>
        )}
        {pending && (
          <div className="rounded-theme border border-accent bg-accent/10 p-3 text-sm">
            <div className="font-semibold">Ação proposta: {pending.summary}</div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" busy={busy} onClick={confirmAction}>Executar</Button>
              <Button size="sm" onClick={() => setPending(null)}>Ignorar</Button>
            </div>
          </div>
        )}
        {!open && conv && <p className="text-center text-xs text-muted">Reunião encerrada.</p>}
        <div ref={endRef} />
      </div>
      {open && (
        <form className="safe-bottom flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void say({ text: text.trim() }); }}>
          <input className={inputClass} value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder={llm ? 'Diga o que quiser (ou use as opções acima)...' : 'Modo demo: prefira as opções acima'} />
          <Button type="submit" variant="primary" busy={busy}>Falar</Button>
        </form>
      )}
    </div>
  );
}
