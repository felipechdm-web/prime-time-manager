// Estatística rápida de frequência de eventos e ações de rivais (seção 13.4).
// Uso: node scripts/events-stats.ts [--weeks 40]

import { newGame } from '../supabase/functions/_shared/engine/newGame.ts';
import { simulate } from '../supabase/functions/_shared/engine/sim.ts';
import { applyIntent } from '../supabase/functions/_shared/engine/intents.ts';
import { resolveEvent } from '../supabase/functions/_shared/engine/eventsEngine.ts';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : d);
const WEEKS = parseInt(arg('weeks', '40'), 10);

const { state } = newGame({
  universe: 'real', era: 'now', startYear: 2026, scenario: 'emissora_crise', difficulty: 'diretor', seed: 77,
  player: { name: 'Teste', background: 'jornalista', pronoun: 'a' }, station: { mode: 'fictional' },
});
const seen = new Set<string>();
const perWeek: number[] = [];
let pos = 0;
let tot = 0;
const byId = new Map<string, number>();
let rivalActions = 0;
const kinds = new Map<string, number>();
for (let w = 0; w < WEEKS; w++) {
  let n = 0;
  for (const e of state.events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    n++;
    tot++;
    if (e.tone === 'positivo') pos++;
    byId.set(e.templateId, (byId.get(e.templateId) ?? 0) + 1);
  }
  perWeek.push(n);
  for (const e of state.events) if (!e.resolved) resolveEvent(state, e.id, e.defaultOption, true);
  applyIntent(state, { type: 'fill_empty' });
  const out = simulate(state, 'week');
  rivalActions += out.competitorActions.length;
  for (const a of out.competitorActions) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
  if (state.meta.status !== 'active') {
    console.log('Fim de jogo:', state.meta.status, out.endGame?.reason);
    break;
  }
}
console.log(`Semanas: ${perWeek.length}; eventos: ${tot} (média ${(tot / perWeek.length).toFixed(2)}/semana); positivos ${Math.round((pos / Math.max(1, tot)) * 100)}%`);
console.log('Distribuição por semana:', perWeek.join(' '));
console.log('Ações de rivais:', rivalActions, [...kinds.entries()].map(([k, v]) => `${k}:${v}`).join(', '));
console.log('Mais frequentes:', [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(', '));
console.log(`Nota atual: ${state.kpis?.score}; capital político: ${state.kpis?.political}; data ${state.meta.date}`);
