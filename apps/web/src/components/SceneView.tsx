// Renderiza uma cena do Mestre: falas, manchetes e escolhas.

import { FIXED_NPCS } from '@engine/catalog/npcs.ts';
import type { GameState } from '@engine/types.ts';
import type { MestreOutput } from '@game/types.ts';

export function speakerInfo(state: GameState | undefined, id: string): { name: string; avatar: string; title: string } {
  if (id === 'narrador') return { name: '', avatar: '🎬', title: '' };
  const n = state?.npcs.find((x) => x.id === id);
  if (n) return { name: n.name, avatar: n.avatar, title: n.title };
  const f = FIXED_NPCS.find((x) => x.key === id);
  if (f) return { name: f.name, avatar: f.avatar, title: f.title };
  return { name: id, avatar: '💬', title: '' };
}

export function SceneView({ scene, state, onChoice, choicesDisabled, compact }: { scene: MestreOutput; state?: GameState; onChoice?: (id: string, label: string) => void; choicesDisabled?: boolean; compact?: boolean }) {
  return (
    <div className="space-y-3">
      {scene.narrative.map((n, i) => {
        const sp = speakerInfo(state, n.speaker);
        if (n.speaker === 'narrador') {
          return (
            <p key={i} className={`fade-in italic text-muted ${compact ? 'text-sm' : ''}`}>
              {n.text}
            </p>
          );
        }
        return (
          <div key={i} className="fade-in flex gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-base">{sp.avatar}</span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2">
              <div className="text-xs font-bold text-accent">
                {sp.name}
                {sp.title && <span className="ml-1 font-normal text-muted">· {sp.title}</span>}
              </div>
              <p className={`mt-0.5 whitespace-pre-line ${compact ? 'text-sm' : ''}`}>{n.text}</p>
            </div>
          </div>
        );
      })}
      {scene.headlines.length > 0 && (
        <div className="space-y-1.5 rounded-theme border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Na imprensa</div>
          {scene.headlines.map((h, i) => (
            <p key={i} className="font-display text-sm font-semibold">📰 {h}</p>
          ))}
        </div>
      )}
      {onChoice && scene.choices.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
          {scene.choices.map((c) => (
            <button
              key={c.id}
              disabled={choicesDisabled}
              onClick={() => onChoice(c.id, c.label)}
              className="rounded-theme border border-accent/50 bg-accent/10 px-3 py-2 text-left text-sm font-semibold text-text transition hover:bg-accent/20 disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
