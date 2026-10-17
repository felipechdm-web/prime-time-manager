// Moldura da partida: barra superior, navegação (lateral no PC, inferior no celular), Bia e diálogos globais.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ERAS } from '@engine/catalog/eras.ts';
import { politicalCapital } from '@engine/state.ts';
import { DAY_NAMES } from '@engine/time.ts';
import { weekNumberLabel } from '@engine/sim.ts';
import type { GameState } from '@engine/types.ts';
import { backendSync } from '../lib/backend.ts';
import { useGame, useInbox } from '../lib/queries.ts';
import { go } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts } from '../lib/format.ts';
import { Button, Spinner, StationDot, Tip } from '../components/ui.tsx';
import { BiaDrawer } from '../components/BiaDrawer.tsx';
import { RunDialog } from '../components/RunDialog.tsx';
import { ProgramSheet } from '../components/ProgramSheet.tsx';
import { ControlRoom } from '../components/ControlRoom.tsx';
import { EndGameBanner } from '../components/EndGame.tsx';
import { Boletim } from './Boletim.tsx';
import { Grade } from './Grade.tsx';
import { Acervo } from './Acervo.tsx';
import { Direitos } from './Direitos.tsx';
import { Inbox } from './Inbox.tsx';
import { Reunioes } from './Reunioes.tsx';
import { Comercial } from './Comercial.tsx';
import { Pessoas } from './Pessoas.tsx';
import { Concorrencia } from './Concorrencia.tsx';
import { Carreira } from './Carreira.tsx';
import { Custo } from './Custo.tsx';
import { HelpContent } from './Ajuda.tsx';

export const NAV: { id: string; label: string; icon: string }[] = [
  { id: 'boletim', label: 'Boletim', icon: '📊' },
  { id: 'grade', label: 'Grade', icon: '🗓️' },
  { id: 'caixa', label: 'Caixa de entrada', icon: '✉️' },
  { id: 'reunioes', label: 'Reuniões', icon: '🤝' },
  { id: 'acervo', label: 'Acervo e Mercado', icon: '🎞️' },
  { id: 'direitos', label: 'Mercado de Direitos', icon: '📜' },
  { id: 'comercial', label: 'Comercial', icon: '💰' },
  { id: 'pessoas', label: 'Pessoas', icon: '👥' },
  { id: 'concorrencia', label: 'Concorrência', icon: '📡' },
  { id: 'carreira', label: 'Carreira', icon: '🏆' },
  { id: 'custo', label: 'Custo da IA', icon: '💵' },
  { id: 'ajuda', label: 'Ajuda', icon: '❓' },
];

const MOBILE_MAIN = ['boletim', 'grade', 'caixa', 'reunioes'];

export interface ScreenProps {
  gameId: string;
  state: GameState;
}

export function GameShell({ gameId, screen }: { gameId: string; screen: string }) {
  const game = useGame(gameId);
  const inbox = useInbox(gameId);
  const setRunOpen = useUI((s) => s.setRunOpen);
  const setBia = useUI((s) => s.setBia);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const state = game.data?.state;

  useEffect(() => {
    if (state) document.documentElement.dataset.era = state.meta.era;
  }, [state?.meta.era]);

  useEffect(() => {
    setMoreOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [screen]);

  const pendingEvents = state ? state.events.filter((e) => !e.resolved).length : 0;
  const unread = (inbox.data ?? []).filter((m) => !m.read).length;
  const badge = pendingEvents || unread;

  const ps = useMemo(() => state?.stations.find((s) => s.isPlayer), [state]);

  if (game.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (game.error || !state || !ps) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted">Não foi possível abrir a partida. {game.error ? String((game.error as Error).message) : ''}</p>
        <Button onClick={() => go('/')}>Voltar às partidas</Button>
      </div>
    );
  }

  const last = ps.history.at(-1);
  const era = ERAS[state.meta.era];
  const pol = politicalCapital(state);
  const midWeek = state.weekProgress.day > 0 && state.weekProgress.day < 7;
  const active = state.meta.status === 'active';
  const mode = backendSync().mode;

  let content: ReactNode;
  const props: ScreenProps = { gameId, state };
  switch (screen) {
    case 'grade': content = <Grade {...props} />; break;
    case 'acervo': content = <Acervo {...props} />; break;
    case 'direitos': content = <Direitos {...props} />; break;
    case 'caixa': content = <Inbox {...props} />; break;
    case 'reunioes': content = <Reunioes {...props} />; break;
    case 'comercial': content = <Comercial {...props} />; break;
    case 'pessoas': content = <Pessoas {...props} />; break;
    case 'concorrencia': content = <Concorrencia {...props} />; break;
    case 'carreira': content = <Carreira {...props} />; break;
    case 'custo': content = <Custo {...props} />; break;
    case 'ajuda': content = <div className="p-4 lg:p-6"><HelpContent state={state} /></div>; break;
    default: content = <Boletim {...props} />;
  }

  const navButton = (id: string, compact = false) => {
    const item = NAV.find((n) => n.id === id)!;
    const on = screen === id || (id === 'boletim' && !NAV.some((n) => n.id === screen));
    return (
      <button
        key={id}
        onClick={() => go(`g/${gameId}/${id}`)}
        className={`relative flex items-center gap-3 rounded-theme px-3 py-2 text-sm font-semibold transition ${compact ? 'flex-1 flex-col gap-0.5 px-1 py-1.5 text-[11px]' : ''} ${on ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'}`}
        aria-current={on ? 'page' : undefined}
      >
        <span className={compact ? 'text-lg leading-none' : 'text-base'} aria-hidden>{item.icon}</span>
        <span className={compact ? 'leading-tight' : ''}>{compact ? item.label.split(' ')[0] : item.label}</span>
        {id === 'caixa' && badge > 0 && (
          <span className={`absolute ${compact ? 'right-[22%] top-0.5' : 'right-2 top-1/2 -translate-y-1/2'} min-w-5 rounded-full bg-accent px-1.5 text-center text-[10px] font-bold leading-5 text-accent-contrast`}>{badge}</span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      {/* navegação lateral (PC) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <button onClick={() => go('/')} className="flex items-center gap-2 px-4 py-4 text-left">
          <span className="text-2xl">📺</span>
          <span>
            <span className="block font-display text-sm font-black leading-tight">Prime Time Manager</span>
            <span className="block text-xs text-muted">{era.name} · {era.tagline}</span>
          </span>
        </button>
        <nav className="flex flex-1 flex-col gap-1 px-2">{NAV.map((n) => navButton(n.id))}</nav>
        <div className="border-t border-border p-3 text-xs text-muted">
          <div>{mode === 'demo' ? 'Modo demonstração (sem IA)' : 'Modo nuvem'}</div>
          <button className="mt-1 underline-offset-2 hover:underline" onClick={() => go('/')}>← Todas as partidas</button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* barra superior */}
        <header className="safe-top sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2 lg:px-5">
            <button onClick={() => go('/')} className="lg:hidden text-xl" aria-label="Partidas">📺</button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StationDot color={ps.color} />
                <span className="truncate font-display text-sm font-black sm:text-base">{ps.name}</span>
              </div>
              <div className="truncate text-[11px] text-muted sm:text-xs">
                {weekNumberLabel(state)}
                {midWeek && <span className="ml-1 text-warn">· no ar até {DAY_NAMES[state.weekProgress.day - 1].toLowerCase()}</span>}
              </div>
            </div>
            <div className="hidden items-center gap-4 md:flex">
              <MiniKpi label="24h" value={fmtPts(last?.pts24)} tip="Média de pontos da sua emissora nas 24 horas, na última semana (PNT)." />
              <MiniKpi label="Nobre" value={fmtPts(last?.prime)} tip="Média de pontos das 18h à meia-noite na última semana (PNT)." />
              <MiniKpi label="Capital" value={String(pol)} tip="Capital político: confiança ponderada da presidência (3), Comercial (2), Jornalismo, Artístico e equipe. Abaixo de 15 na revisão trimestral, demissão." tone={pol < 30 ? 'bad' : pol > 60 ? 'good' : undefined} />
              <MiniKpi label="Agenda" value={`${state.agenda.points}/20`} tip="Pontos de agenda da semana: reunião curta 2, longa 4, ligação 1, visita 3, evento com anunciante 3. Máximo de 3 reuniões." />
            </div>
            {active && (
              <Button variant="primary" onClick={() => setRunOpen(true)} className="shrink-0">
                <span aria-hidden>▶</span>
                <span className="hidden sm:inline">Colocar no ar</span>
                <span className="sm:hidden">No ar</span>
              </Button>
            )}
          </div>
        </header>

        {!active && <EndGameBanner gameId={gameId} state={state} />}

        <main ref={mainRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-8">{content}</main>

        {/* navegação inferior (celular) */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 px-1 pt-1 backdrop-blur lg:hidden" aria-label="Navegação">
          {MOBILE_MAIN.map((id) => navButton(id, true))}
          <button onClick={() => setMoreOpen((v) => !v)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-theme px-1 py-1.5 text-[11px] font-semibold ${moreOpen ? 'text-accent' : 'text-muted'}`}>
            <span className="text-lg leading-none">☰</span>Mais
          </button>
        </nav>
        {moreOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="fade-in safe-bottom absolute inset-x-2 bottom-16 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {NAV.filter((n) => !MOBILE_MAIN.includes(n.id)).map((n) => navButton(n.id))}
              <button onClick={() => go('/')} className="col-span-2 rounded-theme px-3 py-2 text-left text-sm text-muted hover:bg-surface-2">← Todas as partidas</button>
            </div>
          </div>
        )}

        {/* Bia */}
        <button
          onClick={() => setBia(true)}
          className="fixed bottom-20 right-3 z-30 flex items-center gap-2 rounded-full border border-border bg-surface-3 py-2 pl-2 pr-3 text-sm font-semibold shadow-xl hover:brightness-110 lg:bottom-5 lg:right-5"
          aria-label="Perguntar à Bia"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20">📝</span>
          <span className="hidden sm:inline">Perguntar à Bia</span>
        </button>
      </div>

      <BiaDrawer gameId={gameId} state={state} />
      <RunDialog gameId={gameId} state={state} />
      <ProgramSheet gameId={gameId} state={state} />
      <ControlRoom gameId={gameId} state={state} />
    </div>
  );
}

function MiniKpi({ label, value, tip, tone }: { label: string; value: string; tip: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wide text-muted">
        <Tip text={tip}>{label}</Tip>
      </div>
      <div className={`tabular font-display text-sm font-bold ${tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : ''}`}>{value}</div>
    </div>
  );
}
