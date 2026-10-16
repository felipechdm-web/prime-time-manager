// Cenas de fallback (sem LLM): reuniões roteirizadas, dicas da Bia e glossário.
// O jogo nunca trava por causa da IA (seção 17.3).

import { GENRES } from '../engine/catalog/genres.ts';
import { blockingEvents, openEvents } from '../engine/eventsEngine.ts';
import { money } from '../engine/money.ts';
import { programsInWeek, slotArray } from '../engine/schedule.ts';
import { getProgram, npcById, npcByRole, playerStation, politicalCapital } from '../engine/state.ts';
import type { GameState, Npc } from '../engine/types.ts';
import { DAY_SHORT } from '../engine/time.ts';
import { validateSchedule } from '../engine/validate.ts';
import type { MestreOutput } from './types.ts';

export const GLOSSARY: Record<string, string> = {
  'ponto': 'Ponto de audiência (rat): 1% do universo de domicílios com TV da praça medida. Em 2026, 1 ponto no PNT equivale a 277.670 domicílios.',
  'share': 'Share: a fatia da emissora entre os televisores ligados naquele momento (audiência ÷ TLE).',
  'tle': 'TLE (televisores ligados): total de domicílios com TV ligada na faixa; é o "tamanho do bolo".',
  'pnt': 'PNT: Painel Nacional de Televisão, média das 15 praças medidas ponderada pelo tamanho de cada uma. É a base da negociação nacional.',
  'praça': 'Praça: mercado medido (Grande SP, Grande Rio etc.). A Grande SP é a praça de referência do mercado publicitário.',
  'faixa': 'Faixa horária: bloco da grade com perfil de público próprio (madrugada, manhã, meio-dia, vespertino, pré-nobre, nobre, pós-nobre).',
  'nobre': 'Horário nobre: faixa de maior TLE e maior preço comercial, de 18h a 0h, com núcleo de 20h a 22h30.',
  'lead-in': 'Lead-in: o programa anterior, que entrega público ao seguinte. Lead-out é quem herda.',
  'herança': 'Herança (carry-over): a parcela do público de um programa que fica para o seguinte. Gêneros parecidos em sequência seguram mais gente.',
  'contraprogramação': 'Contraprogramação: colocar no ar o oposto do que o líder oferece para pegar o público insatisfeito.',
  'esticar': 'Esticar/encurtar: prolongar ou reduzir uma novela ou reality conforme a audiência. Esticar aumenta a fadiga.',
  'chamada': 'Chamada: anúncio da própria emissora. Usa inventário (deixa de vender intervalo), mas cria expectativa (buzz).',
  'cota': 'Cota de patrocínio: pacote vendido a um anunciante vinculado a um programa, com entrega mínima de pontos. Abaixo dela, a emissora compensa com inserções grátis.',
  'merchandising': 'Merchandising: ação comercial dentro do conteúdo. Rende dinheiro, mas reduz a qualidade percebida e irrita a crítica.',
  'cpp': 'CPP (custo por ponto): preço do comercial de 30s dividido pelos pontos entregues.',
  'grp': 'GRP: soma dos pontos de audiência de todas as inserções de uma campanha.',
  'arrendamento': 'Arrendamento: venda de uma faixa para terceiros (igrejas, televendas). Gera receita fixa, mas a faixa sai do seu controle e pesa na reputação e na herança.',
  'enlatado': 'Enlatado: conteúdo estrangeiro comprado pronto, geralmente dublado.',
  'formato': 'Formato: licença de um programa estrangeiro adaptado localmente (reality, game show).',
  'horizontal': 'Grade horizontal: o mesmo programa no mesmo horário de segunda a sexta. Cria hábito.',
  'hábito': 'Hábito: semanas seguidas no mesmo horário (satura em 8). Mudar de horário zera o hábito na hora.',
  'fadiga': 'Fadiga: desgaste do programa com o tempo e as reprises. Programa fora do ar descansa.',
  'buzz': 'Buzz: expectativa e repercussão (chamadas, imprensa, redes). Decai 15% por semana.',
  'tapa-buraco': 'Tapa-buraco: conteúdo barato para cobrir faixa vazia, sem estratégia. Custa pouco e rende pouco.',
  'minuto a minuto': 'Minuto a minuto: audiência medida a cada minuto; mostra quem "roubou" o público e quando.',
  'classificação': 'Classificação indicativa: livre e 10 anos a qualquer hora; 12 a partir das 20h; 14 a partir das 21h; 16 a partir das 22h; 18 a partir das 23h. Até 2015, fora do horário dá multa; depois, gera pressão pública e regulatória.',
  'hgpe': 'HGPE: Horário Gratuito de Propaganda Eleitoral, obrigatório em anos de eleição, de segunda a sábado às 13h e 20h30, em todas as emissoras abertas.',
  'upfront': 'Upfront: evento anual em que a emissora apresenta a nova grade ao mercado e abre a venda de cotas (no jogo, em março).',
  'capital político': 'Capital político: média ponderada da confiança da presidência (peso 3), Comercial (2), Jornalismo (1), Artístico (1) e equipe (1). Abaixo de 30 a presidência cogita trocar você; abaixo de 15, a demissão é avaliada na reunião trimestral.',
  'agenda': 'Agenda: 20 pontos por semana. Reunião longa custa 4, curta 2, ligação 1, visita a gravação 3, evento com anunciante 3. No máximo 3 reuniões por semana.',
  'afiliada': 'Afiliada: emissora regional que retransmite a rede e tem janelas locais obrigatórias (os blocos "Janela local" da grade).',
};

const TRAT = (s: GameState) => (s.player.pronoun === 'a' ? 'diretora' : s.player.pronoun === 'e' ? 'diretore' : 'diretor');

function out(scene: MestreOutput['scene_type'], narrative: { speaker: string; text: string }[], choices: { id: string; label: string }[] = []): MestreOutput {
  return { scene_type: scene, narrative, headlines: [], choices, player_action: null, proposals: [], memory_notes: [] };
}

export function biaTips(state: GameState): string[] {
  const tips: string[] = [];
  const ps = playerStation(state);
  const v = validateSchedule(state);
  const blocks = blockingEvents(state);
  if (blocks.length) tips.push(`Tem ${blocks.length} decisão(ões) travando o "Colocar no ar" na caixa de entrada: ${blocks.map((e) => `"${e.title}"`).join(', ')}.`);
  const empty = v.issues.filter((i) => i.code === 'faixa_vazia');
  if (empty.length) tips.push(`A grade tem ${empty.length} faixa(s) vazia(s) (${empty.slice(0, 2).map((e) => e.text.replace('Faixa vazia: ', '')).join('; ')}). Use "Preencher vazios" ou arraste algo do acervo.`);
  const others = openEvents(state).length - blocks.length;
  if (others > 0) tips.push(`Há ${others} assunto(s) sem resposta na caixa de entrada; sem resposta, o motor escolhe por você no prazo.`);
  if (v.issues.some((i) => i.code === 'orcamento')) tips.push('O custo da grade desta semana passa da verba. A presidência vai cobrar se continuar.');
  const progs = state.programs.filter((p) => p.stationId === ps.id && p.status === 'on_air' && p.stats.length >= 3);
  const falling = progs
    .map((p) => ({ p, d: p.stats[p.stats.length - 1].pts - p.stats.slice(-4, -1).reduce((s, x) => s + x.pts, 0) / Math.max(1, p.stats.slice(-4, -1).length) }))
    .sort((a, b) => a.d - b.d)[0];
  if (falling && falling.d < -0.3) tips.push(`"${falling.p.title}" vem caindo (${falling.d.toFixed(1).replace('.', ',')} pt sobre a média recente). Na ficha do programa, o botão "Por que caí?" mostra os fatores.`);
  const ready = state.programs.filter((p) => p.stationId === ps.id && p.status === 'ready' && p.createdWeek >= state.meta.weekIndex - 8 && !programsInWeek(state.schedules[ps.id]).has(p.id));
  if (ready.length) tips.push(`"${ready[0].title}" está pronto e fora da grade. Estreia com chamadas (nível 2 ou 3) rende mais.`);
  const ending = state.programs.find((p) => p.stationId === ps.id && p.status === 'on_air' && p.episodes.total && !p.isRerun && p.episodes.total - p.episodes.aired <= 12);
  if (ending) tips.push(`"${ending.title}" está na reta final (${(ending.episodes.total ?? 0) - ending.episodes.aired} capítulo(s)). Prepare a substituta ou estique a trama.`);
  if (state.liveMoments.length) tips.push(`Momento ao vivo nesta semana: ${state.liveMoments.map((m) => `${m.reason} (${DAY_SHORT[m.day]})`).join('; ')}. Rode dia a dia para abrir a Sala de Controle.`);
  const pol = politicalCapital(state);
  if (pol < 35) tips.push(`Seu capital político está em ${pol}. Reuniões bem conduzidas com a presidência e o Comercial ajudam.`);
  const req = state.npcs.filter((n) => n.stationId === ps.id && n.requests.length);
  if (req.length) tips.push(`${req.map((n) => n.name).join(', ')} pediu(ram) reunião. Ignorar custa humor e confiança.`);
  if (state.agenda.points >= 4 && state.agenda.meetings < 3) tips.push(`Você ainda tem ${state.agenda.points} pontos de agenda e ${3 - state.agenda.meetings} reunião(ões) nesta semana.`);
  if (!tips.length) tips.push('Tudo em ordem por aqui. Que tal simular a faixa do nobre antes de colocar a semana no ar?');
  return tips;
}

export function biaAnswer(state: GameState, question: string): MestreOutput {
  const q = question.toLowerCase();
  const hits = Object.entries(GLOSSARY).filter(([k]) => q.includes(k));
  const lines: { speaker: string; text: string }[] = [];
  if (hits.length) {
    for (const [, def] of hits.slice(0, 2)) lines.push({ speaker: 'npc_bia', text: def });
  }
  const tips = biaTips(state);
  if (!hits.length) lines.push({ speaker: 'npc_bia', text: `${TRAT(state).charAt(0).toUpperCase() + TRAT(state).slice(1)}, sem o Mestre disponível agora eu só consigo te passar o resumo da casa:` });
  for (const t of tips.slice(0, hits.length ? 2 : 4)) lines.push({ speaker: 'npc_bia', text: t });
  return out('livre', lines);
}

// ===== Reuniões roteirizadas =====
interface ScriptChoice {
  id: string;
  label: string;
  reply: string;
  mood: number;
  trust: number;
  memory?: string;
}

function roleScript(state: GameState, n: Npc): { opening: string; choices: ScriptChoice[] } {
  const era = state.meta.era;
  const lw = state.finance.lastWeek;
  const k = state.kpis;
  const req = n.requests[0]?.text;
  switch (n.role) {
    case 'presidente':
      return {
        opening: `Nota da casa hoje: ${k?.score ?? '—'}/100. Capital político: ${politicalCapital(state)}. ${k && k.score < 45 ? 'Isso não me agrada.' : 'Dá para melhorar.'} O que você tem para mim?`,
        choices: [
          { id: 'plano', label: 'Apresentar um plano para o nobre', reply: 'Plano eu conheço muitos. Quero ver número em quatro semanas.', mood: 4, trust: 3, memory: 'prometeu um plano para o horário nobre' },
          { id: 'verba', label: 'Pedir mais verba', reply: 'Verba é prêmio, não ponto de partida. Volte com resultado.', mood: -4, trust: -2 },
          { id: 'franco', label: 'Ser franco sobre os riscos', reply: 'Gosto de quem não me enrola. Continue assim.', mood: 2, trust: 4 },
        ],
      };
    case 'comercial':
      return {
        opening: `${req ? `${req}. ` : ''}Semana passada vendemos ${Math.round((lw?.occupancy ?? 0.7) * 100)}% do inventário e faturamos ${money(era, lw?.revenue ?? 0)}. Preciso de programa amigo do anunciante e de liberdade no desconto.`,
        choices: [
          { id: 'desconto', label: 'Liberar mais desconto', reply: 'Agora sim. Vou girar esse inventário.', mood: 10, trust: 3, memory: 'liberou desconto para o Comercial' },
          { id: 'merch', label: 'Abrir espaço para merchandising', reply: 'Os clientes vão adorar. A Lúcia, nem tanto.', mood: 8, trust: 2 },
          { id: 'segurar', label: 'Segurar o preço e a grade', reply: 'Então não me cobre a meta depois.', mood: -6, trust: -2 },
        ],
      };
    case 'jornalismo':
      return {
        opening: `${req ? `${req}. ` : ''}A redação está trabalhando dobrado. Quero garantia de que o telejornal não vai ser espremido.`,
        choices: [
          { id: 'garantir', label: 'Garantir o espaço do jornalismo', reply: 'Vou cobrar essa palavra, diretor.', mood: 10, trust: 4, memory: 'garantiu o espaço do telejornal' },
          { id: 'especial', label: 'Prometer uma cobertura especial', reply: 'Isso anima a redação. Me dê a data.', mood: 6, trust: 2 },
          { id: 'cortar', label: 'Avisar que pode haver cortes', reply: 'Credibilidade se perde em um dia, diretor.', mood: -10, trust: -3 },
        ],
      };
    case 'artistico':
      return {
        opening: `${req ? `${req}. ` : ''}Tenho autores e elenco querendo trabalhar. Sem verba, não sai novela que preste.`,
        choices: [
          { id: 'projeto', label: 'Pedir projetos para o Mercado', reply: 'Vou mandar três sinopses para você aprovar.', mood: 8, trust: 3, memory: 'pediu novos projetos à dramaturgia' },
          { id: 'prestigio', label: 'Prometer uma aposta de prestígio', reply: 'É isso que eu queria ouvir.', mood: 10, trust: 2, memory: 'prometeu uma aposta de prestígio' },
          { id: 'custo', label: 'Cobrar custo menor por capítulo', reply: 'Novela boa não se faz com planilha.', mood: -8, trust: -1 },
        ],
      };
    case 'pesquisa': {
      const ps = playerStation(state);
      const best = state.programs.filter((p) => p.stationId === ps.id && p.stats.length).sort((a, b) => (b.stats.at(-1)?.pts ?? 0) - (a.stats.at(-1)?.pts ?? 0))[0];
      return {
        opening: `${req ? `${req}. ` : ''}${best ? `Seu programa mais forte hoje é "${best.title}", com ${best.stats.at(-1)?.pts.toLocaleString('pt-BR')} pontos.` : 'Os dados ainda estão chegando.'} Com mais investimento eu te dou previsões melhores.`,
        choices: [
          { id: 'investir', label: 'Prometer investimento em pesquisa', reply: 'O dado agradece.', mood: 8, trust: 3 },
          { id: 'analise', label: 'Pedir análise da concorrência', reply: 'Vou cruzar a grade deles com o nosso minuto a minuto.', mood: 4, trust: 2 },
          { id: 'feeling', label: 'Dizer que confia no feeling', reply: 'O dado não tem opinião, diretor. Mas tudo bem.', mood: -5, trust: -2 },
        ],
      };
    }
    case 'promocao':
      return {
        opening: `${req ? `${req}. ` : ''}Estreia sem chamada é estreia no escuro. Me diga quais programas são prioridade.`,
        choices: [
          { id: 'prioridade', label: 'Definir prioridades de chamada', reply: 'Perfeito. Vou montar a campanha.', mood: 8, trust: 3 },
          { id: 'livre', label: 'Dar carta branca', reply: 'Você não vai se arrepender.', mood: 10, trust: 1 },
          { id: 'economia', label: 'Pedir economia de inventário', reply: 'Economizar chamada é economizar audiência.', mood: -6, trust: -1 },
        ],
      };
    case 'juridico':
      return {
        opening: `${req ? `${req}. ` : ''}Classificação indicativa, contratos e regras eleitorais: é aqui que mora o perigo. Algum ponto que você quer revisar?`,
        choices: [
          { id: 'revisar', label: 'Revisar a grade com o Jurídico', reply: 'Assim eu durmo melhor.', mood: 8, trust: 4 },
          { id: 'contratos', label: 'Revisar contratos que vencem', reply: 'Vou te mandar a lista ainda hoje.', mood: 5, trust: 2 },
          { id: 'risco', label: 'Assumir o risco', reply: 'Juridicamente, diretor, a resposta é: depende. E desta vez depende de você.', mood: -5, trust: -2 },
        ],
      };
    case 'assistente':
      return {
        opening: biaTips(state).slice(0, 2).join(' '),
        choices: [
          { id: 'obrigado', label: 'Agradecer a ajuda', reply: 'Disponha! Estou anotando tudo.', mood: 6, trust: 2 },
          { id: 'fofoca', label: 'Pedir as fofocas do corredor', reply: 'Dizem que a concorrência está de olho no nosso elenco...', mood: 8, trust: 1 },
          { id: 'cobrar', label: 'Cobrar mais organização', reply: 'Pode deixar, vou caprichar.', mood: -4, trust: 0 },
        ],
      };
    default: {
      const progs = state.programs.filter((p) => p.talentIds.includes(n.id));
      const p = progs[0];
      const happy = n.mood >= 0;
      return {
        opening: happy
          ? `Diretor, ${p ? `"${p.title}" está indo bem e` : ''} eu quero continuar crescendo aqui. Mas preciso me sentir valorizado(a).`
          : `Vou ser direto(a): não estou feliz. ${p ? `"${p.title}" merece mais atenção` : 'Estou sem espaço'}, e a concorrência tem me ligado.`,
        choices: [
          { id: 'valorizar', label: 'Prometer mais espaço e destaque', reply: 'É o que eu precisava ouvir. Vou cobrar.', mood: 12, trust: 3, memory: 'prometeu mais espaço e destaque' },
          { id: 'aumento', label: 'Acenar com reajuste na renovação', reply: 'Vamos conversar quando o contrato vencer, então.', mood: 8, trust: 2, memory: 'acenou com reajuste na renovação' },
          { id: 'firme', label: 'Ser firme: o contrato é o contrato', reply: 'Entendi. Vou pensar no meu futuro.', mood: -10, trust: -2 },
        ],
      };
    }
  }
}

export function meetingOpening(state: GameState, npcIds: string[]): MestreOutput {
  const lines: { speaker: string; text: string }[] = [];
  const npcs = npcIds.map((id) => npcById(state, id)).filter((x): x is Npc => !!x);
  if (!npcs.length) return out('reuniao', [{ speaker: 'narrador', text: 'A sala está vazia.' }]);
  lines.push({ speaker: 'narrador', text: `${npcs.map((n) => n.name).join(', ')} ${npcs.length > 1 ? 'entram' : 'entra'} na sua sala.` });
  const main = roleScript(state, npcs[0]);
  lines.push({ speaker: npcs[0].id, text: main.opening });
  for (const extra of npcs.slice(1)) lines.push({ speaker: extra.id, text: roleScript(state, extra).opening });
  return out('reuniao', lines, main.choices.map((c) => ({ id: c.id, label: c.label })));
}

export function meetingReply(state: GameState, npcIds: string[], choiceId: string | null, last: boolean): MestreOutput {
  const npcs = npcIds.map((id) => npcById(state, id)).filter((x): x is Npc => !!x);
  const main = npcs[0];
  if (!main) return out('reuniao', [{ speaker: 'narrador', text: 'A reunião terminou.' }]);
  const script = roleScript(state, main);
  const c = script.choices.find((x) => x.id === choiceId);
  const res = out('reuniao', []);
  if (c) {
    res.narrative.push({ speaker: main.id, text: c.reply });
    res.proposals.push({ tag: 'npc_mood', target: main.id, value: c.mood, reason: c.label });
    if (c.trust) res.proposals.push({ tag: 'npc_trust', target: main.id, value: c.trust, reason: c.label });
    if (c.memory) res.memory_notes.push({ npc_id: main.id, fact: `O diretor ${c.memory}.`, weight: 3 });
  } else {
    res.narrative.push({ speaker: main.id, text: 'Anotado. Vou pensar no que você disse.' });
  }
  if (last) res.narrative.push({ speaker: 'narrador', text: 'A reunião termina. Cada um volta para a sua sala com a sua versão da conversa.' });
  else res.choices = script.choices.filter((x) => x.id !== choiceId).map((x) => ({ id: x.id, label: x.label }));
  return res;
}

export function interviewFallback(state: GameState): MestreOutput {
  const ps = playerStation(state);
  const pres = npcByRole(state, 'presidente');
  const k = state.kpis;
  return out('reuniao', [
    { speaker: 'narrador', text: `Cobertura da ${ps.name}. O presidente não se levanta quando você entra.` },
    { speaker: pres?.id ?? 'npc_presidente', text: `Sente. A ${ps.name} hoje marca ${k ? k.aud24.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'} pontos nas 24 horas e ${k ? k.prime.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'} no nobre. ${state.targets.description}` },
    { speaker: pres?.id ?? 'npc_presidente', text: 'A grade é sua. O problema também. Toda sexta, quero números.' },
  ]);
}

export function genreName(g: string): string {
  return GENRES[g as keyof typeof GENRES]?.name ?? g;
}

export function emptySlotsSummary(state: GameState): number {
  const ps = playerStation(state);
  let n = 0;
  for (const d of state.schedules[ps.id]) n += slotArray(d).filter((x) => !x).length;
  return n;
}

export function programTitle(state: GameState, id: string): string {
  return getProgram(state, id)?.title ?? id;
}
