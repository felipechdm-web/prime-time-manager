// Validações automáticas antes de "Colocar no ar" (seção 7.3).

import { GENRES } from './catalog/genres.ts';
import { projectedWeekCost } from './commercial.ts';
import { blockingEvents } from './eventsEngine.ts';
import { money } from './money.ts';
import { habitKeyFor, programAirings, programsInWeek, slotArray } from './schedule.ts';
import { ratingAllowed } from './setup.ts';
import { getProgram, npcById, playerStation } from './state.ts';
import type { Block, GameState } from './types.ts';
import { addDays, DAY_SHORT, hgpeWindow, inHgpe, slotLabel, yearOf } from './time.ts';

export interface Issue {
  level: 'block' | 'warn' | 'info';
  code: string;
  text: string;
  day?: number;
  slot?: number;
  programId?: string;
  cost?: string;
}

export interface Validation {
  ok: boolean;
  issues: Issue[];
  projectedCost: number;
  budgetWeek: number;
}

function ranges(slots: (string | null)[]): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= slots.length; i++) {
    const empty = i < slots.length && !slots[i];
    if (empty && s < 0) s = i;
    if (!empty && s >= 0) {
      out.push([s, i]);
      s = -1;
    }
  }
  return out;
}

export function validateSchedule(state: GameState, schedule?: Block[][]): Validation {
  const ps = playerStation(state);
  const week = schedule ?? state.schedules[ps.id];
  const issues: Issue[] = [];
  const startDay = state.weekProgress.day;
  const year = yearOf(state.meta.date);
  // 1. faixa vazia
  for (let d = startDay; d < 7; d++) {
    for (const [a, b] of ranges(slotArray(week[d]))) {
      issues.push({ level: 'block', code: 'faixa_vazia', text: `Faixa vazia: ${DAY_SHORT[d]} ${slotLabel(a)}–${slotLabel(b % 96)}`, day: d, slot: a });
    }
  }
  const ids = programsInWeek(week);
  for (const id of ids) {
    const p = getProgram(state, id);
    if (!p) {
      issues.push({ level: 'block', code: 'programa_inexistente', text: 'Bloco com programa inexistente.', programId: id });
      continue;
    }
    if (p.stationId !== ps.id && p.origin !== 'system') {
      issues.push({ level: 'block', code: 'programa_alheio', text: `"${p.title}" não pertence à sua emissora.`, programId: id });
      continue;
    }
    const airs = programAirings(week, id).filter((a) => a.day >= startDay);
    if (p.status === 'ended') issues.push({ level: 'block', code: 'programa_encerrado', text: `"${p.title}" está encerrado e não pode ir ao ar.`, programId: id });
    if (p.status === 'development') issues.push({ level: 'block', code: 'em_desenvolvimento', text: `"${p.title}" ainda está em desenvolvimento.`, programId: id });
    if (p.rights && p.rights.exhibitionsLeft !== null && p.rights.exhibitionsLeft < airs.length) {
      issues.push({ level: 'warn', code: 'direitos', text: `"${p.title}" tem só ${p.rights.exhibitionsLeft} exibição(ões) restante(s) no contrato e está programado ${airs.length} vez(es).`, programId: id });
    }
    if (p.episodes.total && !p.isRerun) {
      const left = p.episodes.total - p.episodes.aired;
      if (left < airs.length) issues.push({ level: 'warn', code: 'episodios', text: `"${p.title}" tem ${left} episódio(s) inédito(s) para ${airs.length} exibição(ões) nesta semana; depois do último, a faixa fica sem programa.`, programId: id });
    }
    // 2. classificação indicativa
    if (GENRES[p.genre].group !== 'sistema') {
      for (const a of airs) {
        let bad = false;
        for (let s = a.start; s < a.start + a.len; s++) if (!ratingAllowed(p.rating, s)) bad = true;
        if (bad) {
          issues.push({
            level: 'warn',
            code: 'classificacao',
            text: `"${p.title}" (${p.rating === 'L' ? 'livre' : `${p.rating} anos`}) está fora do horário recomendado em ${DAY_SHORT[a.day]} ${slotLabel(a.start)}. ${year < 2016 ? 'Gera multa.' : 'Gera pressão pública e regulatória.'}`,
            day: a.day,
            slot: a.start,
            programId: id,
          });
          break;
        }
      }
    }
    // duração
    for (const a of airs) {
      const min = a.len * 15;
      if (GENRES[p.genre].group !== 'sistema' && (min < p.durMin - 15 || min > p.durMax + 15)) {
        issues.push({ level: 'info', code: 'duracao', text: `"${p.title}" com ${min} min em ${DAY_SHORT[a.day]} (padrão ${p.durStd} min). Esticar aumenta custo e fadiga; encurtar reduz a força.`, programId: id, day: a.day });
        break;
      }
    }
  }
  // 3. blocos protegidos (telejornal principal)
  for (const p of state.programs) {
    if (p.stationId !== ps.id || !p.locked || GENRES[p.genre].group === 'sistema') continue;
    const sig = state.flags[`lock_${p.id}`];
    if (typeof sig !== 'string') continue;
    if (habitKeyFor(week, p.id) !== sig && !state.flags[`auth_${p.id}`]) {
      issues.push({ level: 'block', code: 'telejornal', text: `"${p.title}" é bloco protegido: mexer exige autorização da presidência e do Jornalismo.`, programId: p.id });
    }
  }
  // 4. cotas vendidas sem programa
  for (const d of state.deals) {
    if (d.status !== 'active' || d.startWeek > state.meta.weekIndex || d.endWeek < state.meta.weekIndex) continue;
    if (!ids.has(d.programId)) {
      const p = getProgram(state, d.programId);
      issues.push({ level: 'block', code: 'cota', text: `Cota de ${d.advertiser} vendida em "${p?.title ?? 'programa'}", que não está na grade.`, programId: d.programId });
    }
  }
  // 5. contratos com horário garantido
  for (const c of state.contracts) {
    if (c.stationId !== ps.id || c.status !== 'active' || !c.guaranteed?.programId) continue;
    if (!ids.has(c.guaranteed.programId)) {
      const n = npcById(state, c.npcId);
      issues.push({ level: 'warn', code: 'contrato', text: `Contrato de ${n?.name ?? 'talento'} garante o programa no ar; tirá-lo gera multa contratual e irritação.`, programId: c.guaranteed.programId });
    }
  }
  // 6. orçamento
  const projected = projectedWeekCost(state, ps.id);
  const budgetWeek = state.finance.annualBudget / 52;
  if (budgetWeek > 0 && projected > budgetWeek * 1.1) {
    issues.push({ level: 'warn', code: 'orcamento', text: `Custo projetado da semana (${money(state.meta.era, projected)}) acima da verba semanal (${money(state.meta.era, budgetWeek)}).`, cost: money(state.meta.era, projected - budgetWeek) });
  }
  // 7. HGPE
  const hg = hgpeWindow(year);
  if (hg) {
    for (let d = startDay; d < 6; d++) {
      if (inHgpe(addDays(state.meta.date, d))) {
        issues.push({ level: 'info', code: 'hgpe', text: `Horário eleitoral obrigatório de segunda a sábado às 13h e 20h30 (${year >= 2016 ? '15' : '45'} min). Ele entra por cima da grade em todas as emissoras.` });
        break;
      }
    }
  }
  // 8. cota de conteúdo nacional (canal pago, 2011+)
  if (ps.kind === 'pay' && year >= 2011) {
    let natMin = 0;
    for (let d = 0; d < 7; d++) {
      for (const b of week[d]) {
        const p = getProgram(state, b.programId);
        if (!p) continue;
        const nat = p.origin === 'own' || p.origin === 'coprod' || p.genre === 'serie_nacional' || p.genre.startsWith('novela');
        if (!nat) continue;
        for (let s = b.start; s < b.start + b.len; s++) if (s >= 48 && s < 72) natMin += 15;
      }
    }
    if (natMin < 210) issues.push({ level: 'warn', code: 'cota_nacional', text: `Cota de conteúdo nacional: ${Math.round(natMin / 6) / 10}h no nobre esta semana; a regra exige 3h30.` });
  }
  // 9. eventos que exigem resposta
  for (const e of blockingEvents(state)) {
    issues.push({ level: 'block', code: 'evento', text: `Decisão pendente: "${e.title}" (caixa de entrada).` });
  }
  const ok = !issues.some((i) => i.level === 'block');
  return { ok, issues, projectedCost: projected, budgetWeek };
}

export function lockSignatures(state: GameState): void {
  const ps = playerStation(state);
  const week = state.schedules[ps.id];
  for (const p of state.programs) {
    if (p.stationId === ps.id && p.locked && GENRES[p.genre].group !== 'sistema') state.flags[`lock_${p.id}`] = habitKeyFor(week, p.id);
  }
}
