// Fluxo completo de criação de partida: mundo + aquecimento + primeira semana + boas-vindas.

import { ERAS } from './catalog/eras.ts';
import { money } from './money.ts';
import { createWorld, SCENARIOS } from './setup.ts';
import type { NewGameInput } from './setup.ts';
import { firstWeekSetup, runWarmup } from './sim.ts';
import type { SimOutputs } from './sim.ts';
import { playerStation, pushTimeline, rivals } from './state.ts';
import type { GameState } from './types.ts';
import { formatDateLong } from './time.ts';
import { lockSignatures } from './validate.ts';

export function newGame(input: NewGameInput): { state: GameState; outputs: SimOutputs } {
  const state = createWorld(input);
  lockSignatures(state);
  runWarmup(state);
  const outputs = firstWeekSetup(state);
  welcome(state);
  pushTimeline(state, `Assumiu a Direção de Programação da ${playerStation(state).name}.`, 'carreira');
  return { state, outputs };
}

function welcome(state: GameState): void {
  const ps = playerStation(state);
  const era = ERAS[state.meta.era];
  const sc = SCENARIOS[state.meta.scenario];
  const trat = state.player.pronoun === 'a' ? 'diretora' : state.player.pronoun === 'e' ? 'diretore' : 'diretor';
  const lead = rivals(state).sort((a, b) => (b.history.at(-1)?.prime ?? 0) - (a.history.at(-1)?.prime ?? 0))[0];
  state.pendingInbox.push(
    {
      fromNpc: 'npc_presidente',
      subject: 'Bem-vindo(a) à cadeira mais disputada da casa',
      body: `${state.player.name},\n\nA partir de hoje, ${formatDateLong(state.meta.date)}, a grade da ${ps.name} é sua. Situação: ${sc.situation.toLowerCase()}.\n\nMeta do ano: ${state.targets.description}\nFaturamento esperado: ${money(state.meta.era, state.finance.annualRevenueTarget)}. Verba de programação: ${money(state.meta.era, state.finance.annualBudget)}.\n\nReunião toda sexta. Não me traga desculpa, me traga número.\n\nDr. Otávio Barreto`,
      requiresAction: false,
      eventId: null,
      kind: 'mensagem',
    },
    {
      fromNpc: 'npc_bia',
      subject: 'Seu primeiro dia: por onde começar',
      body: `Oi, ${trat}! Sou a Bia, sua assistente. Deixei um roteiro para as duas primeiras semanas:\n\n1. Leia o Boletim: ali estão os números da semana passada, por faixa e por praça.\n2. Abra a Grade: arraste programas do Acervo para os horários (no celular, toque no programa e depois no horário). Blocos com cadeado são protegidos.\n3. Use "Simular faixa" para ver uma prévia antes de decidir.\n4. Responda a Caixa de Entrada: alguns assuntos travam o "Colocar no ar".\n5. Marque até 3 reuniões por semana: cada uma gasta pontos de agenda (você tem 20).\n6. Clique em "Colocar no ar" para rodar o dia ou a semana inteira.\n\nQualquer dúvida, é só me chamar no botão "Perguntar à Bia". Ah: ${lead ? `a ${lead.name} é quem manda no horário nobre hoje.` : 'a concorrência está de olho em você.'}`,
      requiresAction: false,
      eventId: null,
      kind: 'mensagem',
    },
    {
      fromNpc: 'npc_comercial',
      subject: 'Situação comercial',
      body: `Diretor, resumindo: semana passada faturamos ${money(state.meta.era, state.finance.lastWeek?.revenue ?? 0)} com ${Math.round((state.finance.lastWeek?.occupancy ?? 0.7) * 100)}% do inventário vendido. Preço, desconto máximo e minutos de intervalo ficam na tela Comercial. Ponto não paga conta. Cota paga.\n\nMarta`,
      requiresAction: false,
      eventId: null,
      kind: 'mensagem',
    },
    {
      fromNpc: 'npc_pesquisa',
      subject: `Contexto da era: ${era.name}`,
      body: `${era.summary}\n\n${era.currencyNote}\n\nCaio Nakamura — Pesquisa`,
      requiresAction: false,
      eventId: null,
      kind: 'mensagem',
    },
  );
}
