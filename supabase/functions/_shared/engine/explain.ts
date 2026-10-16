// "Por que caí?": decompõe a atratividade do programa nos fatores da seção 9.3.

import { GENRES } from './catalog/genres.ts';
import { getProgram } from './state.ts';
import type { GameState } from './types.ts';

export const FACTOR_LABELS = [
  'Qualidade',
  'Apelo junto ao público da faixa',
  'Encaixe do gênero no horário',
  'Buzz (chamadas, imprensa, redes)',
  'Hábito (semanas no mesmo horário)',
  'Fadiga (desgaste)',
  'Força do talento principal',
  'Força da marca nas praças',
  'Sorte do dia (ruído)',
  'Força das outras telas',
];

export interface Explanation {
  programId: string;
  current: { label: string; value: number }[];
  changes: { label: string; delta: number; text: string }[];
  summary: string;
}

export function explainProgram(state: GameState, programId: string): Explanation | null {
  const p = getProgram(state, programId);
  if (!p) return null;
  const withFx = p.stats.filter((s) => s.fx);
  const cur = withFx.at(-1);
  if (!cur || !cur.fx) {
    return { programId, current: [], changes: [], summary: 'Ainda não há dados suficientes: o programa precisa ir ao ar pelo menos uma semana.' };
  }
  const sign = [1, 1, 1, 1, 1, -1, 1, 1, 1, -1];
  const current = cur.fx.map((v, i) => ({ label: FACTOR_LABELS[i], value: Math.round(v * sign[i] * 100) / 100 }));
  const prev = withFx.length >= 2 ? withFx[withFx.length - 2] : null;
  const changes: Explanation['changes'] = [];
  if (prev?.fx) {
    cur.fx.forEach((v, i) => {
      const d = (v - prev.fx![i]) * sign[i];
      if (Math.abs(d) < 0.01) return;
      let text = '';
      switch (i) {
        case 3: text = d > 0 ? 'mais expectativa (chamadas/imprensa)' : 'o buzz esfriou (decai 15% por semana sem chamadas)'; break;
        case 4: text = d > 0 ? 'o público está criando o hábito' : 'mudança de horário zerou o hábito'; break;
        case 5: text = d > 0 ? 'menos desgaste' : 'o programa está cansando o público'; break;
        case 6: text = d > 0 ? 'talento mais forte ou mais motivado' : 'talento menos motivado ou fora do programa'; break;
        case 8: text = d > 0 ? 'semana de sorte' : 'semana de azar (ruído natural da audiência)'; break;
        case 2: text = d > 0 ? 'horário mais adequado ao gênero' : 'horário menos adequado ao gênero'; break;
        case 1: text = d > 0 ? 'mais apelo (trama, quadros, temporada)' : 'menos apelo na fase atual'; break;
        default: text = d > 0 ? 'melhorou' : 'piorou';
      }
      changes.push({ label: FACTOR_LABELS[i], delta: Math.round(d * 100) / 100, text });
    });
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  const dPts = prev ? cur.pts - prev.pts : 0;
  let summary: string;
  if (!prev) summary = `Primeira semana de "${p.title}" com dados completos.`;
  else if (Math.abs(dPts) < 0.15) summary = `"${p.title}" ficou estável (${cur.pts.toLocaleString('pt-BR')} pts).`;
  else {
    const main = changes.slice(0, 2).map((c) => `${c.label.toLowerCase()} (${c.text})`).join(' e ');
    summary = `"${p.title}" ${dPts > 0 ? 'subiu' : 'caiu'} ${Math.abs(dPts).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ponto(s). O que mais pesou: ${main || 'a movimentação da concorrência e a herança do programa anterior'}.`;
  }
  if (GENRES[p.genre].group === 'drama' && p.episodes.total) {
    const x = p.episodes.aired / p.episodes.total;
    if (x > 0.85) summary += ' Reta final da trama: a curva de vida da novela tende a subir.';
    else if (x > 0.1 && x < 0.3) summary += ' Fase de acomodação da novela (semanas 3 a 8): é normal oscilar.';
  }
  return { programId, current, changes: changes.slice(0, 5), summary };
}
