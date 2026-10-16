// Textos de fallback: usados quando o Mestre (LLM) está indisponível ou sem verba.
// Sempre baseados exclusivamente nos números calculados pelo motor.

import { COLUMNS } from './catalog/names.ts';
import { money, pts as fmtPts } from './money.ts';
import { rngFor } from './rng.ts';
import { activeStations, playerStation, stationById } from './state.ts';
import type { GameState, WeekReport } from './types.ts';
import { BAND_BY_ID, DAY_NAMES } from './time.ts';

function ord(n: number): string {
  return `${n}º`;
}

function f1(v: number): string {
  return fmtPts(v);
}

export function boletimFallback(state: GameState, r: WeekReport): { narrative: { speaker: string; text: string }[]; headlines: string[] } {
  const rng = rngFor(state.meta.seed, 'boletim', r.week);
  const ps = playerStation(state);
  const narrative: { speaker: string; text: string }[] = [];
  const pos24 = r.stations24.findIndex((s) => s.stationId === ps.id) + 1;
  const posPrime = r.stationsPrime.findIndex((s) => s.stationId === ps.id) + 1;
  const my24 = r.stations24.find((s) => s.stationId === ps.id);
  const myPrime = r.stationsPrime.find((s) => s.stationId === ps.id);
  const leader = stationById(state, r.stationsPrime[0]?.stationId ?? '');
  const opener = rng.pick(['Segunda, 8h04. O consolidado chegou antes do café.', 'Segunda-feira, 8h. Os números da semana estão na mesa.', 'Oito da manhã de segunda. A pesquisa entregou o consolidado.', 'Segunda cedo. Caio deixou o relatório em cima da sua mesa.']);
  narrative.push({
    speaker: 'narrador',
    text: `${opener} A ${ps.name} fechou a semana com ${f1(my24?.pts ?? 0)} pontos de média nas 24 horas (${ord(pos24)} lugar) e ${f1(myPrime?.pts ?? 0)} no horário nobre (${ord(posPrime)} lugar, share de ${f1(myPrime?.share ?? 0)}%).`,
  });
  const best = r.programs[0];
  if (best) {
    narrative.push({ speaker: 'narrador', text: `O destaque da casa foi "${best.title}", com ${f1(best.pts)} pontos e ${f1(best.share)}% de share (${best.slotLabel}).` });
  }
  const drops = r.programs.filter((p) => p.delta4w !== null && p.delta4w <= -0.5).sort((a, b) => (a.delta4w ?? 0) - (b.delta4w ?? 0));
  const rises = r.programs.filter((p) => p.delta4w !== null && p.delta4w >= 0.5).sort((a, b) => (b.delta4w ?? 0) - (a.delta4w ?? 0));
  if (drops[0]) {
    narrative.push({ speaker: 'npc_pesquisa', text: `Atenção para "${drops[0].title}": caiu ${f1(Math.abs(drops[0].delta4w ?? 0))} ponto(s) em relação à média das últimas semanas. Hoje marca ${f1(drops[0].pts)}.` });
  } else if (rises[0]) {
    narrative.push({ speaker: 'npc_pesquisa', text: `"${rises[0].title}" está em alta: ganhou ${f1(rises[0].delta4w ?? 0)} ponto(s) sobre a média recente e marcou ${f1(rises[0].pts)}.` });
  }
  if (r.competitorMoves[0]) narrative.push({ speaker: 'npc_bia', text: `E tem movimento na concorrência: ${r.competitorMoves[0].text}` });
  if (r.finance) {
    narrative.push({
      speaker: 'npc_comercial',
      text: `Faturamento da semana: ${money(state.meta.era, r.finance.revenue)}, com ocupação de ${Math.round(r.finance.occupancy * 100)}% do inventário.`,
    });
  }
  const pending = state.events.filter((e) => !e.resolved).length;
  if (pending) narrative.push({ speaker: 'npc_bia', text: `Diretor${state.player.pronoun === 'a' ? 'a' : ''}, ${pending === 1 ? 'tem 1 assunto esperando' : `tem ${pending} assuntos esperando`} sua decisão na caixa de entrada.` });

  const headlines: string[] = [];
  const col = () => rng.pick(COLUMNS).column;
  if (leader && leader.id !== ps.id) {
    headlines.push(`${col()}: "${leader.name} segue dona do nobre; ${ps.name} aparece em ${ord(posPrime)}"`);
  } else if (leader) {
    headlines.push(`${col()}: "${ps.name} lidera o horário nobre com ${f1(myPrime?.pts ?? 0)} pontos"`);
  }
  if (drops[0]) headlines.push(`${col()}: "Público abandona '${drops[0].title}'? Queda preocupa a ${ps.name}"`);
  else if (rises[0]) headlines.push(`${col()}: "'${rises[0].title}' cresce e incomoda a concorrência"`);
  if (r.competitorMoves[0]) {
    const st = stationById(state, r.competitorMoves[0].stationId);
    if (st) headlines.push(`${col()}: "${st.name} mexe na grade e esquenta a disputa"`);
  }
  return { narrative, headlines: headlines.slice(0, 3) };
}

export function dayFallback(state: GameState, r: WeekReport): { speaker: string; text: string }[] {
  const ps = playerStation(state);
  const my = r.stations24.find((s) => s.stationId === ps.id);
  const pos = r.stations24.findIndex((s) => s.stationId === ps.id) + 1;
  const best = r.programs[0];
  const dayName = r.day !== undefined ? DAY_NAMES[r.day] : 'O dia';
  const lines = [{ speaker: 'narrador', text: `${dayName}: a ${ps.name} marcou ${f1(my?.pts ?? 0)} pontos nas 24 horas (${ord(pos)} lugar).` }];
  if (best) lines.push({ speaker: 'npc_pesquisa', text: `Melhor resultado do dia: "${best.title}", ${f1(best.pts)} pontos.` });
  return lines;
}

export function evaluationFallback(state: GameState, score: number, period: string): { speaker: string; text: string }[] {
  const lines: { speaker: string; text: string }[] = [];
  if (score >= 70) lines.push({ speaker: 'npc_presidente', text: `Fechamento de ${period}: nota ${score}. Não vou fingir que estou surpreso. Continue.` });
  else if (score >= 50) lines.push({ speaker: 'npc_presidente', text: `Fechamento de ${period}: nota ${score}. Dá para o gasto. Eu não contratei você para dar para o gasto.` });
  else if (score >= 40) lines.push({ speaker: 'npc_presidente', text: `Fechamento de ${period}: nota ${score}. Estou ouvindo nomes para a sua cadeira. Ainda não liguei para nenhum.` });
  else lines.push({ speaker: 'npc_presidente', text: `Fechamento de ${period}: nota ${score}. Isso não é número de uma emissora séria.` });
  return lines;
}

export function liveFallback(state: GameState, title: string, series: { m: number; player: number; leader: number }[]): { minute: number; text: string }[] {
  const out: { minute: number; text: string }[] = [];
  if (!series.length) return out;
  out.push({ minute: 0, text: `No ar: "${title}". Todo mundo de olho no minuto a minuto.` });
  let best = series[0];
  for (const s of series) if (s.player > best.player) best = s;
  out.push({ minute: best.m, text: `Pico de ${f1(best.player)} pontos! A sala de controle comemora em silêncio.` });
  const lead = series.find((s) => s.player > s.leader && s.m > 2);
  if (lead) out.push({ minute: lead.m, text: 'Passamos a líder no minuto a minuto!' });
  const end = series[series.length - 1];
  out.push({ minute: end.m, text: `Fim. Últimos minutos em ${f1(end.player)} pontos.` });
  return out.sort((a, b) => a.minute - b.minute);
}

export function stationName(state: GameState, id: string): string {
  return stationById(state, id)?.name ?? id;
}

export function bandName(b: string): string {
  return (BAND_BY_ID as Record<string, { name: string }>)[b]?.name ?? b;
}

export function rankingText(state: GameState, r: WeekReport): string {
  return r.stationsPrime.map((s, i) => `${i + 1}. ${stationName(state, s.stationId)} ${f1(s.pts)}`).join(' | ');
}

export function competitorsSummary(state: GameState): string {
  return activeStations(state)
    .map((s) => `${s.name}${s.isPlayer ? ' (sua emissora)' : ''} — ${s.archetype.replace('_', ' ')}`)
    .join('; ');
}
