// Intenções do jogador (o cliente só envia intenções; o servidor valida e aplica).

import { GENRES } from './catalog/genres.ts';
import { recomputePrice } from './commercial.ts';
import { talentLeaves } from './eventsEngine.ts';
import { buyOffer } from './market.ts';
import { money } from './money.ts';
import { clamp } from './rng.ts';
import { blocksFromSlots, cloneWeek, placeBlock, slotArray } from './schedule.ts';
import { makeContract } from './setup.ts';
import { getProgram, nextId, npcById, npcByRole, playerStation, pushTimeline } from './state.ts';
import type { Block, GameState, Program } from './types.ts';
import { validateSchedule } from './validate.ts';
import type { Validation } from './validate.ts';

export type Intent =
  | { type: 'set_schedule'; days: Block[][] }
  | { type: 'place_program'; programId: string; days: number[]; start: number; len?: number }
  | { type: 'remove_block'; day: number; start: number }
  | { type: 'resize_block'; day: number; start: number; len: number }
  | { type: 'copy_day'; from: number; to: number[] }
  | { type: 'fill_empty' }
  | { type: 'set_promo'; programId: string; level: number }
  | { type: 'set_merch'; programId: string; level: number }
  | { type: 'set_price_policy'; tableMult?: number; maxDiscount?: number; adMinutes?: number }
  | { type: 'buy_offer'; offerId: string; bid?: number }
  | { type: 'cancel_program'; programId: string }
  | { type: 'rerun'; programId: string }
  | { type: 'stretch'; programId: string; deltaEps: number }
  | { type: 'assign_talent'; npcId: string; programId: string }
  | { type: 'unassign_talent'; npcId: string; programId: string }
  | { type: 'renew_contract'; npcId: string; weeks: number }
  | { type: 'fire_talent'; npcId: string }
  | { type: 'hire_analyst' }
  | { type: 'invest_research' }
  | { type: 'retire' }
  | { type: 'tutorial'; step: number; done?: boolean }
  | { type: 'ack_alert'; key: string };

export interface IntentResult {
  ok: boolean;
  message: string;
  validation?: Validation;
  programId?: string;
}

function fail(message: string): IntentResult {
  return { ok: false, message };
}

function ownProgram(state: GameState, id: string): Program | null {
  const p = getProgram(state, id);
  const ps = playerStation(state);
  if (!p || p.stationId !== ps.id) return null;
  return p;
}

// blocos que o jogador não programa: telejornal protegido e janelas locais
function lockedSlots(state: GameState, day: number): (string | null)[] {
  const ps = playerStation(state);
  const cur = slotArray(state.schedules[ps.id][day]);
  return cur.map((id) => {
    if (!id) return null;
    const p = getProgram(state, id);
    if (!p) return null;
    if (p.genre === 'janela_local') return id;
    if (p.locked && !state.flags[`auth_${p.id}`]) return id;
    return null;
  });
}

function mergeWithLocks(state: GameState, day: number, proposed: Block[]): { blocks: Block[]; changed: boolean } {
  const locks = lockedSlots(state, day);
  const slots = slotArray(proposed);
  let changed = false;
  for (let s = 0; s < slots.length; s++) {
    if (locks[s] && slots[s] !== locks[s]) {
      slots[s] = locks[s];
      changed = true;
    }
    // não permite colocar blocos protegidos em outros horários
    const id = slots[s];
    if (id && !locks[s]) {
      const p = getProgram(state, id);
      if (p && (p.genre === 'janela_local' || (p.locked && !state.flags[`auth_${p.id}`]))) {
        slots[s] = null;
        changed = true;
      }
    }
  }
  return { blocks: blocksFromSlots(slots), changed };
}

function airable(p: Program): boolean {
  return p.status === 'ready' || p.status === 'on_air' || p.status === 'archive' || p.status === 'hiatus';
}

function setDay(state: GameState, day: number, blocks: Block[]): { changed: boolean; error?: string } {
  const ps = playerStation(state);
  if (day < state.weekProgress.day) return { changed: false, error: 'Esse dia já foi ao ar.' };
  for (const b of blocks) {
    const p = getProgram(state, b.programId);
    if (!p || (p.stationId !== ps.id && p.origin !== 'system')) return { changed: false, error: 'Programa inválido na grade.' };
    if (!airable(p) && !(p.locked || p.genre === 'janela_local')) return { changed: false, error: `"${p.title}" não está disponível para exibição.` };
    if (b.start < 0 || b.start > 95 || b.len < 1 || b.start + b.len > 96) return { changed: false, error: 'Bloco fora do dia.' };
  }
  const merged = mergeWithLocks(state, day, blocks);
  state.schedules[ps.id][day] = merged.blocks;
  return { changed: merged.changed };
}

function fillerProgram(state: GameState): Program {
  const ps = playerStation(state);
  let p = state.programs.find((x) => x.stationId === ps.id && x.genre === 'tapa_buraco' && x.status !== 'ended');
  if (!p) {
    const g = GENRES.tapa_buraco;
    p = {
      id: nextId(state, 'p'), stationId: ps.id, title: 'Programação de reprise (tapa-buraco)', genre: 'tapa_buraco', origin: 'archive', quality: 18, appeal: 15,
      profile: { ...g.profile }, rating: 'L', costPerEp: 8000, durStd: 60, durMin: 15, durMax: 360, fatigue: 40, buzz: 0, habitWeeks: 0, habitKey: '',
      movesRecent: [], status: 'ready', talentIds: [], commercial: 10, episodes: { total: null, aired: 0, planned: null }, isRerun: true, merchLevel: 0,
      promo: 0, locked: false, leaseWeeklyPerHour: 0, rights: null, dev: null, tableMult: 1, price30s: 0, premiereWeek: null, createdWeek: state.meta.weekIndex,
      stats: [], totals: { revenue: 0, cost: 0, airings: 0, peakPts: 0 }, tempMods: [], flags: {},
    };
    state.programs.push(p);
    recomputePrice(state, p);
  }
  return p;
}

export function applyIntent(state: GameState, intent: Intent): IntentResult {
  if (state.meta.status !== 'active') return fail('A partida está encerrada.');
  const ps = playerStation(state);
  const week = state.schedules[ps.id];
  const era = state.meta.era;
  switch (intent.type) {
    case 'set_schedule': {
      if (!Array.isArray(intent.days) || intent.days.length !== 7) return fail('Grade inválida.');
      const backup = cloneWeek(week);
      let changed = false;
      for (let d = state.weekProgress.day; d < 7; d++) {
        const r = setDay(state, d, intent.days[d] ?? []);
        if (r.error) {
          state.schedules[ps.id] = backup;
          return fail(r.error);
        }
        changed = changed || r.changed;
      }
      return { ok: true, message: changed ? 'Grade salva. Blocos protegidos foram mantidos no lugar.' : 'Grade salva.', validation: validateSchedule(state) };
    }
    case 'place_program': {
      const p = ownProgram(state, intent.programId);
      if (!p) return fail('Programa não encontrado no seu acervo.');
      if (!airable(p)) return fail(`"${p.title}" não está disponível (${p.status}).`);
      const len = Math.max(1, Math.min(96, Math.round(intent.len ?? p.durStd / 15)));
      for (const d of intent.days) {
        if (d < state.weekProgress.day || d > 6) continue;
        const r = setDay(state, d, placeBlock(week[d], p.id, intent.start, len));
        if (r.error) return fail(r.error);
      }
      return { ok: true, message: `"${p.title}" colocado na grade.`, validation: validateSchedule(state) };
    }
    case 'remove_block': {
      const day = week[intent.day];
      if (!day) return fail('Dia inválido.');
      const b = day.find((x) => intent.start >= x.start && intent.start < x.start + x.len);
      if (!b) return fail('Bloco não encontrado.');
      const p = getProgram(state, b.programId);
      if (p && (p.locked || p.genre === 'janela_local') && !state.flags[`auth_${p.id}`]) return fail('Bloco protegido: não pode ser removido.');
      const r = setDay(state, intent.day, day.filter((x) => x !== b));
      if (r.error) return fail(r.error);
      return { ok: true, message: 'Bloco removido.', validation: validateSchedule(state) };
    }
    case 'resize_block': {
      const day = week[intent.day];
      const b = day?.find((x) => x.start === intent.start);
      if (!b) return fail('Bloco não encontrado.');
      const p = getProgram(state, b.programId);
      if (!p) return fail('Programa não encontrado.');
      if (p.locked || p.genre === 'janela_local') return fail('Bloco protegido: duração fixa.');
      const len = Math.max(1, Math.min(96 - b.start, intent.len));
      if (len * 15 > p.durMax + 30) return fail(`"${p.title}" pode ser esticado até ${p.durMax + 30} minutos.`);
      let blocks = day.filter((x) => x !== b);
      blocks = placeBlock(blocks, p.id, b.start, len);
      const r = setDay(state, intent.day, blocks);
      if (r.error) return fail(r.error);
      return { ok: true, message: `"${p.title}" agora tem ${len * 15} minutos.`, validation: validateSchedule(state) };
    }
    case 'copy_day': {
      const src = week[intent.from];
      if (!src) return fail('Dia de origem inválido.');
      for (const d of intent.to) {
        if (d === intent.from) continue;
        const r = setDay(state, d, src.map((b) => ({ ...b })));
        if (r.error) return fail(r.error);
      }
      return { ok: true, message: 'Dia copiado.', validation: validateSchedule(state) };
    }
    case 'fill_empty': {
      const f = fillerProgram(state);
      let n = 0;
      for (let d = state.weekProgress.day; d < 7; d++) {
        const slots = slotArray(week[d]);
        let changed = false;
        for (let s = 0; s < 96; s++) if (!slots[s]) {
          slots[s] = f.id;
          changed = true;
          n++;
        }
        if (changed) week[d] = blocksFromSlots(slots);
      }
      return { ok: true, message: n ? `${n * 15} minutos preenchidos com tapa-buraco (custo baixo, audiência baixa).` : 'Não há faixas vazias.', validation: validateSchedule(state) };
    }
    case 'set_promo': {
      const p = ownProgram(state, intent.programId);
      if (!p) return fail('Programa não encontrado.');
      p.promo = clamp(Math.round(intent.level), 0, 3);
      const r = npcByRole(state, 'promocao');
      if (r && p.promo >= 2) r.mood = clamp(r.mood + 2, -100, 100);
      return { ok: true, message: p.promo ? `Chamadas nível ${p.promo} para "${p.title}" nesta semana (usa inventário promocional).` : `Sem chamadas para "${p.title}".` };
    }
    case 'set_merch': {
      const p = ownProgram(state, intent.programId);
      if (!p) return fail('Programa não encontrado.');
      p.merchLevel = clamp(Math.round(intent.level), 0, 3);
      return { ok: true, message: `Merchandising em "${p.title}": nível ${p.merchLevel}.` };
    }
    case 'set_price_policy': {
      const f = state.finance;
      if (intent.tableMult !== undefined) f.tableMult = clamp(intent.tableMult, 0.7, 1.4);
      if (intent.maxDiscount !== undefined) f.maxDiscount = clamp(intent.maxDiscount, 0, 0.6);
      if (intent.adMinutes !== undefined) f.adMinutes = clamp(Math.round(intent.adMinutes), 10, 15);
      return { ok: true, message: `Política comercial: tabela ${Math.round(f.tableMult * 100)}%, desconto máximo ${Math.round(f.maxDiscount * 100)}%, ${f.adMinutes} min de intervalo por hora.` };
    }
    case 'buy_offer': {
      const r = buyOffer(state, intent.offerId, intent.bid);
      return { ok: r.ok, message: r.message, programId: r.programId };
    }
    case 'cancel_program': {
      const p = ownProgram(state, intent.programId);
      if (!p) return fail('Programa não encontrado.');
      if (p.locked) return fail('Bloco protegido não pode ser cancelado.');
      if (state.deals.some((d) => d.status === 'active' && d.programId === p.id)) return fail('Há cota vendida nesse programa. Encerre a cota antes.');
      const wasOnAir = p.status === 'on_air';
      p.status = 'ended';
      if (p.dev) p.dev = null;
      for (let d = state.weekProgress.day; d < 7; d++) week[d] = week[d].filter((b) => b.programId !== p.id);
      state.flags.cancelou_recentemente = wasOnAir;
      const lucia = npcByRole(state, 'artistico');
      if (lucia && (p.origin === 'own' || p.origin === 'coprod')) {
        lucia.mood = clamp(lucia.mood - 10, -100, 100);
        lucia.trust = clamp(lucia.trust - 3, 0, 100);
      }
      for (const tid of p.talentIds) {
        const n = npcById(state, tid);
        if (n) n.mood = clamp(n.mood - 20, -100, 100);
      }
      pushTimeline(state, `Cancelou "${p.title}".`, 'programa');
      return { ok: true, message: `"${p.title}" cancelado.${wasOnAir ? ' A faixa ficou vazia.' : ''}`, validation: validateSchedule(state) };
    }
    case 'rerun': {
      const p = ownProgram(state, intent.programId);
      if (!p) return fail('Programa não encontrado.');
      if (p.status !== 'ended' && p.status !== 'archive') return fail('Só programas encerrados viram reprise.');
      if (p.isRerun && p.status === 'archive') return fail('Esse título já está no acervo de reprises.');
      if (state.flags.sem_reprise && p.genre.startsWith('novela')) return fail('Exclusividade com o streaming impede reprise desta novela.');
      const copy: Program = JSON.parse(JSON.stringify(p));
      copy.id = nextId(state, 'p');
      copy.title = `${p.title} (reprise)`;
      copy.isRerun = true;
      copy.origin = 'archive';
      copy.status = 'archive';
      copy.quality = Math.max(10, p.quality - 4);
      copy.fatigue = clamp(p.fatigue + 25, 0, 100);
      copy.buzz = 8;
      copy.stats = [];
      copy.totals = { revenue: 0, cost: 0, airings: 0, peakPts: 0 };
      copy.episodes = { total: p.episodes.total, aired: 0, planned: p.episodes.total };
      copy.talentIds = [];
      copy.habitWeeks = 0;
      copy.habitKey = '';
      copy.premiereWeek = null;
      copy.flags = { nostalgia: 1 };
      copy.rights = null;
      state.programs.push(copy);
      recomputePrice(state, copy);
      return { ok: true, message: `"${copy.title}" disponível no acervo.`, programId: copy.id };
    }
    case 'stretch': {
      const p = ownProgram(state, intent.programId);
      if (!p || !p.episodes.total) return fail('Só programas com número de capítulos podem ser esticados ou encurtados.');
      const delta = clamp(Math.round(intent.deltaEps), -30, 36);
      const minTotal = p.episodes.aired + 6;
      p.episodes.total = Math.max(minTotal, p.episodes.total + delta);
      if (delta > 0) {
        p.fatigue = clamp(p.fatigue + delta * 0.35, 0, 100);
        const m = npcByRole(state, 'comercial');
        if (m) m.mood = clamp(m.mood + 5, -100, 100);
        const l = npcByRole(state, 'artistico');
        if (l) l.mood = clamp(l.mood - 4, -100, 100);
      }
      p.flags.endingWarned = false;
      return { ok: true, message: `"${p.title}" agora terá ${p.episodes.total} capítulos (${p.episodes.total - p.episodes.aired} restantes).` };
    }
    case 'assign_talent': {
      const p = ownProgram(state, intent.programId);
      const n = npcById(state, intent.npcId);
      if (!p || !n || n.stationId !== ps.id || !n.talent) return fail('Talento ou programa inválido.');
      if (p.talentIds.includes(n.id)) return fail('Talento já escalado.');
      if (p.talentIds.length >= 3) return fail('No máximo três talentos principais por programa.');
      p.talentIds.push(n.id);
      n.mood = clamp(n.mood + (n.talent.specialty.includes(p.genre) ? 10 : -5), -100, 100);
      return { ok: true, message: `${n.name} escalado(a) em "${p.title}".${n.talent.specialty.includes(p.genre) ? '' : ' Fora da especialidade: rende menos.'}` };
    }
    case 'unassign_talent': {
      const p = ownProgram(state, intent.programId);
      const n = npcById(state, intent.npcId);
      if (!p || !n) return fail('Talento ou programa inválido.');
      p.talentIds = p.talentIds.filter((x) => x !== n.id);
      n.mood = clamp(n.mood - 12, -100, 100);
      return { ok: true, message: `${n.name} saiu de "${p.title}".` };
    }
    case 'renew_contract': {
      const n = npcById(state, intent.npcId);
      if (!n || n.stationId !== ps.id) return fail('Talento inválido.');
      const c = state.contracts.find((x) => x.id === n.contractId && x.status === 'active');
      if (!c) return fail('Sem contrato ativo.');
      const weeks = clamp(Math.round(intent.weeks), 26, 156);
      const raise = n.mood < 0 ? 0.2 : 0.1;
      c.salaryWeekly = Math.round(c.salaryWeekly * (1 + raise));
      c.endWeek = Math.max(c.endWeek, state.meta.weekIndex + weeks);
      n.mood = clamp(n.mood + 10, -100, 100);
      n.loyalty = clamp(n.loyalty + 8, 0, 100);
      return { ok: true, message: `Contrato de ${n.name} renovado por ${weeks} semanas (+${Math.round(raise * 100)}%: ${money(era, c.salaryWeekly)}/semana).` };
    }
    case 'fire_talent': {
      const n = npcById(state, intent.npcId);
      if (!n || n.stationId !== ps.id || n.role !== 'talento') return fail('Talento inválido.');
      const c = state.contracts.find((x) => x.id === n.contractId && x.status === 'active');
      const fee = c ? c.terminationFee : 0;
      state.weekProgress.fines += fee;
      if (c) c.status = 'terminated';
      for (const p of state.programs) p.talentIds = p.talentIds.filter((x) => x !== n.id);
      n.stationId = null;
      n.contractId = null;
      n.mood = -40;
      pushTimeline(state, `Demitiu ${n.name} (multa rescisória de ${money(era, fee)}).`, 'pessoas');
      return { ok: true, message: `${n.name} demitido(a). Multa rescisória: ${money(era, fee)}.` };
    }
    case 'hire_analyst': {
      if (state.research.analyst) return fail('O analista de concorrência já foi contratado.');
      state.research.analyst = true;
      ps.weeklyStructure += Math.round((state.finance.lastWeek?.revenue ?? 1_000_000) * 0.004);
      return { ok: true, message: 'Analista de concorrência contratado: você passa a ver a grade dos rivais da semana atual e os rumores ficam mais precisos.' };
    }
    case 'invest_research': {
      if (state.research.precision >= 95) return fail('A pesquisa já está no máximo.');
      const cost = Math.round((state.finance.lastWeek?.revenue ?? 1_000_000) * 0.03);
      const e = state.weekProgress.econ[ps.id] ?? [0, 0, 0, 0, 0, 0];
      while (e.length < 6) e.push(0);
      e[5] += cost;
      state.weekProgress.econ[ps.id] = e;
      state.research.precision = clamp(state.research.precision + 12, 0, 100);
      const caio = npcByRole(state, 'pesquisa');
      if (caio) caio.mood = clamp(caio.mood + 8, -100, 100);
      return { ok: true, message: `Investimento em pesquisa (${money(era, cost)}): prévias e estimativas ficam mais precisas.` };
    }
    case 'retire': {
      state.meta.status = 'retired';
      pushTimeline(state, 'Encerrou a carreira na emissora.', 'carreira');
      return { ok: true, message: 'Carreira encerrada. Veja a retrospectiva na tela Carreira.' };
    }
    case 'tutorial': {
      state.tutorial.step = Math.max(state.tutorial.step, intent.step);
      if (intent.done) state.tutorial.done = true;
      return { ok: true, message: '' };
    }
    case 'ack_alert': {
      if (!state.alertsAck.includes(intent.key)) state.alertsAck.push(intent.key);
      if (state.alertsAck.length > 100) state.alertsAck.shift();
      return { ok: true, message: '' };
    }
  }
  return fail('Intenção desconhecida.');
}

export function terminateTalent(state: GameState, npcId: string): void {
  const n = npcById(state, npcId);
  if (n) talentLeaves(state, n, null);
}

export function hireFreeAgent(state: GameState, npcId: string): boolean {
  const n = npcById(state, npcId);
  const ps = playerStation(state);
  if (!n || n.stationId) return false;
  makeContract(state, n, ps.id, 52, null, state.meta.weekIndex);
  return true;
}
