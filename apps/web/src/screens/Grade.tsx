// Grade de programação (seção 7): matriz 7 dias × 96 slots de 15 min.
// PC: arrastar e soltar do acervo. Celular: tocar no horário e escolher o programa.
// Toda mudança é aplicada na hora (mesmo motor no navegador) e confirmada pelo servidor.

import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import { GENRES } from '@engine/catalog/genres.ts';
import { applyIntent } from '@engine/intents.ts';
import type { Intent } from '@engine/intents.ts';
import { previewDay } from '@engine/preview.ts';
import type { PreviewResult } from '@engine/preview.ts';
import { ratingAllowed } from '@engine/setup.ts';
import { BAND_BY_ID, bandOfSlot, DAY_NAMES, DAY_SHORT, slotLabel } from '@engine/time.ts';
import { validateSchedule } from '@engine/validate.ts';
import type { Block, GameState, Program } from '@engine/types.ts';
import { queryClient, setGameState, useAction } from '../lib/queries.ts';
import { useRoute } from '../lib/router.ts';
import { useUI } from '../lib/ui.ts';
import { fmtPts, moneyEra } from '../lib/format.ts';
import { Badge, Button, GenreChip, inputClass, Modal, Tabs, Tip } from '../components/ui.tsx';
import type { ScreenProps } from './GameShell.tsx';

const AIRABLE = ['on_air', 'ready', 'archive', 'hiatus'];

function useIsDesktop(): boolean {
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  useEffect(() => {
    const h = () => setD(window.innerWidth >= 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return d;
}

export function Grade({ gameId, state }: ScreenProps) {
  const ps = state.stations.find((s) => s.isPlayer)!;
  const week = state.schedules[ps.id];
  const isDesktop = useIsDesktop();
  const route = useRoute();
  const day = useUI((s) => s.gridDay);
  const setDay = useUI((s) => s.setGridDay);
  const compare = useUI((s) => s.compareStation);
  const setCompare = useUI((s) => s.setCompare);
  const slotPx = useUI((s) => s.slotPx);
  const setSlotPx = useUI((s) => s.setSlotPx);
  const openProgram = useUI((s) => s.openProgram);
  const toast = useUI((s) => s.toast);
  const { run, busy } = useAction(gameId);
  const [view, setView] = useState<'semana' | 'dia'>('semana');
  const [placeAt, setPlaceAt] = useState<{ day: number; slot: number } | null>(null);
  const [blockSel, setBlockSel] = useState<{ day: number; start: number } | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const active = state.meta.status === 'active';
  const doneDays = state.weekProgress.day;

  // programa vindo da ficha ("Colocar na grade")
  useEffect(() => {
    const p = route.query.get('place');
    if (p) setPlacing(p);
  }, [route.query.get('place')]);

  useEffect(() => {
    if (day < doneDays && doneDays < 7) setDay(doneDays);
  }, [doneDays]);

  const validation = useMemo(() => validateSchedule(state), [state]);
  const blocks = validation.issues.filter((i) => i.level === 'block');
  const warns = validation.issues.filter((i) => i.level !== 'block');
  const programs = useMemo(() => new Map(state.programs.map((p) => [p.id, p])), [state.programs]);
  const rivalsList = state.stations.filter((s) => !s.isPlayer && !s.closedWeek);
  const canSeeCurrent = state.research.analyst || (typeof state.flags.informante_until === 'number' && Number(state.flags.informante_until) >= state.meta.weekIndex);
  const rivalWeek = compare ? (canSeeCurrent ? state.schedules[compare] : state.rivalSnapshot[compare] ?? state.schedules[compare]) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const doIntent = async (intent: Intent, okMsg?: string) => {
    if (!active) return;
    const local: GameState = structuredClone(state);
    const r = applyIntent(local, intent);
    if (!r.ok) {
      toast('error', r.message);
      return;
    }
    setGameState(gameId, local);
    setPreview(null);
    const res = await run<{ result: { ok: boolean; message: string } }>('apply-intent', { intent });
    if (!res || !res.result.ok) {
      if (res) toast('error', res.result.message);
      await queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    } else if (okMsg) toast('success', okMsg);
  };

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over || !over.startsWith('col:')) return;
    const toDay = Number(over.split(':')[1]);
    const col = document.getElementById(`col-${toDay}`);
    const top = e.active.rect.current.translated?.top;
    if (!col || top === undefined) return;
    const slot = Math.max(0, Math.min(95, Math.round((top - col.getBoundingClientRect().top) / slotPx)));
    const id = String(e.active.id);
    if (id.startsWith('acervo:')) {
      const pid = id.slice(7);
      const p = programs.get(pid);
      if (!p) return;
      void doIntent({ type: 'place_program', programId: pid, days: [toDay], start: slot, len: Math.max(1, Math.round(p.durStd / 15)) });
    } else if (id.startsWith('block:')) {
      const [, d, s] = id.split(':').map(Number);
      const b = week[d].find((x) => x.start === s);
      if (!b || (b.start === slot && d === toDay)) return;
      const p = programs.get(b.programId);
      if (p?.locked || p?.genre === 'janela_local') {
        toast('warn', 'Bloco protegido: não pode ser movido.');
        return;
      }
      // mover = tirar do lugar antigo e colocar no novo
      const local: GameState = structuredClone(state);
      const r1 = applyIntent(local, { type: 'remove_block', day: d, start: s });
      if (!r1.ok) return toast('error', r1.message);
      const days = local.schedules[ps.id].map((x) => x.map((y) => ({ ...y })));
      void doIntent({ type: 'set_schedule', days: moveBlock(days, d, toDay, b, slot) });
    }
  };

  const runPreview = () => {
    setPreview(previewDay(state, day));
    toast('info', `Prévia de ${DAY_NAMES[day].toLowerCase()} calculada. A margem depende da precisão da pesquisa (${state.research.precision}%).`);
  };

  const days = isDesktop && view === 'semana' ? [0, 1, 2, 3, 4, 5, 6] : [day];
  const height = 96 * slotPx;
  const acervo = state.programs.filter((p) => p.stationId === ps.id && AIRABLE.includes(p.status) && GENRES[p.genre].group !== 'sistema' || (p.stationId === ps.id && p.genre === 'tapa_buraco' && p.status !== 'ended'));

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-full min-h-0 flex-col">
        {/* barra de ferramentas */}
        <div className="sticky top-0 z-20 space-y-2 border-b border-border bg-bg/95 px-3 py-2 backdrop-blur lg:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-1 text-lg font-black">Grade</h1>
            {isDesktop && <Tabs value={view} onChange={setView} items={[{ id: 'semana', label: 'Semana' }, { id: 'dia', label: 'Dia' }]} />}
            <button onClick={() => setIssuesOpen(true)} className="flex items-center gap-1.5 rounded-theme border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-semibold">
              {blocks.length ? <Badge tone="bad">{blocks.length} bloqueio(s)</Badge> : <Badge tone="good">grade válida</Badge>}
              {warns.length > 0 && <Badge tone="warn">{warns.length} alerta(s)</Badge>}
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button size="sm" onClick={runPreview} title="Prévia de audiência do dia selecionado">📈 Simular {isDesktop && view === 'semana' ? DAY_SHORT[day] : 'faixa'}</Button>
              {active && <Button size="sm" busy={busy} onClick={() => doIntent({ type: 'fill_empty' })}>Preencher vazios</Button>}
              {active && <Button size="sm" onClick={() => setCopyOpen(true)}>Copiar dia</Button>}
              <select className="rounded-theme border border-border bg-surface-2 px-2 py-1.5 text-xs" value={compare ?? ''} onChange={(e) => setCompare(e.target.value || null)} aria-label="Comparar com rival">
                <option value="">Comparar com...</option>
                {rivalsList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="hidden items-center gap-1 sm:flex">
                <Button size="sm" variant="ghost" onClick={() => setSlotPx(Math.max(10, slotPx - 2))} title="Diminuir">−</Button>
                <Button size="sm" variant="ghost" onClick={() => setSlotPx(Math.min(30, slotPx + 2))} title="Aumentar">+</Button>
              </div>
            </div>
          </div>
          {(!isDesktop || view === 'dia' || preview) && (
            <div className="scrollbar-thin flex gap-1 overflow-x-auto">
              {DAY_NAMES.map((n, i) => (
                <button key={n} onClick={() => setDay(i)} className={`rounded-theme py-1.5 text-sm font-semibold ${isDesktop ? 'shrink-0 px-3' : 'min-w-0 flex-1 px-1'} ${day === i ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-muted'} ${i < doneDays ? 'opacity-50' : ''}`}>
                  {isDesktop ? n : DAY_SHORT[i]}{i < doneDays ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
          {placing && (
            <div className="flex items-center justify-between gap-2 rounded-theme border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
              <span>Toque no horário para colocar <b>{programs.get(placing)?.title}</b>.</span>
              <Button size="sm" variant="ghost" onClick={() => setPlacing(null)}>Cancelar</Button>
            </div>
          )}
          {preview && (
            <div className="flex flex-wrap items-center gap-3 rounded-theme bg-surface-2 px-3 py-2 text-xs">
              <span className="font-semibold">Prévia de {DAY_NAMES[preview.day].toLowerCase()}:</span>
              {preview.stations.sort((a, b) => b.prime - a.prime).map((s) => (
                <span key={s.id} className={s.id === ps.id ? 'font-bold text-accent' : 'text-muted'}>{state.stations.find((x) => x.id === s.id)?.short} {fmtPts(s.prime)}</span>
              ))}
              <button className="ml-auto text-muted hover:text-text" onClick={() => setPreview(null)}>limpar</button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          {isDesktop && <AcervoPanel programs={acervo} era={state.meta.era} onPick={(id) => setPlacing(id)} onOpen={openProgram} />}
          <div className="scrollbar-thin min-w-0 flex-1 overflow-auto">
            <div className="flex min-w-fit p-2 lg:p-3">
              <TimeColumn height={height} slotPx={slotPx} />
              {days.map((d) => (
                <DayColumn
                  key={d}
                  day={d}
                  state={state}
                  blocks={week[d]}
                  programs={programs}
                  slotPx={slotPx}
                  past={d < doneDays}
                  wide={days.length === 1}
                  preview={preview && preview.day === d ? preview : null}
                  onSlot={(slot) => {
                    if (!active || d < doneDays) return;
                    setPlaceAt({ day: d, slot });
                  }}
                  onBlock={(b) => setBlockSel({ day: d, start: b.start })}
                  draggingId={dragging}
                />
              ))}
              {rivalWeek && days.length === 1 && (
                <RivalColumn blocks={rivalWeek[day]} programs={programs} slotPx={slotPx} station={state.stations.find((s) => s.id === compare)!} lagged={!canSeeCurrent} />
              )}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay>
        {dragging?.startsWith('acervo:') ? (
          <div className="rounded-theme border border-accent bg-surface-3 px-3 py-2 text-sm font-semibold shadow-2xl">{programs.get(dragging.slice(7))?.title}</div>
        ) : null}
      </DragOverlay>

      <PlaceDialog
        open={!!placeAt}
        at={placeAt}
        state={state}
        preset={placing}
        acervo={acervo}
        onClose={() => setPlaceAt(null)}
        onPlace={(pid, daysSel, len) => {
          if (!placeAt) return;
          setPlaceAt(null);
          setPlacing(null);
          void doIntent({ type: 'place_program', programId: pid, days: daysSel, start: placeAt.slot, len });
        }}
      />
      <BlockDialog
        sel={blockSel}
        state={state}
        onClose={() => setBlockSel(null)}
        onIntent={(i, msg) => {
          setBlockSel(null);
          void doIntent(i, msg);
        }}
        onOpenProgram={(id) => {
          setBlockSel(null);
          openProgram(id);
        }}
      />
      <Modal open={issuesOpen} onClose={() => setIssuesOpen(false)} title="Validação da grade">
        {validation.issues.length === 0 ? <p className="text-sm text-good">Tudo certo para ir ao ar.</p> : (
          <ul className="space-y-2 text-sm">
            {validation.issues.map((i, k) => (
              <li key={k} className={`rounded-theme px-3 py-2 ${i.level === 'block' ? 'bg-bad/10 text-bad' : i.level === 'warn' ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-muted'}`}>
                {i.level === 'block' ? '⛔' : i.level === 'warn' ? '⚠️' : 'ℹ️'} {i.text}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Custo projetado da semana: {moneyEra(state.meta.era, validation.projectedCost)} · verba semanal: {moneyEra(state.meta.era, validation.budgetWeek)}</p>
      </Modal>
      <CopyDialog open={copyOpen} onClose={() => setCopyOpen(false)} doneDays={doneDays} onCopy={(from, to) => { setCopyOpen(false); void doIntent({ type: 'copy_day', from, to }, 'Dia copiado.'); }} />
    </DndContext>
  );
}

function moveBlock(days: Block[][], fromDay: number, toDay: number, b: Block, slot: number): Block[][] {
  const slots = (d: Block[]) => {
    const arr: (string | null)[] = new Array(96).fill(null);
    for (const x of d) for (let i = 0; i < x.len; i++) if (x.start + i < 96) arr[x.start + i] = x.programId;
    return arr;
  };
  const toBlocks = (arr: (string | null)[]) => {
    const out: Block[] = [];
    let cur: Block | null = null;
    arr.forEach((id, s) => {
      if (cur && id === cur.programId) cur.len++;
      else {
        if (cur) out.push(cur);
        cur = id ? { programId: id, start: s, len: 1 } : null;
      }
    });
    if (cur) out.push(cur);
    return out;
  };
  const target = slots(days[toDay]);
  for (let i = 0; i < b.len; i++) if (slot + i < 96) target[slot + i] = b.programId;
  days[toDay] = toBlocks(target);
  void fromDay;
  return days;
}

function TimeColumn({ height, slotPx }: { height: number; slotPx: number }) {
  return (
    <div className="sticky left-0 z-10 w-12 shrink-0 bg-bg pt-7" style={{ height: height + 28 }}>
      <div className="relative" style={{ height }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted tabular" style={{ top: h * 4 * slotPx }}>
            {slotLabel(h * 4).slice(0, 2)}h
          </div>
        ))}
      </div>
    </div>
  );
}

function DayColumn(props: {
  day: number;
  state: GameState;
  blocks: Block[];
  programs: Map<string, Program>;
  slotPx: number;
  past: boolean;
  wide: boolean;
  preview: PreviewResult | null;
  onSlot: (slot: number) => void;
  onBlock: (b: Block) => void;
  draggingId: string | null;
}) {
  const { day, blocks, programs, slotPx, past, wide } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${day}`, disabled: past });
  const height = 96 * slotPx;
  const filled = new Array(96).fill(false);
  for (const b of blocks) for (let i = 0; i < b.len; i++) filled[b.start + i] = true;
  const empties: [number, number][] = [];
  for (let s = 0; s < 96; s++) {
    if (!filled[s]) {
      const st = s;
      while (s < 96 && !filled[s]) s++;
      empties.push([st, s]);
    }
  }
  const bands = [
    { from: 48, to: 56, cls: 'bg-accent/[0.04]' },
    { from: 56, to: 66, cls: 'bg-accent/[0.09]' },
    { from: 66, to: 72, cls: 'bg-accent/[0.04]' },
  ];
  return (
    <div className={`${wide ? 'min-w-0 flex-1' : 'w-36 shrink-0 xl:w-40'} px-0.5`}>
      <div className="sticky top-0 z-10 mb-1 h-6 rounded-md bg-surface-2 text-center text-xs font-bold leading-6">{DAY_NAMES[day]}{past ? ' ✓' : ''}</div>
      <div
        id={`col-${day}`}
        ref={setNodeRef}
        className={`relative rounded-md border ${isOver ? 'border-accent' : 'border-border'} ${past ? 'opacity-60' : ''}`}
        style={{ height }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-block]')) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const slot = Math.max(0, Math.min(95, Math.floor((e.clientY - rect.top) / slotPx)));
          // toque num buraco começa no início dele (no celular o dedo raramente acerta o horário exato)
          const gap = empties.find(([a, b]) => slot >= a && slot < b);
          props.onSlot(gap ? gap[0] : slot);
        }}
      >
        {bands.map((b) => <div key={b.from} className={`pointer-events-none absolute inset-x-0 ${b.cls}`} style={{ top: b.from * slotPx, height: (b.to - b.from) * slotPx }} />)}
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ top: h * 4 * slotPx }} />)}
        {empties.map(([a, b]) => (
          <div key={a} className="pointer-events-none absolute inset-x-1 flex items-center justify-center rounded border border-dashed border-bad/60 bg-bad/10 text-[10px] font-semibold text-bad" style={{ top: a * slotPx + 1, height: (b - a) * slotPx - 2 }}>
            {(b - a) * slotPx >= 18 ? 'vazio' : ''}
          </div>
        ))}
        {blocks.map((b) => (
          <BlockView key={`${b.start}-${b.programId}`} day={day} block={b} program={programs.get(b.programId)} slotPx={slotPx} past={past} preview={props.preview} onClick={() => props.onBlock(b)} hidden={props.draggingId === `block:${day}:${b.start}`} />
        ))}
      </div>
    </div>
  );
}

function BlockView({ day, block, program, slotPx, past, preview, onClick, hidden }: { day: number; block: Block; program?: Program; slotPx: number; past: boolean; preview: PreviewResult | null; onClick: () => void; hidden: boolean }) {
  const locked = !!program && (program.locked || program.genre === 'janela_local');
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `block:${day}:${block.start}`, disabled: past || locked });
  const g = program ? GENRES[program.genre] : null;
  const h = block.len * slotPx;
  const est = preview?.programs.find((p) => p.programId === block.programId && p.start === block.start);
  const last = program?.stats.at(-1);
  let ratingBad = false;
  if (program) for (let s = block.start; s < block.start + block.len; s++) if (!ratingAllowed(program.rating, s)) ratingBad = true;
  const style: React.CSSProperties = {
    top: block.start * slotPx + 1,
    height: h - 2,
    background: g ? `color-mix(in srgb, ${g.color} 22%, var(--surface-2))` : 'var(--surface-3)',
    borderLeft: `3px solid ${g?.color ?? '#666'}`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: transform ? 30 : 1,
    opacity: hidden ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      data-block
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute inset-x-0.5 cursor-pointer overflow-hidden rounded-md px-1.5 py-0.5 text-left shadow-sm hover:brightness-125"
      style={style}
      title={`${program?.title ?? ''} · ${slotLabel(block.start)}–${slotLabel((block.start + block.len) % 96)}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="truncate text-[11px] font-bold leading-tight">{locked && '🔒 '}{g?.icon} {program?.title ?? '???'}</span>
        {ratingBad && <span title="Fora do horário da classificação indicativa" className="text-[10px]">⚠️</span>}
      </div>
      {h >= 30 && (
        <div className="truncate text-[10px] text-muted">
          {slotLabel(block.start)}–{slotLabel((block.start + block.len) % 96)}
          {est ? <span className="ml-1 font-bold text-accent-2">≈{fmtPts(est.est)} ({fmtPts(est.lo)}–{fmtPts(est.hi)})</span> : last ? <span className="ml-1">· {fmtPts(last.pts)} pts</span> : null}
        </div>
      )}
    </div>
  );
}

function RivalColumn({ blocks, programs, slotPx, station, lagged }: { blocks: Block[]; programs: Map<string, Program>; slotPx: number; station: { name: string; color: string }; lagged: boolean }) {
  return (
    <div className="min-w-0 flex-1 px-0.5 opacity-90">
      <div className="sticky top-0 z-10 mb-1 h-6 truncate rounded-md bg-surface-2 px-1 text-center text-xs font-bold leading-6" style={{ color: station.color }}>
        {station.name}{lagged ? ' (sem. passada)' : ''}
      </div>
      <div className="relative rounded-md border border-border" style={{ height: 96 * slotPx }}>
        {blocks.map((b) => {
          const p = programs.get(b.programId);
          const g = p ? GENRES[p.genre] : null;
          return (
            <div key={b.start} className="absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5" style={{ top: b.start * slotPx + 1, height: b.len * slotPx - 2, background: 'var(--surface-2)', borderLeft: `3px solid ${g?.color ?? '#666'}` }}>
              <div className="truncate text-[11px] font-semibold leading-tight">{g?.icon} {p?.label ?? p?.title}</div>
              {b.len * slotPx >= 30 && p?.stats.at(-1) && <div className="text-[10px] text-muted">{fmtPts(p.stats.at(-1)?.pts)} pts</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AcervoItem({ p, era, onPick, onOpen }: { p: Program; era: GameState['meta']['era']; onPick: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `acervo:${p.id}` });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="cursor-grab rounded-theme border border-border bg-surface-2 p-2 active:cursor-grabbing">
      <div className="flex items-start justify-between gap-1">
        <button className="truncate text-left text-sm font-semibold hover:underline" onClick={onOpen}>{p.title}</button>
        <button className="shrink-0 rounded px-1 text-xs text-accent hover:bg-accent/10" onClick={onPick} title="Escolher horário">＋</button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <GenreChip genre={p.genre} small />
        <span className="text-[10px] text-muted">{p.durStd} min · {p.status === 'on_air' ? 'no ar' : p.status === 'archive' ? 'reprise' : 'pronto'}</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>Q {p.quality} · A {p.appeal}</span>
        <span>{p.stats.at(-1) ? `${fmtPts(p.stats.at(-1)!.pts)} pts` : moneyEra(era, p.costPerEp)}</span>
      </div>
    </div>
  );
}

function AcervoPanel({ programs, era, onPick, onOpen }: { programs: Program[]; era: GameState['meta']['era']; onPick: (id: string) => void; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'todos' | 'no_ar' | 'fora'>('todos');
  const list = programs
    .filter((p) => (filter === 'no_ar' ? p.status === 'on_air' : filter === 'fora' ? p.status !== 'on_air' : true))
    .filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || GENRES[p.genre].name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.status === 'on_air' ? 1 : 0) - (b.status === 'on_air' ? 1 : 0) || a.title.localeCompare(b.title));
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="space-y-2 border-b border-border p-2">
        <div className="flex items-center text-xs font-bold uppercase tracking-wide text-muted"><Tip text="Arraste um programa para a grade, ou toque em ＋ e depois no horário.">Acervo</Tip></div>
        <input className={inputClass} placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs value={filter} onChange={setFilter} items={[{ id: 'todos', label: 'Todos' }, { id: 'fora', label: 'Fora do ar' }, { id: 'no_ar', label: 'No ar' }]} />
      </div>
      <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto p-2">
        {list.map((p) => <AcervoItem key={p.id} p={p} era={era} onPick={() => onPick(p.id)} onOpen={() => onOpen(p.id)} />)}
      </div>
    </aside>
  );
}

function PlaceDialog({ open, at, state, preset, acervo, onClose, onPlace }: { open: boolean; at: { day: number; slot: number } | null; state: GameState; preset: string | null; acervo: Program[]; onClose: () => void; onPlace: (pid: string, days: number[], len: number) => void }) {
  const [pid, setPid] = useState<string>('');
  const [daysMode, setDaysMode] = useState<'dia' | 'segsex' | 'segsab' | 'todos'>('dia');
  const [len, setLen] = useState(4);
  const [q, setQ] = useState('');
  const p = acervo.find((x) => x.id === pid);
  useEffect(() => {
    if (open) {
      setPid(preset ?? '');
      setQ('');
      const pp = acervo.find((x) => x.id === preset);
      setLen(pp ? Math.max(1, Math.round(pp.durStd / 15)) : 4);
      setDaysMode(at && at.day < 5 && pp && (pp.genre.startsWith('novela') || pp.genre === 'telejornal') ? 'segsex' : 'dia');
    }
  }, [open]);
  if (!open || !at) return null;
  const done = state.weekProgress.day;
  const daysFor = (m: typeof daysMode) => (m === 'dia' ? [at.day] : m === 'segsex' ? [0, 1, 2, 3, 4] : m === 'segsab' ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]).filter((d) => d >= done);
  const list = acervo.filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()) || GENRES[x.genre].name.toLowerCase().includes(q.toLowerCase()));
  const band = BAND_BY_ID[bandOfSlot(at.slot)].name;
  const lens = p ? Array.from(new Set([p.durMin, p.durStd, p.durStd + 15, p.durStd + 30, p.durMax].map((m) => Math.max(15, Math.round(m / 15) * 15)))).sort((a, b) => a - b) : [30, 60, 90, 120];
  return (
    <Modal
      open
      onClose={onClose}
      title={`${DAY_NAMES[at.day]}, ${slotLabel(at.slot)} · ${band}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!pid} onClick={() => onPlace(pid, daysFor(daysMode), len)}>Colocar na grade</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <input className={inputClass} placeholder="Buscar programa ou gênero..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto">
          {list.map((x) => (
            <button key={x.id} onClick={() => { setPid(x.id); setLen(Math.max(1, Math.round(x.durStd / 15))); }} className={`flex w-full items-center justify-between gap-2 rounded-theme border px-3 py-2 text-left text-sm ${pid === x.id ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{x.title}</span>
                <span className="text-xs text-muted">{GENRES[x.genre].icon} {GENRES[x.genre].name} · {x.durStd} min · Q{x.quality}/A{x.appeal}{x.rating !== 'L' ? ` · ${x.rating} anos` : ''}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{x.status === 'on_air' ? 'no ar' : x.status === 'archive' ? 'reprise' : 'pronto'}</span>
            </button>
          ))}
        </div>
        {p && !ratingAllowed(p.rating, at.slot) && <p className="rounded-theme bg-warn/10 p-2 text-xs text-warn">⚠️ {p.rating} anos fora do horário recomendado da classificação indicativa.</p>}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Dias</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {([['dia', `Só ${DAY_SHORT[at.day]}`], ['segsex', 'Seg a sex'], ['segsab', 'Seg a sáb'], ['todos', 'Todos']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setDaysMode(id)} className={`rounded-theme border px-2 py-2 text-sm font-semibold ${daysMode === id ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>{label}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Programa diário no mesmo horário de segunda a sexta cria hábito (bônus de audiência).</p>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Duração</div>
          <div className="flex flex-wrap gap-1.5">
            {lens.map((m) => (
              <button key={m} onClick={() => setLen(m / 15)} className={`rounded-theme border px-3 py-1.5 text-sm ${len * 15 === m ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>{m} min</button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function BlockDialog({ sel, state, onClose, onIntent, onOpenProgram }: { sel: { day: number; start: number } | null; state: GameState; onClose: () => void; onIntent: (i: Intent, msg?: string) => void; onOpenProgram: (id: string) => void }) {
  const [moveDay, setMoveDay] = useState(0);
  const [moveSlot, setMoveSlot] = useState(0);
  const ps = state.stations.find((s) => s.isPlayer)!;
  const b = sel ? state.schedules[ps.id][sel.day].find((x) => x.start === sel.start) : undefined;
  useEffect(() => {
    if (sel) {
      setMoveDay(sel.day);
      setMoveSlot(sel.start);
    }
  }, [sel?.day, sel?.start]);
  if (!sel || !b) return null;
  const p = state.programs.find((x) => x.id === b.programId);
  if (!p) return null;
  const locked = p.locked || p.genre === 'janela_local';
  const past = sel.day < state.weekProgress.day;
  const end = (b.start + b.len) % 96;
  return (
    <Modal open onClose={onClose} title={p.title}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <GenreChip genre={p.genre} />
          <span className="text-muted">{DAY_NAMES[sel.day]} · {slotLabel(b.start)}–{slotLabel(end)} ({b.len * 15} min)</span>
        </div>
        {locked && <p className="rounded-theme bg-warn/10 p-3 text-sm text-warn">🔒 {p.genre === 'janela_local' ? 'Janela local das afiliadas: obrigatória e não programável.' : 'Bloco protegido (telejornal principal). Mexer exige autorização da presidência e do Jornalismo.'}</p>}
        {past && <p className="text-sm text-muted">Este dia já foi ao ar.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onOpenProgram(p.id)}>Ficha do programa</Button>
          {!locked && !past && (
            <>
              <Button onClick={() => onIntent({ type: 'resize_block', day: sel.day, start: b.start, len: b.len + 1 })}>Esticar +15 min</Button>
              <Button disabled={b.len <= 1} onClick={() => onIntent({ type: 'resize_block', day: sel.day, start: b.start, len: b.len - 1 })}>Encurtar −15 min</Button>
              <Button onClick={() => onIntent({ type: 'place_program', programId: p.id, days: [0, 1, 2, 3, 4], start: b.start, len: b.len }, 'Replicado de segunda a sexta.')}>Replicar seg–sex</Button>
              <Button onClick={() => onIntent({ type: 'place_program', programId: p.id, days: [0, 1, 2, 3, 4, 5, 6], start: b.start, len: b.len }, 'Replicado em todos os dias.')}>Replicar todos os dias</Button>
              <Button variant="danger" onClick={() => onIntent({ type: 'remove_block', day: sel.day, start: b.start })}>Tirar da grade</Button>
            </>
          )}
        </div>
        {!locked && !past && (
          <div className="rounded-theme bg-surface-2 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Mover para</div>
            <div className="flex flex-wrap gap-2">
              <select className={`${inputClass} w-auto`} value={moveDay} onChange={(e) => setMoveDay(Number(e.target.value))}>
                {DAY_NAMES.map((n, i) => <option key={n} value={i} disabled={i < state.weekProgress.day}>{n}</option>)}
              </select>
              <select className={`${inputClass} w-auto`} value={moveSlot} onChange={(e) => setMoveSlot(Number(e.target.value))}>
                {Array.from({ length: 96 }, (_, s) => <option key={s} value={s}>{slotLabel(s)}</option>)}
              </select>
              <Button
                variant="primary"
                onClick={() => {
                  const days = state.schedules[ps.id].map((x) => x.map((y) => ({ ...y })));
                  days[sel.day] = days[sel.day].filter((x) => x.start !== b.start);
                  onIntent({ type: 'set_schedule', days: moveBlock(days, sel.day, moveDay, b, moveSlot) }, 'Programa movido. Atenção: mudar de horário zera o hábito.');
                }}
              >
                Mover
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted">Mudar de horário zera o hábito do público; mudar com frequência gera "público confuso".</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CopyDialog({ open, onClose, doneDays, onCopy }: { open: boolean; onClose: () => void; doneDays: number; onCopy: (from: number, to: number[]) => void }) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState<number[]>([]);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Copiar a grade de um dia" footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!to.length} onClick={() => onCopy(from, to)}>Copiar</Button></div>}>
      <div className="space-y-3">
        <label className="block text-sm">
          De:
          <select className={`${inputClass} mt-1`} value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </label>
        <div>
          <div className="mb-1 text-sm">Para:</div>
          <div className="grid grid-cols-4 gap-1.5">
            {DAY_NAMES.map((n, i) => (
              <button key={n} disabled={i === from || i < doneDays} onClick={() => setTo((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]))} className={`rounded-theme border px-2 py-2 text-sm disabled:opacity-30 ${to.includes(i) ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>{DAY_SHORT[i]}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Blocos protegidos (telejornal e janelas locais) continuam no lugar.</p>
      </div>
    </Modal>
  );
}
