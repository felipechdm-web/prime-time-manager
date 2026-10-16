// "Perguntar à Bia": dicas automáticas + pergunta livre (Mestre ou fallback com glossário).

import { useMemo, useState } from 'react';
import { biaTips, GLOSSARY } from '@game/fallbackScenes.ts';
import type { MestreOutput } from '@game/types.ts';
import type { GameState } from '@engine/types.ts';
import { useAction } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { Button, inputClass } from './ui.tsx';
import { SceneView } from './SceneView.tsx';

export function BiaDrawer({ gameId, state }: { gameId: string; state: GameState }) {
  const open = useUI((s) => s.biaOpen);
  const setOpen = useUI((s) => s.setBia);
  const { run, busy } = useAction(gameId);
  const [q, setQ] = useState('');
  const [answers, setAnswers] = useState<{ q: string; scene: MestreOutput; note?: string }[]>([]);
  const tips = useMemo(() => (open ? biaTips(state) : []), [open, state]);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    const res = await run<{ scene: MestreOutput; note?: string }>('mestre-scene', { action: 'ask_bia', text });
    if (res) {
      setAnswers((a) => [...a, { q: text, scene: res.scene, note: res.note }]);
      setQ('');
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <aside className="fade-in relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <header className="safe-top flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-xl">📝</span>
          <div className="flex-1">
            <div className="font-bold">Bia Ramos</div>
            <div className="text-xs text-muted">Assistente da Diretoria · tira dúvidas, não decide por você</div>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg px-2 text-2xl text-muted hover:text-text" aria-label="Fechar">×</button>
        </header>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Resumo da casa agora</div>
            <ul className="space-y-2">
              {tips.map((t, i) => (
                <li key={i} className="rounded-theme bg-surface-2 px-3 py-2 text-sm">{t}</li>
              ))}
            </ul>
          </section>
          {answers.map((a, i) => (
            <section key={i} className="space-y-2">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/20 px-3 py-2 text-sm">{a.q}</div>
              <SceneView scene={a.scene} state={state} compact />
              {a.note && <p className="text-xs text-muted">{a.note}</p>}
            </section>
          ))}
          <section>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Perguntas rápidas</div>
            <div className="flex flex-wrap gap-1.5">
              {['O que é share?', 'Como funciona a herança?', 'O que priorizar esta semana?', 'O que é capital político?', 'Como ganho dinheiro com cotas?', 'Classificação indicativa'].map((t) => (
                <button key={t} onClick={() => ask(t)} disabled={busy} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs hover:border-accent">{t}</button>
              ))}
            </div>
          </section>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted">Glossário da TV</summary>
            <dl className="mt-2 space-y-2">
              {Object.entries(GLOSSARY).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-semibold capitalize">{k}</dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
        <form
          className="safe-bottom flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
        >
          <input className={inputClass} value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Pergunte à Bia..." />
          <Button type="submit" variant="primary" busy={busy}>Enviar</Button>
        </form>
      </aside>
    </div>
  );
}
