// Baralho de eventos (seção 13). O motor sorteia; o Mestre escreve a cena; o motor aplica o efeito.
// Valores em dinheiro de eventos são relativos: cashWeeks e fine = fração da receita média semanal.
// Alvos de NPC: papel do elenco fixo ('presidente', 'comercial', ...) ou 'context_talent'.
// Alvo de programa: 'context' (o programa sorteado como sujeito do evento).

import type { EffectSet, EraId, EventSeverity, EventTone, Universe } from '../types.ts';

export type CondOp = 'lte' | 'gte' | 'lt' | 'gt' | 'eq' | 'ne' | 'in' | 'true' | 'false';
export type Cond = [string, CondOp, (number | string | boolean | (number | string)[])?];

export interface EventOptionDef {
  id: string;
  label: string;
  effects: EffectSet;
}

export interface EventTemplate {
  id: string;
  category: string;
  title: string;
  severity: EventSeverity;
  tone: EventTone;
  subject: 'none' | 'program' | 'talent';
  trigger: Cond[];
  baseProb: number;
  eras: EraId[] | 'all';
  universe: Universe[] | 'all';
  speaker: string;
  scene: string;
  options: EventOptionDef[];
  defaultOption: string;
  blocking?: boolean;
  deadlineWeeks?: number;
  cooldownWeeks?: number;
  oncePerGame?: boolean;
  calendar?: boolean; // disparado pelo calendário/sistema, não pelo sorteio
  arc?: { key: string; stage: number };
}

const U = 'all' as const;

export const EVENT_TEMPLATES: EventTemplate[] = [
  // ======================= TALENTO =======================
  {
    id: 'talento_pede_aumento', category: 'talento', title: 'Pedido de aumento após recorde', severity: 'medio', tone: 'negativo',
    subject: 'talent', trigger: [['talent.programRank', 'lte', 2], ['talent.ego', 'gte', 65], ['talent.monthsLeft', 'lte', 8]],
    baseProb: 0.3, eras: U, universe: U, speaker: 'context_talent', cooldownWeeks: 16,
    scene: '{talent} entrou na sua sala sem bater. "Diretor, {program} está entre os mais vistos da faixa. Meu empresário acha que 40% de reajuste é o mínimo. A concorrência acha a mesma coisa."',
    options: [
      { id: 'pagar', label: 'Pagar os 40%', effects: { salaryPct: 40, npc: [{ target: 'context_talent', mood: 20, loyalty: 15 }, { target: 'comercial', mood: -5 }] } },
      { id: 'negociar_merch', label: 'Oferecer 15% + cota de merchandising', effects: { salaryPct: 15, program: { target: 'context', quality: -3 }, npc: [{ target: 'context_talent', mood: 5 }, { target: 'comercial', mood: 8 }] } },
      { id: 'deixar_sair', label: 'Não ceder; deixar ir se quiser', effects: { talentLeaves: true, program: { target: 'context', appeal: -15 }, npc: [{ target: 'presidente', trust: -4 }] } },
    ],
    defaultOption: 'deixar_sair',
  },
  {
    id: 'atriz_adoece', category: 'talento', title: 'Protagonista afastada da novela', severity: 'grave', tone: 'negativo',
    subject: 'program', trigger: [['program.group', 'eq', 'drama'], ['program.isFinite', 'true'], ['program.epsLeft', 'gte', 20], ['program.hasTalent', 'true']],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 30,
    scene: 'Lúcia Prado ligou às 7h: a protagonista de {program} foi afastada por ordem médica por pelo menos um mês. "Temos capítulos gravados para dez dias. Depois disso, ou reescrevemos, ou substituímos, ou entramos com compacto."',
    options: [
      { id: 'reescrever', label: 'Reescrever o núcleo', effects: { program: { target: 'context', quality: -2, mult: 0.96, weeks: 4 }, cashWeeks: -0.05, npc: [{ target: 'artistico', mood: 5 }] } },
      { id: 'substituir', label: 'Substituir a atriz', effects: { program: { target: 'context', appeal: -6, buzz: 6 }, reputation: { critics: -1 } } },
      { id: 'pausar', label: 'Pausar e exibir compacto', effects: { program: { target: 'context', mult: 0.85, weeks: 3, buzz: -6 }, npc: [{ target: 'comercial', mood: -8 }] } },
    ],
    defaultOption: 'pausar', blocking: true,
  },
  {
    id: 'apresentador_polemica', category: 'talento', title: 'Polêmica ao vivo', severity: 'medio', tone: 'negativo',
    subject: 'talent', trigger: [['talent.risk', 'gte', 55], ['talent.onAir', 'true']],
    baseProb: 0.12, eras: U, universe: U, speaker: 'npc_juridico', cooldownWeeks: 12,
    scene: 'Ontem, ao vivo, {talent} fez um comentário que pegou mal. O telefone da Dra. Helena não para: "Diretor, temos anunciante pedindo explicação e uma associação ameaçando representar contra a emissora."',
    options: [
      { id: 'suspender', label: 'Suspender por uma semana', effects: { program: { target: 'context', mult: 0.9, weeks: 1 }, npc: [{ target: 'context_talent', mood: -20, loyalty: -10 }, { target: 'juridico', trust: 5 }], reputation: { critics: 2, market: 1 } } },
      { id: 'defender', label: 'Defender publicamente', effects: { npc: [{ target: 'context_talent', mood: 15, loyalty: 10 }, { target: 'comercial', mood: -10 }], reputation: { market: -3, public: 1 }, program: { target: 'context', buzz: 8 } } },
      { id: 'nota', label: 'Nota oficial de desculpas', effects: { npc: [{ target: 'context_talent', mood: -5 }], reputation: { market: 1 } } },
    ],
    defaultOption: 'nota',
  },
  {
    id: 'ator_quer_sair', category: 'talento', title: 'Ator quer deixar a novela', severity: 'medio', tone: 'negativo',
    subject: 'talent', trigger: [['talent.mood', 'lte', -10], ['talent.programIsNovela', 'true']],
    baseProb: 0.15, eras: U, universe: U, speaker: 'context_talent', cooldownWeeks: 20,
    scene: '{talent} quer sair de {program} antes do fim da trama. "Recebi um convite para teatro e estou cansado do meu personagem. Ou vocês me dão um arco de verdade, ou eu peço para morrer na história."',
    options: [
      { id: 'liberar', label: 'Liberar e matar o personagem', effects: { program: { target: 'context', buzz: 10, appeal: -5 }, npc: [{ target: 'context_talent', mood: 10 }, { target: 'artistico', mood: -5 }] } },
      { id: 'aumento', label: 'Segurar com aumento', effects: { salaryPct: 20, npc: [{ target: 'context_talent', mood: 15, loyalty: 10 }] } },
      { id: 'arco', label: 'Pedir ao autor um arco maior', effects: { program: { target: 'context', quality: 2 }, npc: [{ target: 'context_talent', mood: 8 }, { target: 'artistico', mood: 5 }] } },
    ],
    defaultOption: 'liberar',
  },
  {
    id: 'apresentador_doente', category: 'talento', title: 'Apresentador fora do ar', severity: 'leve', tone: 'negativo',
    subject: 'talent', trigger: [['talent.onAir', 'true'], ['talent.archetypeIn', 'in', ['apresentador_auditorio', 'apresentadora_matinal', 'apresentador_talk', 'apresentador_policial', 'apresentador_reality']]],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 20,
    scene: 'Bia trouxe o recado: {talent} está com laringite e não grava esta semana. "A produção sugeriu três saídas. A Marta só pediu que não seja reprise, porque o cliente pagou por programa inédito."',
    options: [
      { id: 'substituto', label: 'Chamar apresentador substituto', effects: { program: { target: 'context', mult: 0.92, weeks: 1 } } },
      { id: 'reprise', label: 'Exibir reprise de melhores momentos', effects: { program: { target: 'context', mult: 0.85, weeks: 1 }, npc: [{ target: 'comercial', mood: -6 }] } },
      { id: 'especial', label: 'Montar especial com convidados (custo extra)', effects: { cashWeeks: -0.04, program: { target: 'context', mult: 0.98, weeks: 1, buzz: 3 } } },
    ],
    defaultOption: 'reprise',
  },
  {
    id: 'talento_assediado', category: 'concorrencia', title: 'Assédio da concorrência', severity: 'grave', tone: 'negativo',
    subject: 'talent', trigger: [['talent.monthsLeft', 'lte', 6], ['talent.popularity', 'gte', 55]],
    baseProb: 0.0, calendar: true, eras: U, universe: U, speaker: 'context_talent',
    scene: '{talent} pediu uma conversa franca: "A {rival} me ofereceu o dobro e horário nobre garantido. Gosto daqui, mas preciso ouvir uma proposta sua até sexta."',
    options: [
      { id: 'cobrir', label: 'Cobrir a proposta (+60% de salário)', effects: { salaryPct: 60, npc: [{ target: 'context_talent', mood: 15, loyalty: 20 }, { target: 'comercial', mood: -4 }] } },
      { id: 'contraproposta', label: 'Contraproposta de +25% e mais visibilidade', effects: { salaryPct: 25, program: { target: 'context', buzz: 5 }, npc: [{ target: 'context_talent', mood: 5, loyalty: 5 }] } },
      { id: 'deixar_ir', label: 'Deixar ir para a concorrência', effects: { talentLeaves: true, program: { target: 'context', appeal: -12 }, reputation: { public: -2 } } },
    ],
    defaultOption: 'deixar_ir', blocking: true,
  },
  {
    id: 'autor_mata_personagem', category: 'bastidor', title: 'Autor quer matar o personagem mais popular', severity: 'medio', tone: 'neutro',
    subject: 'program', trigger: [['program.isNovela', 'true'], ['program.epsLeft', 'gte', 25], ['program.rank', 'lte', 3]],
    baseProb: 0.1, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 20,
    scene: 'O autor de {program} mandou a escaleta dos próximos capítulos: o personagem mais querido do público morre no capítulo de sexta. Lúcia apoia. Marta já ouviu falar e está na porta.',
    options: [
      { id: 'vetar', label: 'Vetar a morte', effects: { npc: [{ target: 'artistico', mood: -12, trust: -5 }, { target: 'comercial', mood: 6 }], program: { target: 'context', quality: -2 } } },
      { id: 'permitir', label: 'Permitir', effects: { program: { target: 'context', buzz: 15, appeal: -4 }, npc: [{ target: 'artistico', mood: 10, trust: 4 }], reputation: { critics: 2 } } },
      { id: 'final_alternativo', label: 'Negociar um final ambíguo', effects: { program: { target: 'context', buzz: 8 }, npc: [{ target: 'artistico', mood: 2 }] } },
    ],
    defaultOption: 'permitir',
  },
  // ======================= CONCORRÊNCIA =======================
  {
    id: 'rival_estreia_no_horario', category: 'concorrencia', title: 'Rival estreia no seu horário mais rentável', severity: 'medio', tone: 'negativo',
    subject: 'program', trigger: [['program.isTopRevenue', 'true']],
    baseProb: 0.08, eras: U, universe: U, speaker: 'npc_pesquisa', cooldownWeeks: 14,
    scene: 'Caio colocou o gráfico na mesa: a {rival} vai estrear uma atração forte justamente contra {program}, a faixa que mais fatura na casa. "A pesquisa qualitativa deles vazou. Eles querem o nosso público."',
    options: [
      { id: 'chamadas', label: 'Manter e investir pesado em chamadas', effects: { program: { target: 'context', buzz: 12 }, cashWeeks: -0.05, npc: [{ target: 'promocao', mood: 10 }] } },
      { id: 'reforcar', label: 'Reforçar o programa (verba extra)', effects: { program: { target: 'context', quality: 4 }, cashWeeks: -0.1, npc: [{ target: 'artistico', mood: 5 }] } },
      { id: 'ignorar', label: 'Não reagir', effects: { program: { target: 'context', mult: 0.94, weeks: 3 } } },
    ],
    defaultOption: 'ignorar',
  },
  {
    id: 'informante_grade', category: 'concorrencia', title: 'Informante oferece a grade do rival', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [['player.analyst', 'false']],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 26,
    scene: 'Bia fechou a porta: "Um produtor da {rival} quer conversar. Diz que pode passar os planos de grade deles para o próximo trimestre. Quer dinheiro, claro."',
    options: [
      { id: 'pagar', label: 'Pagar pela informação', effects: { cashWeeks: -0.03, flag: { informante: true }, research: 10, reputation: { market: -1 } } },
      { id: 'recusar', label: 'Recusar', effects: { npc: [{ target: 'juridico', trust: 3 }] } },
    ],
    defaultOption: 'recusar',
  },
  {
    id: 'rival_quebra', category: 'mercado', title: 'Emissora concorrente em colapso', severity: 'medio', tone: 'positivo',
    subject: 'none', trigger: [['game.rivalInCrisis', 'true']],
    baseProb: 0.04, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 52,
    scene: 'A {rival} atrasou salários pelo terceiro mês e o acervo dela está sendo oferecido a preço de banana. "Tem gente boa lá dentro querendo vir para cá", diz Bia.',
    options: [
      { id: 'comprar_acervo', label: 'Comprar parte do acervo', effects: { cashWeeks: -0.2, addOffer: 'acervo_rival', reputation: { market: 1 } } },
      { id: 'contratar', label: 'Contratar talentos de lá', effects: { addOffer: 'talento_rival', npc: [{ target: 'artistico', mood: 5 }] } },
      { id: 'observar', label: 'Só observar', effects: {} },
    ],
    defaultOption: 'observar',
  },
  // ======================= COMERCIAL =======================
  {
    id: 'anunciante_ameaca_sair', category: 'comercial', title: 'Maior anunciante ameaça sair', severity: 'grave', tone: 'negativo',
    subject: 'program', trigger: [['program.groupIn', 'in', ['jornalismo', 'reality', 'humor']], ['program.genre', 'in', ['policial', 'reality', 'humoristico', 'talk_show']]],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 26,
    scene: 'Marta não sentou: "{advertiser} mandou carta. Se {program} continuar no ar do jeito que está, eles tiram toda a verba da emissora no próximo trimestre. É o nosso maior cliente, diretor."',
    options: [
      { id: 'ceder', label: 'Ceder e suavizar o programa', effects: { program: { target: 'context', appeal: -8, quality: 2 }, npc: [{ target: 'comercial', mood: 12, trust: 6 }], reputation: { market: 2 } } },
      { id: 'outro_horario', label: 'Oferecer ao cliente outro horário', effects: { occupancy: { delta: -0.02, weeks: 6 }, npc: [{ target: 'comercial', mood: 2 }] } },
      { id: 'bancar', label: 'Bancar o programa', effects: { occupancy: { delta: -0.06, weeks: 10 }, npc: [{ target: 'comercial', mood: -15, trust: -6 }], program: { target: 'context', buzz: 6 } } },
    ],
    defaultOption: 'bancar', blocking: true,
  },
  {
    id: 'patrocinador_quer_cota', category: 'comercial', title: 'Patrocinador quer cota exclusiva', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.rank', 'lte', 2], ['program.commercial', 'gte', 55]],
    baseProb: 0.12, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 10,
    scene: 'Marta chega sorrindo, o que é raro: "{advertiser} quer cota de patrocínio em {program} até o fim da temporada. Pagam bem, mas exigem entrega mínima de pontos."',
    options: [
      { id: 'aceitar', label: 'Aceitar a cota', effects: { addOffer: 'cota_context', npc: [{ target: 'comercial', mood: 10, trust: 4 }] } },
      { id: 'subir_preco', label: 'Pedir 20% a mais', effects: { addOffer: 'cota_context_premium', npc: [{ target: 'comercial', mood: 4 }] } },
      { id: 'recusar', label: 'Recusar', effects: { npc: [{ target: 'comercial', mood: -10 }] } },
    ],
    defaultOption: 'recusar',
  },
  {
    id: 'merchandising_excessivo', category: 'comercial', title: 'Comercial quer mais merchandising', severity: 'leve', tone: 'neutro',
    subject: 'program', trigger: [['program.merch', 'lte', 1], ['program.commercial', 'gte', 60]],
    baseProb: 0.1, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 12,
    scene: '"Tenho três clientes querendo ação dentro de {program}", diz Marta. "Uma no começo, uma no meio, uma no fim. É dinheiro na mesa." Lúcia, do outro lado, revira os olhos.',
    options: [
      { id: 'aceitar', label: 'Aceitar três ações por episódio', effects: { flag: { merch_up: true }, program: { target: 'context', commercial: 5, quality: -3 }, npc: [{ target: 'comercial', mood: 10 }, { target: 'artistico', mood: -8 }], cashWeeks: 0.06, reputation: { critics: -2 } } },
      { id: 'limitar', label: 'Uma ação discreta', effects: { cashWeeks: 0.02, npc: [{ target: 'comercial', mood: 3 }] } },
      { id: 'recusar', label: 'Recusar', effects: { npc: [{ target: 'comercial', mood: -8 }, { target: 'artistico', mood: 6 }] } },
    ],
    defaultOption: 'limitar',
  },
  {
    id: 'desconto_comercial', category: 'comercial', title: 'Pedido de desconto agressivo', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [['player.occupancy', 'lte', 0.72]],
    baseProb: 0.18, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 10,
    scene: 'Marta foi direta: "A ocupação caiu. Se eu não puder dar mais desconto às agências, o inventário encalha. Preciso da sua autorização por escrito."',
    options: [
      { id: 'autorizar', label: 'Autorizar desconto maior', effects: { occupancy: { delta: 0.07, weeks: 6 }, priceMult: 0.95, npc: [{ target: 'comercial', mood: 8 }] } },
      { id: 'negar', label: 'Manter a política de preço', effects: { npc: [{ target: 'comercial', mood: -8, trust: -3 }] } },
    ],
    defaultOption: 'negar',
  },
  {
    id: 'queda_mercado_publicitario', category: 'financeiro', title: 'Mercado publicitário esfria', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [],
    baseProb: 0.025, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 40,
    scene: 'As agências cortaram verbas para o próximo mês. "Não é só com a gente, diretor, é o mercado inteiro", diz Marta. "Mas o presidente vai olhar só para o nosso número."',
    options: [
      { id: 'cortar_tabela', label: 'Baixar a tabela para segurar clientes', effects: { priceMult: 0.92, occupancy: { delta: 0.03, weeks: 8 } } },
      { id: 'manter', label: 'Manter preço e aguentar', effects: { occupancy: { delta: -0.06, weeks: 6 } } },
      { id: 'novos_clientes', label: 'Caçar novos anunciantes (agenda)', effects: { agenda: -3, occupancy: { delta: -0.02, weeks: 6 }, npc: [{ target: 'comercial', mood: 6 }] } },
    ],
    defaultOption: 'manter',
  },
  // ======================= JORNALISMO =======================
  {
    id: 'plantao_capitulo_final', category: 'jornalismo', title: 'Plantão em pleno horário nobre', severity: 'medio', tone: 'neutro',
    subject: 'program', trigger: [['program.isPrime', 'true'], ['program.groupIn', 'in', ['drama', 'reality', 'variedade']]],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_jornalismo', cooldownWeeks: 16,
    scene: 'Henrique invadiu a sala de controle: "Fato grave em Brasília. Precisamos entrar com plantão agora, no meio de {program}." Marta, ao telefone, implora para esperar o intervalo.',
    options: [
      { id: 'ao_vivo', label: 'Entrar ao vivo imediatamente', effects: { program: { target: 'context', mult: 0.95, weeks: 1 }, npc: [{ target: 'jornalismo', mood: 12, trust: 6 }, { target: 'comercial', mood: -6 }], reputation: { critics: 2, public: 1 } } },
      { id: 'rodape', label: 'Rodapé na tela e plantão no intervalo', effects: { npc: [{ target: 'jornalismo', mood: 2 }] } },
      { id: 'esperar', label: 'Esperar o fim do programa', effects: { npc: [{ target: 'jornalismo', mood: -12, trust: -6 }], reputation: { critics: -2 } } },
    ],
    defaultOption: 'rodape',
  },
  {
    id: 'jornalismo_quer_espaco', category: 'jornalismo', title: 'Jornalismo quer mais espaço', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [['npc.jornalismo.mood', 'lte', 10]],
    baseProb: 0.08, eras: U, universe: U, speaker: 'npc_jornalismo', cooldownWeeks: 20,
    scene: '"Estamos encolhendo, diretor", diz Henrique. "Quero mais quinze minutos no telejornal da noite e um programa de entrevistas. Sem isso, a redação perde gente."',
    options: [
      { id: 'aceitar', label: 'Prometer ampliar na próxima temporada', effects: { flag: { promessa_jornalismo: true }, npc: [{ target: 'jornalismo', mood: 12, trust: 5 }], delayed: { inWeeks: 12, effects: { npc: [{ target: 'jornalismo', mood: -15, trust: -10 }] }, note: 'Henrique cobra a promessa de mais espaço não cumprida' } } },
      { id: 'verba', label: 'Dar verba para reportagens especiais', effects: { cashWeeks: -0.04, npc: [{ target: 'jornalismo', mood: 8 }], reputation: { critics: 1 } } },
      { id: 'negar', label: 'Negar', effects: { npc: [{ target: 'jornalismo', mood: -10, trust: -4 }] } },
    ],
    defaultOption: 'negar',
  },
  {
    id: 'erro_jornalismo', category: 'jornalismo', title: 'Erro no telejornal', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [],
    baseProb: 0.03, eras: U, universe: U, speaker: 'npc_juridico', cooldownWeeks: 30,
    scene: 'O telejornal da noite divulgou uma informação errada sobre um empresário. A Dra. Helena já recebeu a notificação: "Direito de resposta ou processo. A escolha é sua, mas eu sei qual eu faria."',
    options: [
      { id: 'retratacao', label: 'Retratação no ar', effects: { reputation: { critics: 1, public: -1 }, npc: [{ target: 'juridico', trust: 5 }, { target: 'jornalismo', mood: -5 }] } },
      { id: 'defender', label: 'Defender o repórter e ir à Justiça', effects: { fine: 0.06, npc: [{ target: 'jornalismo', mood: 10 }, { target: 'juridico', trust: -5 }], reputation: { critics: -2 } } },
    ],
    defaultOption: 'retratacao',
  },
  // ======================= REGULAÇÃO =======================
  {
    id: 'notificacao_classificacao', category: 'regulacao', title: 'Notificação por classificação indicativa', severity: 'medio', tone: 'negativo',
    subject: 'program', trigger: [['program.ratingViolation', 'true']],
    baseProb: 0.45, eras: U, universe: U, speaker: 'npc_juridico', cooldownWeeks: 8,
    scene: 'Chegou notificação do Ministério da Justiça sobre {program}, exibido fora do horário da sua classificação. A Dra. Helena separou três caminhos.',
    options: [
      { id: 'mudar', label: 'Prometer mudar de horário', effects: { flag: { classificacao_prometida: true }, npc: [{ target: 'juridico', trust: 4 }] } },
      { id: 'editar', label: 'Editar o conteúdo para a faixa', effects: { program: { target: 'context', quality: -4, appeal: -3 }, npc: [{ target: 'juridico', trust: 6 }] } },
      { id: 'recorrer', label: 'Recorrer', effects: { fine: 0.04, reputation: { critics: -1, public: -1 }, npc: [{ target: 'juridico', mood: -5 }] } },
    ],
    defaultOption: 'recorrer',
  },
  // ======================= IMPRENSA =======================
  {
    id: 'colunista_demissao', category: 'imprensa', title: 'Colunista anuncia sua demissão', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [['player.political', 'lte', 45]],
    baseProb: 0.15, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 16,
    scene: 'A nota saiu cedo na {column}: "Fontes garantem que o diretor de programação da {station} não passa do próximo trimestre." Bia pergunta, sem graça, se você viu.',
    options: [
      { id: 'desmentir', label: 'Desmentir publicamente', effects: { reputation: { public: 1 }, npc: [{ target: 'presidente', mood: -3 }] } },
      { id: 'ignorar', label: 'Ignorar', effects: { npc: [{ target: 'assistente', mood: -2 }] } },
      { id: 'usar', label: 'Usar a seu favor e pedir apoio ao presidente (agenda)', effects: { agenda: -2, npc: [{ target: 'presidente', trust: 4, mood: 4 }] } },
    ],
    defaultOption: 'ignorar',
  },
  {
    id: 'critica_elogia', category: 'imprensa', title: 'Crítica rasgada de elogios', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.quality', 'gte', 70]],
    baseProb: 0.1, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 8,
    scene: 'A {column} dedicou a coluna inteira a {program}: "a melhor coisa da TV aberta hoje". Rodrigo Leme já quer transformar a frase em chamada.',
    options: [
      { id: 'chamada', label: 'Usar a crítica nas chamadas', effects: { program: { target: 'context', buzz: 10 }, npc: [{ target: 'promocao', mood: 8 }], reputation: { critics: 2 } } },
      { id: 'discreto', label: 'Agradecer discretamente', effects: { reputation: { critics: 3 } } },
    ],
    defaultOption: 'discreto',
  },
  {
    id: 'vazamento_capitulo', category: 'bastidor', title: 'Vazamento de capítulo', severity: 'leve', tone: 'neutro',
    subject: 'program', trigger: [['program.isNovela', 'true'], ['program.epsLeft', 'gte', 10]],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 20,
    scene: 'O capítulo da semana que vem de {program} vazou na internet. Lúcia quer achar o culpado; Rodrigo acha que é publicidade de graça.',
    options: [
      { id: 'investigar', label: 'Abrir investigação interna', effects: { npc: [{ target: 'artistico', mood: 6 }], cashWeeks: -0.01 } },
      { id: 'aproveitar', label: 'Aproveitar a curiosidade', effects: { program: { target: 'context', buzz: 8 }, npc: [{ target: 'promocao', mood: 6 }, { target: 'artistico', mood: -6 }] } },
    ],
    defaultOption: 'aproveitar',
  },
  // ======================= BASTIDOR / PESSOAS =======================
  {
    id: 'presidente_sobrinho', category: 'bastidor', title: '"Quero meu sobrinho no ar"', severity: 'medio', tone: 'neutro',
    subject: 'none', trigger: [],
    baseProb: 0.03, eras: U, universe: U, speaker: 'npc_presidente', cooldownWeeks: 52, oncePerGame: true,
    scene: 'O presidente chamou você à cobertura: "Meu sobrinho fez curso de apresentador em Miami. Quero ele no ar. Não precisa ser no nobre. Mas precisa ser logo."',
    options: [
      { id: 'aceitar', label: 'Dar um programa na madrugada de sábado', effects: { npc: [{ target: 'presidente', trust: 8, mood: 10 }, { target: 'artistico', mood: -5 }], reputation: { critics: -2 }, cashWeeks: -0.02 } },
      { id: 'teste', label: 'Propor um teste com piloto antes', effects: { npc: [{ target: 'presidente', trust: 2 }], cashWeeks: -0.01 } },
      { id: 'recusar', label: 'Recusar com jeito', effects: { npc: [{ target: 'presidente', trust: -8, mood: -10 }] } },
    ],
    defaultOption: 'teste',
  },
  {
    id: 'greve_tecnicos', category: 'bastidor', title: 'Ameaça de greve dos técnicos', severity: 'grave', tone: 'negativo',
    subject: 'none', trigger: [],
    baseProb: 0.015, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 52,
    scene: 'O sindicato avisou: sem reajuste, os técnicos cruzam os braços na segunda. "Sem técnico, não tem nem telejornal ao vivo", lembra Bia.',
    options: [
      { id: 'negociar', label: 'Negociar o reajuste', effects: { cashWeeks: -0.08, npc: [{ target: 'presidente', mood: -4 }] } },
      { id: 'endurecer', label: 'Endurecer', effects: { allBuzz: -6, tle: { mult: 0.97, weeks: 2 }, reputation: { public: -2 } } },
      { id: 'reprises', label: 'Preparar reprises e esperar', effects: { allBuzz: -4, npc: [{ target: 'comercial', mood: -8 }] } },
    ],
    defaultOption: 'reprises', blocking: true,
  },
  {
    id: 'falha_transmissao', category: 'bastidor', title: 'Falha de transmissão no nobre', severity: 'leve', tone: 'negativo',
    subject: 'program', trigger: [['program.isPrime', 'true']],
    baseProb: 0.02, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 26,
    scene: 'O sinal caiu por quatro minutos durante {program}. A tela preta virou assunto no dia seguinte.',
    options: [
      { id: 'desculpas', label: 'Pedir desculpas no ar', effects: { reputation: { public: 1 } } },
      { id: 'investir', label: 'Investir em equipamento novo', effects: { cashWeeks: -0.06, reputation: { market: 1 } } },
      { id: 'silencio', label: 'Fingir que nada aconteceu', effects: { reputation: { public: -1 } } },
    ],
    defaultOption: 'silencio',
  },
  {
    id: 'analista_alerta', category: 'pesquisa', title: 'Pesquisa detecta perda de público', severity: 'leve', tone: 'neutro',
    subject: 'program', trigger: [['program.delta4w', 'lte', -0.8], ['program.weeksOnAir', 'gte', 4]],
    baseProb: 0.25, eras: U, universe: U, speaker: 'npc_pesquisa', cooldownWeeks: 6,
    scene: 'Caio cruzou os dados: {program} está perdendo público semana a semana. "Não é ruído, diretor. É tendência. O público jovem foi o primeiro a sair."',
    options: [
      { id: 'reformular', label: 'Reformular o programa (verba)', effects: { cashWeeks: -0.05, program: { target: 'context', quality: 4, appeal: 4, fatigue: -10 }, npc: [{ target: 'pesquisa', trust: 4 }] } },
      { id: 'chamadas', label: 'Reforçar chamadas', effects: { program: { target: 'context', buzz: 8 }, npc: [{ target: 'promocao', mood: 4 }] } },
      { id: 'manter', label: 'Manter e observar', effects: { npc: [{ target: 'pesquisa', trust: -2 }] } },
    ],
    defaultOption: 'manter',
  },
  {
    id: 'piloto_ruim', category: 'bastidor', title: 'Piloto mal avaliado no grupo de discussão', severity: 'medio', tone: 'negativo',
    subject: 'program', trigger: [['program.inDevelopment', 'true']],
    baseProb: 0.12, eras: U, universe: U, speaker: 'npc_pesquisa', cooldownWeeks: 8,
    scene: 'O grupo de discussão de {program} foi duro: personagens confusos e ritmo lento. Caio recomenda mexer; Lúcia acha que o grupo "não entendeu a proposta".',
    options: [
      { id: 'reformular', label: 'Reformular (mais 4 semanas e custo)', effects: { program: { target: 'context', quality: 6, appeal: 6 }, cashWeeks: -0.04, flag: { dev_delay: 4 } } },
      { id: 'seguir', label: 'Seguir assim', effects: { program: { target: 'context', appeal: -4 }, npc: [{ target: 'artistico', mood: 6 }] } },
      { id: 'cancelar', label: 'Cancelar o projeto', effects: { program: { target: 'context', endNow: true }, npc: [{ target: 'artistico', mood: -15, trust: -6 }] } },
    ],
    defaultOption: 'seguir',
  },
  {
    id: 'autor_atrasado', category: 'bastidor', title: 'Autor atrasado com os capítulos', severity: 'leve', tone: 'negativo',
    subject: 'program', trigger: [['program.inDevelopment', 'true']],
    baseProb: 0.1, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 8,
    scene: 'O autor de {program} está três semanas atrasado com os roteiros. Lúcia pede paciência; a produção pede uma decisão.',
    options: [
      { id: 'prazo', label: 'Dar mais prazo', effects: { flag: { dev_delay: 3 }, npc: [{ target: 'artistico', mood: 5 }] } },
      { id: 'pressionar', label: 'Pressionar e manter a data', effects: { program: { target: 'context', quality: -4 } } },
      { id: 'colaboradores', label: 'Contratar colaboradores', effects: { cashWeeks: -0.03, program: { target: 'context', quality: -1 } } },
    ],
    defaultOption: 'pressionar',
  },
  {
    id: 'publico_confuso', category: 'publico', title: 'Público confuso com a grade', severity: 'leve', tone: 'negativo',
    subject: 'program', trigger: [['program.movesRecent', 'gte', 2]],
    baseProb: 0.6, eras: U, universe: U, speaker: 'npc_pesquisa', cooldownWeeks: 6,
    scene: 'Caio mostra as cartas e ligações do público: ninguém sabe mais a que horas passa {program}. "Mudar de horário toda hora mata o hábito, diretor."',
    options: [
      { id: 'estabilizar', label: 'Prometer estabilidade', effects: { program: { target: 'context', buzz: 2 }, npc: [{ target: 'pesquisa', trust: 3 }] } },
      { id: 'campanha', label: 'Campanha de chamadas com o novo horário', effects: { program: { target: 'context', buzz: 8 }, cashWeeks: -0.02 } },
    ],
    defaultOption: 'estabilizar',
  },
  {
    id: 'recorde_audiencia', category: 'sorte', title: 'Recorde de audiência!', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.isRecord', 'true']],
    baseProb: 0.7, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 4,
    scene: 'Bia entra correndo com o consolidado: {program} bateu o recorde da casa! A redação aplaudiu e o presidente mandou um bilhete de duas palavras: "Continue assim."',
    options: [
      { id: 'festa', label: 'Comemoração com o elenco (custo)', effects: { cashWeeks: -0.02, npc: [{ target: 'artistico', mood: 10 }, { target: 'presidente', mood: 6 }], program: { target: 'context', buzz: 6 } } },
      { id: 'chamada', label: 'Transformar em chamada', effects: { program: { target: 'context', buzz: 10 }, npc: [{ target: 'promocao', mood: 6 }] } },
      { id: 'discreto', label: 'Manter os pés no chão', effects: { npc: [{ target: 'pesquisa', trust: 3 }] } },
    ],
    defaultOption: 'chamada',
  },
  {
    id: 'premio_tv', category: 'imprensa', title: 'Indicação a prêmio de TV', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.quality', 'gte', 72], ['game.month', 'in', [11, 12]]],
    baseProb: 0.3, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 40,
    scene: '{program} foi indicado ao Troféu Antena de Ouro, o prêmio da crítica. Lúcia quer fazer campanha junto aos jurados.',
    options: [
      { id: 'campanha', label: 'Fazer campanha (custo)', effects: { cashWeeks: -0.02, reputation: { critics: 4 }, npc: [{ target: 'artistico', mood: 10 }], program: { target: 'context', buzz: 6 } } },
      { id: 'aceitar', label: 'Só torcer', effects: { reputation: { critics: 2 } } },
    ],
    defaultOption: 'aceitar',
  },
  {
    id: 'homenagem_veterano', category: 'bastidor', title: 'Homenagem a um veterano da casa', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.02, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 52,
    scene: 'Um ator veterano da casa completa 50 anos de carreira. Lúcia propõe um especial no domingo à noite.',
    options: [
      { id: 'especial', label: 'Produzir o especial', effects: { cashWeeks: -0.03, reputation: { critics: 3, public: 2 }, npc: [{ target: 'artistico', mood: 10 }] } },
      { id: 'nota', label: 'Só uma nota no telejornal', effects: { npc: [{ target: 'artistico', mood: -3 }] } },
    ],
    defaultOption: 'nota',
  },
  {
    id: 'fas_protesto', category: 'publico', title: 'Fã-clube protesta contra cancelamento', severity: 'leve', tone: 'negativo',
    subject: 'none', trigger: [['flag.cancelou_recentemente', 'true']],
    baseProb: 0.5, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 12,
    scene: 'Um grupo de fãs fez vigília na porta da emissora contra o cancelamento do programa. A imprensa adorou.',
    options: [
      { id: 'especial', label: 'Exibir um especial de despedida', effects: { cashWeeks: -0.01, reputation: { public: 2 } } },
      { id: 'ignorar', label: 'Ignorar', effects: { reputation: { public: -2 } } },
    ],
    defaultOption: 'ignorar',
  },
  {
    id: 'investidor_cobra', category: 'financeiro', title: 'Investidor cobra resultados', severity: 'grave', tone: 'negativo',
    subject: 'none', trigger: [['game.scenarioIn', 'in', ['rede_nova', 'emissora_crise']], ['player.revVsTarget', 'lte', 0.92]],
    baseProb: 0.12, eras: U, universe: U, speaker: 'npc_presidente', cooldownWeeks: 16,
    scene: 'O presidente encaminhou o e-mail do investidor sem comentário, só com um ponto de interrogação. Os números estão abaixo do plano e a paciência do dinheiro é curta.',
    options: [
      { id: 'cortar', label: 'Cortar custos de programação', effects: { budget: -0.03, npc: [{ target: 'presidente', trust: 4 }, { target: 'artistico', mood: -8 }] } },
      { id: 'prazo', label: 'Pedir mais prazo com um plano', effects: { npc: [{ target: 'presidente', patience: -10 }], agenda: -2 } },
      { id: 'apostar', label: 'Pedir aporte para uma grande aposta', effects: { budget: 0.05, npc: [{ target: 'presidente', trust: -4, patience: -15 }] } },
    ],
    defaultOption: 'prazo', blocking: true,
  },
  {
    id: 'coproducao_proposta', category: 'mercado', title: 'Produtora independente propõe coprodução', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 16,
    scene: 'Uma produtora independente apresentou um projeto pronto para coprodução: divide custo e receita. Lúcia gostou do piloto.',
    options: [
      { id: 'aceitar', label: 'Ver a proposta no mercado', effects: { addOffer: 'coproducao' } },
      { id: 'recusar', label: 'Recusar', effects: {} },
    ],
    defaultOption: 'recusar',
  },
  {
    id: 'pacote_filmes', category: 'mercado', title: 'Pacote de filmes campeões de bilheteria', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 16,
    scene: 'Uma distribuidora oferece com exclusividade um pacote de filmes campeões de bilheteria. "Isso enche a tabela de qualquer domingo", diz Marta.',
    options: [
      { id: 'comprar', label: 'Ver a oferta no mercado', effects: { addOffer: 'filmes_premium' } },
      { id: 'recusar', label: 'Recusar', effects: {} },
    ],
    defaultOption: 'recusar',
  },
  {
    id: 'formato_internacional', category: 'mercado', title: 'Formato internacional disputado', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_artistico', cooldownWeeks: 20,
    scene: 'Uma distribuidora europeia tem um formato que foi sucesso em 30 países. Duas emissoras já demonstraram interesse.',
    options: [
      { id: 'ver', label: 'Ver a oferta no mercado', effects: { addOffer: 'formato' } },
      { id: 'passar', label: 'Passar', effects: {} },
    ],
    defaultOption: 'passar',
  },
  {
    id: 'upfront', category: 'comercial', title: 'Upfront: apresentar a grade ao mercado', severity: 'medio', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'É semana de Upfront: agências e anunciantes vão conhecer a grade do ano. Marta quer um evento à altura; Rodrigo já tem ideia de vinheta.',
    options: [
      { id: 'grande', label: 'Evento grande com o elenco', effects: { cashWeeks: -0.06, reputation: { market: 4 }, occupancy: { delta: 0.04, weeks: 16 }, npc: [{ target: 'comercial', mood: 12 }, { target: 'promocao', mood: 8 }] } },
      { id: 'simples', label: 'Apresentação simples', effects: { cashWeeks: -0.015, reputation: { market: 1 }, occupancy: { delta: 0.01, weeks: 12 } } },
      { id: 'pular', label: 'Não fazer Upfront', effects: { reputation: { market: -3 }, npc: [{ target: 'comercial', mood: -12, trust: -5 }] } },
    ],
    defaultOption: 'simples',
  },
  {
    id: 'final_campeonato', category: 'sorte', title: 'Final de campeonato com o time de maior torcida', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [['player.hasSports', 'true'], ['game.month', 'in', [5, 6, 11, 12]]],
    baseProb: 0.25, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 20,
    scene: 'A final do campeonato vai ter o time de maior torcida do país, e os direitos são seus. Marta já tem fila de anunciante.',
    options: [
      { id: 'pos_jogo', label: 'Esticar com pós-jogo especial', effects: { cashWeeks: 0.06, reputation: { public: 2 }, tle: { mult: 1.02, weeks: 1 } } },
      { id: 'manter', label: 'Manter a grade normal', effects: { cashWeeks: 0.03 } },
    ],
    defaultOption: 'manter',
  },
  {
    id: 'presidente_impaciente', category: 'bastidor', title: 'O presidente perdeu a paciência', severity: 'grave', tone: 'negativo',
    subject: 'none', trigger: [['player.weeksBelow', 'gte', 3], ['npc.presidente.patience', 'lte', 40]],
    baseProb: 0.5, eras: U, universe: U, speaker: 'npc_presidente', cooldownWeeks: 8,
    scene: 'O presidente mandou chamar às 23h. "Três semanas abaixo da meta, diretor. Eu quero saber o que você vai mudar. Hoje."',
    options: [
      { id: 'plano', label: 'Apresentar um plano de choque', effects: { npc: [{ target: 'presidente', patience: 10, trust: 2 }], agenda: -4 } },
      { id: 'culpar', label: 'Culpar o mercado e a concorrência', effects: { npc: [{ target: 'presidente', trust: -6, patience: -5 }] } },
      { id: 'pedir_verba', label: 'Pedir verba para virar o jogo', effects: { budget: 0.03, npc: [{ target: 'presidente', trust: -3, patience: 5 }] } },
    ],
    defaultOption: 'culpar', blocking: true,
  },
  {
    id: 'presidente_elogia', category: 'bastidor', title: 'Elogio raro da presidência', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [['player.revVsTarget', 'gte', 1.05]],
    baseProb: 0.12, eras: U, universe: U, speaker: 'npc_presidente', cooldownWeeks: 12,
    scene: 'O presidente parou no corredor, olhou o relatório e disse, sem sorrir: "Bom trabalho." A notícia correu a emissora em dez minutos.',
    options: [
      { id: 'agradecer', label: 'Agradecer e pedir mais verba', effects: { budget: 0.02, npc: [{ target: 'presidente', mood: 4 }] } },
      { id: 'equipe', label: 'Dividir o mérito com a equipe', effects: { npc: [{ target: 'comercial', mood: 6 }, { target: 'artistico', mood: 6 }, { target: 'jornalismo', mood: 6 }, { target: 'assistente', mood: 10 }] } },
    ],
    defaultOption: 'equipe',
  },
  {
    id: 'afiliada_rebelde', category: 'bastidor', title: 'Afiliada ameaça trocar de rede', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [['player.hasNetwork', 'true'], ['player.rankPrime', 'gte', 3]],
    baseProb: 0.04, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 40,
    scene: 'A afiliada de uma capital do Nordeste recebeu proposta da {rival}. "Eles querem mais janela local e menos cobrança de repasse", resume Marta.',
    options: [
      { id: 'conceder', label: 'Conceder mais janela local', effects: { cashWeeks: -0.04, reputation: { market: 1 } } },
      { id: 'firmeza', label: 'Manter as regras', effects: { flag: { afiliada_perdida: true }, reputation: { market: -2 }, tle: { mult: 0.99, weeks: 26 } } },
    ],
    defaultOption: 'firmeza',
  },
  {
    id: 'concessao_risco', category: 'regulacao', title: 'Renovação da concessão sob pressão', severity: 'grave', tone: 'negativo',
    subject: 'none', trigger: [['player.repPublic', 'lte', 35]],
    baseProb: 0.03, eras: U, universe: U, speaker: 'npc_juridico', cooldownWeeks: 104, oncePerGame: true,
    scene: 'Deputados aproveitaram a má fase da imagem da emissora para questionar a renovação da concessão. A Dra. Helena pede prudência.',
    options: [
      { id: 'campanha', label: 'Campanha institucional', effects: { cashWeeks: -0.08, reputation: { public: 5, critics: 2 } } },
      { id: 'lobby', label: 'Articulação política discreta', effects: { cashWeeks: -0.04, reputation: { critics: -2 }, npc: [{ target: 'presidente', trust: 3 }] } },
      { id: 'esperar', label: 'Esperar a poeira baixar', effects: { reputation: { market: -3 } } },
    ],
    defaultOption: 'esperar',
  },
  {
    id: 'anunciante_novo', category: 'comercial', title: 'Novo anunciante bate à porta', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.08, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 8,
    scene: '{advertiser} nunca tinha anunciado na {station}. Agora quer um pacote para o próximo mês. "Cliente novo é ouro, diretor."',
    options: [
      { id: 'pacote', label: 'Vender pacote com desconto de entrada', effects: { cashWeeks: 0.04, occupancy: { delta: 0.02, weeks: 4 }, npc: [{ target: 'comercial', mood: 8 }] } },
      { id: 'tabela', label: 'Vender a preço de tabela', effects: { cashWeeks: 0.03, npc: [{ target: 'comercial', mood: 4 }] } },
    ],
    defaultOption: 'tabela',
  },
  {
    id: 'cartas_publico', category: 'publico', title: 'Cartas e ligações elogiando um programa', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.quality', 'gte', 45]],
    baseProb: 0.08, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 6,
    scene: 'A central de atendimento recebeu uma enxurrada de elogios a {program}. Bia separou as melhores mensagens.',
    options: [
      { id: 'chamada', label: 'Usar os depoimentos em chamadas', effects: { program: { target: 'context', buzz: 8 }, npc: [{ target: 'promocao', mood: 4 }] } },
      { id: 'equipe', label: 'Mandar as mensagens para a equipe', effects: { npc: [{ target: 'artistico', mood: 6 }, { target: 'assistente', mood: 4 }], program: { target: 'context', quality: 1 } } },
    ],
    defaultOption: 'equipe',
  },
  {
    id: 'talento_quer_vir', category: 'pessoas', title: 'Talento da concorrência quer mudar de casa', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.04, eras: U, universe: U, speaker: 'npc_bia', cooldownWeeks: 16,
    scene: 'Um nome conhecido da {rival} mandou recado por um amigo em comum: está insatisfeito e topa ouvir uma proposta da {station}.',
    options: [
      { id: 'ouvir', label: 'Ouvir a proposta (oferta no Mercado)', effects: { addOffer: 'talento_rival' } },
      { id: 'ignorar', label: 'Não mexer em vespeiro', effects: {} },
    ],
    defaultOption: 'ignorar',
  },
  {
    id: 'patrocinio_especial', category: 'comercial', title: 'Patrocínio para um especial', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 12,
    scene: '{advertiser} quer patrocinar um especial de fim de semana na {station}. Paga a produção e ainda sobra.',
    options: [
      { id: 'aceitar', label: 'Aceitar e produzir o especial', effects: { cashWeeks: 0.05, allBuzz: 2, npc: [{ target: 'comercial', mood: 6 }] } },
      { id: 'recusar', label: 'Recusar (grade já fechada)', effects: { npc: [{ target: 'comercial', mood: -4 }] } },
    ],
    defaultOption: 'aceitar',
  },
  {
    id: 'afiliada_investe', category: 'bastidor', title: 'Afiliadas investem em cobertura local', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.04, eras: U, universe: U, speaker: 'npc_jornalismo', cooldownWeeks: 26,
    scene: 'As afiliadas do Nordeste vão reforçar o jornalismo local e pedem só um selo da rede nas chamadas. Henrique aprova.',
    options: [
      { id: 'apoiar', label: 'Apoiar com chamadas na rede', effects: { reputation: { public: 2, market: 1 }, npc: [{ target: 'jornalismo', mood: 6 }] } },
      { id: 'neutro', label: 'Deixar as afiliadas tocarem sozinhas', effects: { reputation: { public: 1 } } },
    ],
    defaultOption: 'neutro',
  },
  // ======================= ERA: ATUAL =======================
  {
    id: 'viralizacao_negativa', category: 'era', title: 'Viralização negativa nas redes', severity: 'medio', tone: 'negativo',
    subject: 'program', trigger: [],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_promocao', cooldownWeeks: 12,
    scene: 'Um trecho de {program} viralizou do jeito errado: a hashtag com o nome da emissora está no topo dos assuntos do momento, e não é elogio.',
    options: [
      { id: 'desculpas', label: 'Pedir desculpas', effects: { reputation: { public: 1, critics: 1 }, program: { target: 'context', buzz: -4 } } },
      { id: 'defender', label: 'Defender o conteúdo', effects: { reputation: { public: -3 }, program: { target: 'context', buzz: 8 } } },
      { id: 'silenciar', label: 'Silenciar', effects: { reputation: { public: -2 } } },
    ],
    defaultOption: 'silenciar',
  },
  {
    id: 'trending_positivo', category: 'era', title: 'Programa nos assuntos do momento', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.buzz', 'gte', 35]],
    baseProb: 0.15, eras: U, universe: U, speaker: 'npc_promocao', cooldownWeeks: 6,
    scene: '{program} ficou a noite inteira entre os assuntos mais comentados. Rodrigo quer surfar a onda com conteúdo extra nas redes.',
    options: [
      { id: 'aproveitar', label: 'Produzir conteúdo extra', effects: { cashWeeks: -0.01, program: { target: 'context', buzz: 10 }, reputation: { public: 2 } } },
      { id: 'ignorar', label: 'Deixar quieto', effects: {} },
    ],
    defaultOption: 'ignorar',
  },
  {
    id: 'streaming_quer_novela', category: 'era', title: 'Streaming quer licenciar sua novela', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.isNovela', 'true'], ['program.quality', 'gte', 60]],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 26,
    scene: 'Uma plataforma de streaming quer licenciar {program} para o mundo todo. Pagam bem, mas querem exclusividade de reprise por dois anos.',
    options: [
      { id: 'licenciar', label: 'Licenciar', effects: { cashWeeks: 0.12, flag: { sem_reprise: true } } },
      { id: 'recusar', label: 'Recusar', effects: {} },
    ],
    defaultOption: 'recusar',
  },
  {
    id: 'dtv_plus', category: 'era', title: 'Upgrade DTV+ (TV 3.0)', severity: 'medio', tone: 'neutro',
    subject: 'none', trigger: [['game.year', 'gte', 2026]],
    baseProb: 0.06, eras: U, universe: U, speaker: 'npc_presidente', cooldownWeeks: 104, oncePerGame: true,
    scene: 'A TV 3.0 entrou em operação comercial. Interatividade, aplicativo do canal e publicidade segmentada exigem investimento agora.',
    options: [
      { id: 'investir', label: 'Investir', effects: { cashWeeks: -0.15, reputation: { market: 4 }, priceMult: 1.03 } },
      { id: 'adiar', label: 'Adiar', effects: { reputation: { market: -1 } } },
      { id: 'parceria', label: 'Parceria com empresa de tecnologia', effects: { cashWeeks: -0.05, reputation: { market: 2 } } },
    ],
    defaultOption: 'adiar',
  },
  {
    id: 'youtube_cortes', category: 'era', title: 'Cortes do seu programa bombam no YouTube', severity: 'leve', tone: 'positivo',
    subject: 'program', trigger: [['program.groupIn', 'in', ['humor', 'variedade', 'reality']]],
    baseProb: 0.1, eras: U, universe: U, speaker: 'npc_promocao', cooldownWeeks: 10,
    scene: 'Canais de cortes estão faturando com trechos de {program}. Rodrigo quer um canal oficial; a Dra. Helena quer derrubar os piratas.',
    options: [
      { id: 'canal', label: 'Criar canal oficial de cortes', effects: { cashWeeks: 0.03, program: { target: 'context', buzz: 8 }, reputation: { public: 1 } } },
      { id: 'derrubar', label: 'Derrubar os canais piratas', effects: { program: { target: 'context', buzz: -3 }, npc: [{ target: 'juridico', trust: 3 }] } },
    ],
    defaultOption: 'canal',
  },
  {
    id: 'influenciador', category: 'era', title: 'Contratar um influenciador digital', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [],
    baseProb: 0.05, eras: U, universe: U, speaker: 'npc_promocao', cooldownWeeks: 26,
    scene: 'Um influenciador com milhões de seguidores quer apresentar um programa na TV aberta. Os jovens adoram; a crítica torce o nariz.',
    options: [
      { id: 'contratar', label: 'Ver a oferta no mercado', effects: { addOffer: 'talento_influenciador' } },
      { id: 'recusar', label: 'Recusar', effects: {} },
    ],
    defaultOption: 'recusar',
  },
  {
    id: 'janela_streaming', category: 'era', title: 'Estreia primeiro no streaming?', severity: 'leve', tone: 'neutro',
    subject: 'program', trigger: [['program.inDevelopment', 'true']],
    baseProb: 0.12, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 12,
    scene: 'A diretoria digital quer lançar {program} primeiro no streaming da casa, uma semana antes da TV. Marta acha que mata a estreia na grade.',
    options: [
      { id: 'streaming', label: 'Estreia no streaming primeiro', effects: { cashWeeks: 0.03, program: { target: 'context', buzz: 6, appeal: -3 } } },
      { id: 'tv', label: 'Estreia na TV primeiro', effects: { program: { target: 'context', buzz: 3 }, npc: [{ target: 'comercial', mood: 5 }] } },
    ],
    defaultOption: 'tv',
  },
  {
    id: 'crossmedia', category: 'era', title: 'Anunciante quer pacote cross-media', severity: 'leve', tone: 'positivo',
    subject: 'none', trigger: [],
    baseProb: 0.08, eras: U, universe: U, speaker: 'npc_comercial', cooldownWeeks: 12,
    scene: '{advertiser} quer comprar audiência somada TV + digital. "Se a gente entregar o pacote, é dinheiro que hoje vai para o YouTube", diz Marta.',
    options: [
      { id: 'montar', label: 'Montar o pacote cross-media', effects: { cashWeeks: 0.05, agenda: -2, reputation: { market: 2 } } },
      { id: 'recusar', label: 'Recusar', effects: {} },
    ],
    defaultOption: 'montar',
  },
  // ======================= CALENDÁRIO =======================
  {
    id: 'copa_direitos', category: 'esporte', title: 'Direitos de transmissão da Copa do Mundo', severity: 'medio', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'Faltam poucos meses para a Copa do Mundo. Uma sublicença dos direitos de transmissão está disponível e as cotas de patrocínio se vendem sozinhas.',
    options: [
      { id: 'comprar', label: 'Ver a oferta no mercado', effects: { addOffer: 'copa' } },
      { id: 'passar', label: 'Deixar a Copa com os concorrentes', effects: { npc: [{ target: 'comercial', mood: -8 }] } },
    ],
    defaultOption: 'passar',
  },
  {
    id: 'esporte_prorrogacao', category: 'esporte', title: 'Jogo decisivo pode estourar a grade', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'Esta semana tem mata-mata: {jogo}. Se empatar, vai para a prorrogação ou para os pênaltis e o jogo passa do horário. "Diretor, se estourar, a gente atrasa a novela ou corta o pós-jogo? O patrocinador do pós-jogo vai reclamar, mas a novela tem hora marcada", diz Marta.',
    options: [
      { id: 'atrasar', label: 'Atrasar a programação seguinte', effects: { npc: [{ target: 'comercial', mood: 3 }] } },
      { id: 'cortar', label: 'Cortar o pós-jogo para não atrasar a grade', effects: { npc: [{ target: 'comercial', mood: -4 }, { target: 'artistico', mood: 4 }] } },
    ],
    defaultOption: 'atrasar',
  },
  // ===== esporte real (seção 8C.7): disparados pelo motor esportivo quando a situação acontece na partida =====
  {
    id: 'esporte_selecao_eliminada', category: 'esporte', title: 'A seleção caiu', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'O Brasil foi eliminado nas {fase} da Copa do Mundo. As cotas da Copa foram vendidas contando com mais jogos da seleção e os anunciantes já ligaram. "Diretor, a gente mantém a cobertura cheia até a final ou enxuga e devolve a grade?", pergunta Marta.',
    options: [
      { id: 'manter', label: 'Manter a cobertura cheia até a final', effects: { cashWeeks: -0.03, reputation: { public: 1 }, npc: [{ target: 'comercial', mood: -5 }] } },
      { id: 'enxugar', label: 'Enxugar a cobertura e oferecer compensação aos anunciantes', effects: { cashWeeks: -0.015, npc: [{ target: 'comercial', mood: 3 }, { target: 'jornalismo', mood: -4 }] } },
    ],
    defaultOption: 'manter',
  },
  {
    id: 'esporte_final_grande_torcida', category: 'esporte', title: 'Final com a maior torcida do país', severity: 'medio', tone: 'positivo',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'Esta semana a {station} transmite {jogo}, decisão com uma das maiores torcidas do país. "Os anunciantes estão disputando os intervalos", conta Marta. "Dá para subir o preço da transmissão ou fechar um pacote especial com o digital."',
    options: [
      { id: 'subir_preco', label: 'Subir o preço dos intervalos da final', effects: { cashWeeks: 0.05, occupancy: { delta: -0.02, weeks: 1 }, npc: [{ target: 'comercial', mood: 6 }] } },
      { id: 'pacote', label: 'Fechar um pacote TV + digital com patrocinador', effects: { cashWeeks: 0.035, reputation: { market: 2 }, npc: [{ target: 'comercial', mood: 4 }] } },
    ],
    defaultOption: 'pacote',
  },
  {
    id: 'esporte_clube_rebaixado', category: 'esporte', title: 'Clube de grande torcida rebaixado', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: '{clube} foi rebaixado para a Série B. É uma das maiores torcidas do país e a audiência do Brasileirão do ano que vem vai sentir. Os patrocinadores das cotas pedem uma conversa.',
    options: [
      { id: 'desconto', label: 'Dar desconto nas cotas do ano que vem', effects: { cashWeeks: -0.02, npc: [{ target: 'comercial', mood: 4 }], reputation: { market: 1 } } },
      { id: 'manter', label: 'Manter os preços e apostar no acesso imediato', effects: { occupancy: { delta: -0.03, weeks: 6 }, npc: [{ target: 'comercial', mood: -4 }] } },
    ],
    defaultOption: 'desconto',
  },
  {
    id: 'esporte_jogo_adiado', category: 'esporte', title: 'Jogo adiado por conflito de calendário', severity: 'leve', tone: 'negativo',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_artistico',
    scene: '{jogo}, que a {station} ia transmitir, foi adiado: {motivo}. O horário do jogo voltou para a grade normal. "Preenchemos com a programação de sempre ou entramos com uma mesa-redonda especial?", pergunta Lúcia.',
    options: [
      { id: 'grade_normal', label: 'Seguir com a programação normal', effects: {} },
      { id: 'mesa_redonda', label: 'Entrar com mesa-redonda especial no horário', effects: { cashWeeks: -0.005, reputation: { critics: 1 }, npc: [{ target: 'jornalismo', mood: 3 }] } },
    ],
    defaultOption: 'grade_normal',
  },
  {
    id: 'esporte_mudanca_horario', category: 'esporte', title: 'A liga mudou o horário do jogo', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_juridico',
    scene: '{jogo} mudou de horário: {motivo}. A grade da {station} vai se ajustar ao novo horário. A Dra. Helena pergunta se a emissora aceita em silêncio ou registra protesto junto à organizadora.',
    options: [
      { id: 'aceitar', label: 'Aceitar e ajustar a grade', effects: { npc: [{ target: 'artistico', mood: -2 }] } },
      { id: 'protestar', label: 'Registrar protesto formal', effects: { npc: [{ target: 'juridico', trust: 2 }], reputation: { market: -1 } } },
    ],
    defaultOption: 'aceitar',
  },
  {
    id: 'esporte_narrador_assediado', category: 'esporte', title: 'Narrador da casa assediado pela concorrência', severity: 'medio', tone: 'negativo',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_artistico',
    scene: '{narrador}, a voz das transmissões esportivas da {station}, recebeu uma proposta da {rival}. "Ele gosta daqui, mas a oferta é alta", diz Lúcia. Sem ele, as transmissões perdem qualidade por uns meses.',
    options: [
      { id: 'cobrir', label: 'Cobrir a oferta', effects: { cashWeeks: -0.03, npc: [{ target: 'artistico', mood: 5 }] } },
      { id: 'deixar', label: 'Deixar ir e promover alguém da equipe', effects: { flag: { narrador_saiu: true }, npc: [{ target: 'artistico', mood: -6 }] } },
    ],
    defaultOption: 'cobrir',
  },
  {
    id: 'esporte_patrocinador_exclusividade', category: 'esporte', title: 'Patrocinador exige exclusividade de categoria', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'Um patrocinador das cotas do esporte quer exclusividade de categoria: nenhum concorrente dele nos intervalos das transmissões. Paga mais por isso, mas a {station} perde outros anunciantes do mesmo setor.',
    options: [
      { id: 'aceitar', label: 'Aceitar a exclusividade', effects: { cashWeeks: 0.05, occupancy: { delta: -0.02, weeks: 8 }, npc: [{ target: 'comercial', mood: 3 }] } },
      { id: 'recusar', label: 'Recusar e manter os intervalos abertos', effects: { cashWeeks: -0.01, npc: [{ target: 'comercial', mood: -4 }] } },
    ],
    defaultOption: 'aceitar',
  },
  {
    id: 'esporte_briga_em_campo', category: 'esporte', title: 'Briga em campo vira caso de imagem', severity: 'leve', tone: 'negativo',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_jornalismo',
    scene: 'Na transmissão de {jogo}, um empurra-empurra entre jogadores terminou com cartão vermelho e virou assunto nas redes. O Jornalismo quer saber se a {station} repete as imagens nos telejornais ou corta o assunto.',
    options: [
      { id: 'repetir', label: 'Repetir as imagens e debater', effects: { allBuzz: 3, reputation: { critics: -2, public: 1 } } },
      { id: 'cortar', label: 'Cortar as imagens e falar só de futebol', effects: { reputation: { critics: 2 }, npc: [{ target: 'jornalismo', mood: 2 }] } },
    ],
    defaultOption: 'cortar',
  },
  {
    id: 'esporte_leilao_prazo', category: 'esporte', title: 'Concorrência de direitos com prazo apertado', severity: 'medio', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true, baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'Abriu a concorrência pelos direitos de {competicao} ({ciclo}). As propostas fecham até {prazo}. "Se a gente quer entrar, tem que montar o projeto de transmissão agora", diz Marta.',
    options: [
      { id: 'preparar', label: 'Montar a proposta (abre no Mercado de Direitos)', effects: { agenda: -2, flag: { concorrencia_preparada: true }, npc: [{ target: 'comercial', mood: 4 }] } },
      { id: 'passar', label: 'Deixar essa passar', effects: { npc: [{ target: 'comercial', mood: -3 }] } },
    ],
    defaultOption: 'passar',
  },
  {
    id: 'hgpe_aviso', category: 'regulacao', title: 'Horário eleitoral começa na semana que vem', severity: 'leve', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'npc_juridico',
    scene: 'A Dra. Helena lembra: o horário eleitoral gratuito começa na semana que vem, de segunda a sábado, às 13h e às 20h30. Ninguém escapa, nem os concorrentes.',
    options: [
      { id: 'ajustar', label: 'Entendido, vou ajustar a grade', effects: { npc: [{ target: 'juridico', trust: 2 }] } },
      { id: 'debate', label: 'Propor um debate entre candidatos', effects: { reputation: { critics: 3, public: 1 }, npc: [{ target: 'jornalismo', mood: 10 }], cashWeeks: -0.02 } },
    ],
    defaultOption: 'ajustar',
  },
  {
    id: 'leilao_futebol', category: 'esporte', title: 'Leilão dos direitos do campeonato', severity: 'medio', tone: 'neutro',
    subject: 'none', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'npc_comercial',
    scene: 'A liga abriu o leilão dos direitos de transmissão do campeonato do próximo ano. Lances fechados até o fim do mês.',
    options: [
      { id: 'ver', label: 'Ver o leilão no mercado', effects: { addOffer: 'leilao_futebol' } },
      { id: 'passar', label: 'Não participar', effects: {} },
    ],
    defaultOption: 'passar',
  },
  {
    id: 'renovacao_contrato', category: 'talento', title: 'Contrato perto do fim', severity: 'leve', tone: 'neutro',
    subject: 'talent', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'context_talent',
    scene: 'O contrato de {talent} vence em breve. O empresário quer saber se a casa vai renovar.',
    options: [
      { id: 'renovar', label: 'Renovar por um ano (+10%)', effects: { salaryPct: 10, flag: { renovou: true }, npc: [{ target: 'context_talent', mood: 10, loyalty: 8 }] } },
      { id: 'renovar_longo', label: 'Renovar por dois anos (+20%)', effects: { salaryPct: 20, flag: { renovou_longo: true }, npc: [{ target: 'context_talent', mood: 15, loyalty: 15 }] } },
      { id: 'nao_renovar', label: 'Não renovar', effects: { talentLeaves: true, npc: [{ target: 'context_talent', mood: -20 }] } },
    ],
    defaultOption: 'renovar',
  },
  {
    id: 'novela_acabando', category: 'bastidor', title: 'Trama perto do último capítulo', severity: 'leve', tone: 'neutro',
    subject: 'program', trigger: [], calendar: true,
    baseProb: 0, eras: U, universe: U, speaker: 'npc_artistico',
    scene: '{program} tem poucas semanas pela frente. Lúcia pergunta: esticamos a trama ou preparamos a substituta?',
    options: [
      { id: 'esticar', label: 'Esticar 4 semanas', effects: { program: { target: 'context', extendEps: 24, fatigue: 8 }, npc: [{ target: 'comercial', mood: 6 }, { target: 'artistico', mood: -4 }] } },
      { id: 'encerrar', label: 'Encerrar no prazo', effects: { npc: [{ target: 'artistico', mood: 4 }] } },
    ],
    defaultOption: 'encerrar',
  },
];

// ===== Arcos narrativos longos (seção 13.3) =====
export interface ArcDef {
  key: string;
  name: string;
  stages: string[];
  start: Cond[];
  startProb: number;
  stageEvents: string[]; // template id por etapa (eventos de arco)
  weeksPerStage: number;
}

export const ARCS: ArcDef[] = [
  { key: 'venda_emissora', name: 'A venda da emissora', stages: ['rumor', 'proposta', 'due diligence', 'desfecho'], start: [['player.political', 'gte', 30]], startProb: 0.006, stageEvents: ['arc_venda_1', 'arc_venda_2', 'arc_venda_3', 'arc_venda_4'], weeksPerStage: 6 },
  { key: 'sucessao_presidente', name: 'A sucessão do presidente', stages: ['saúde frágil', 'disputa', 'escolha', 'novo comando'], start: [], startProb: 0.004, stageEvents: ['arc_sucessao_1', 'arc_sucessao_2', 'arc_sucessao_3', 'arc_sucessao_4'], weeksPerStage: 8 },
  { key: 'autor_genial', name: 'O autor genial e instável', stages: ['exigências', 'ameaça', 'crise', 'obra'], start: [['player.hasOwnNovela', 'true']], startProb: 0.01, stageEvents: ['arc_autor_1', 'arc_autor_2', 'arc_autor_3', 'arc_autor_4'], weeksPerStage: 5 },
  { key: 'guerra_domingo_arc', name: 'A guerra do domingo', stages: ['provocação', 'escalada', 'empate técnico', 'desfecho'], start: [['player.hasSundayShow', 'true']], startProb: 0.012, stageEvents: ['arc_domingo_1', 'arc_domingo_2', 'arc_domingo_3', 'arc_domingo_4'], weeksPerStage: 4 },
];

const arcEvent = (
  id: string, key: string, stage: number, title: string, speaker: string, scene: string,
  options: EventOptionDef[], def: string, severity: EventSeverity = 'medio', tone: EventTone = 'neutro',
): EventTemplate => ({
  id, category: 'arco', title, severity, tone, subject: 'none', trigger: [], baseProb: 0, eras: U, universe: U,
  speaker, scene, options, defaultOption: def, calendar: true, arc: { key, stage },
});

EVENT_TEMPLATES.push(
  arcEvent('arc_venda_1', 'venda_emissora', 0, 'Rumor de venda da emissora', 'npc_bia',
    'Bia ouviu no elevador: um grupo estrangeiro estaria interessado em comprar a emissora. O presidente nega, mas cancelou a reunião de sexta.',
    [
      { id: 'investigar', label: 'Sondar o presidente', effects: { agenda: -2, npc: [{ target: 'presidente', trust: -2 }], arcAdvance: 'venda_emissora' } },
      { id: 'ignorar', label: 'Fingir que não ouviu', effects: { arcAdvance: 'venda_emissora' } },
    ], 'ignorar'),
  arcEvent('arc_venda_2', 'venda_emissora', 1, 'A proposta chegou', 'npc_presidente',
    'O presidente admite, a portas fechadas: há uma proposta. "Eles querem ver a grade e os números do próximo trimestre antes de fechar. Não me envergonhe."',
    [
      { id: 'mostrar', label: 'Prometer números fortes', effects: { flag: { venda_meta: true }, npc: [{ target: 'presidente', trust: 5, patience: -10 }], arcAdvance: 'venda_emissora' } },
      { id: 'cautela', label: 'Pedir cautela', effects: { npc: [{ target: 'presidente', trust: -3 }], arcAdvance: 'venda_emissora' } },
    ], 'cautela', 'grave'),
  arcEvent('arc_venda_3', 'venda_emissora', 2, 'Due diligence', 'npc_comercial',
    'Os auditores do comprador estão em todas as salas. Marta sugere inflar o faturamento do mês com antecipação de cotas; a Dra. Helena desaconselha.',
    [
      { id: 'antecipar', label: 'Antecipar cotas', effects: { cashWeeks: 0.08, delayed: { inWeeks: 8, effects: { cashWeeks: -0.1 }, note: 'O caixa sente a antecipação de cotas' }, arcAdvance: 'venda_emissora' } },
      { id: 'limpo', label: 'Mostrar tudo como está', effects: { npc: [{ target: 'juridico', trust: 6 }], reputation: { market: 2 }, arcAdvance: 'venda_emissora' } },
    ], 'limpo', 'grave'),
  arcEvent('arc_venda_4', 'venda_emissora', 3, 'O desfecho da venda', 'npc_presidente',
    'O negócio não saiu: o comprador desistiu na última hora. O presidente, aliviado ou frustrado, ninguém sabe, avisa que nada muda. Por enquanto.',
    [
      { id: 'ok', label: 'Seguir em frente', effects: { npc: [{ target: 'presidente', mood: 5 }], arcEnd: 'venda_emissora' } },
    ], 'ok'),
  arcEvent('arc_sucessao_1', 'sucessao_presidente', 0, 'O presidente se afasta', 'npc_bia',
    'O presidente foi internado para exames. "Nada grave", diz o comunicado. Os corredores, porém, só falam de quem vai mandar se ele não voltar.',
    [
      { id: 'visitar', label: 'Visitar o presidente (agenda)', effects: { agenda: -3, npc: [{ target: 'presidente', trust: 8, mood: 10 }], arcAdvance: 'sucessao_presidente' } },
      { id: 'trabalhar', label: 'Focar no trabalho', effects: { arcAdvance: 'sucessao_presidente' } },
    ], 'trabalhar'),
  arcEvent('arc_sucessao_2', 'sucessao_presidente', 1, 'Herdeiros em disputa', 'npc_bia',
    'Dois herdeiros disputam a sucessão: a filha, que quer modernizar tudo, e o genro, que quer cortar custos. Os dois pediram seu apoio.',
    [
      { id: 'filha', label: 'Apoiar a filha', effects: { flag: { sucessor: 'filha' }, arcAdvance: 'sucessao_presidente' } },
      { id: 'genro', label: 'Apoiar o genro', effects: { flag: { sucessor: 'genro' }, arcAdvance: 'sucessao_presidente' } },
      { id: 'neutro', label: 'Ficar neutro', effects: { flag: { sucessor: 'neutro' }, npc: [{ target: 'presidente', trust: -2 }], arcAdvance: 'sucessao_presidente' } },
    ], 'neutro', 'grave'),
  arcEvent('arc_sucessao_3', 'sucessao_presidente', 2, 'A escolha', 'npc_presidente',
    'O presidente voltou, mais magro e mais duro. "Eu escolho quem me sucede. E vou escolher olhando para os números de cada diretoria."',
    [
      { id: 'ok', label: 'Entendido', effects: { npc: [{ target: 'presidente', patience: -10 }], arcAdvance: 'sucessao_presidente' } },
    ], 'ok'),
  arcEvent('arc_sucessao_4', 'sucessao_presidente', 3, 'Novo comando', 'npc_presidente',
    'O presidente anunciou que fica mais dois anos e depois passa o bastão. A sucessão ficou para depois, mas todo mundo sabe quem estava de que lado.',
    [
      { id: 'ok', label: 'Seguir em frente', effects: { arcEnd: 'sucessao_presidente', npc: [{ target: 'presidente', mood: 5 }] } },
    ], 'ok'),
  arcEvent('arc_autor_1', 'autor_genial', 0, 'O autor exige mais', 'npc_artistico',
    'O autor da sua novela quer cenário novo, elenco maior e direito de veto sobre a trilha. "Ele é genial", diz Lúcia, "mas está impossível".',
    [
      { id: 'ceder', label: 'Ceder às exigências', effects: { cashWeeks: -0.05, npc: [{ target: 'artistico', mood: 8 }], arcAdvance: 'autor_genial' } },
      { id: 'limitar', label: 'Impor limites', effects: { npc: [{ target: 'artistico', mood: -5 }], arcAdvance: 'autor_genial' } },
    ], 'limitar'),
  arcEvent('arc_autor_2', 'autor_genial', 1, 'Ameaça de abandonar a obra', 'npc_artistico',
    'O autor ameaça abandonar a novela no meio, "se continuarem mexendo no meu texto". A imprensa já sabe.',
    [
      { id: 'acalmar', label: 'Jantar com o autor (agenda)', effects: { agenda: -3, npc: [{ target: 'artistico', mood: 8 }], arcAdvance: 'autor_genial' } },
      { id: 'substituto', label: 'Preparar um substituto', effects: { npc: [{ target: 'artistico', mood: -10 }], arcAdvance: 'autor_genial' } },
    ], 'substituto', 'grave'),
  arcEvent('arc_autor_3', 'autor_genial', 2, 'A crise explode', 'npc_bia',
    'O autor deu entrevista dizendo que a emissora "não merece a obra". O presidente leu durante o café.',
    [
      { id: 'publico', label: 'Responder publicamente', effects: { reputation: { critics: -2 }, npc: [{ target: 'presidente', mood: 3 }], arcAdvance: 'autor_genial' } },
      { id: 'silencio', label: 'Silêncio e diplomacia', effects: { npc: [{ target: 'artistico', mood: 4 }], arcAdvance: 'autor_genial' } },
    ], 'silencio'),
  arcEvent('arc_autor_4', 'autor_genial', 3, 'A obra final', 'npc_artistico',
    'Os últimos capítulos chegaram: brilhantes. Lúcia está emocionada. "Valeu cada dor de cabeça."',
    [
      { id: 'ok', label: 'Celebrar', effects: { reputation: { critics: 4 }, allBuzz: 3, arcEnd: 'autor_genial' } },
    ], 'ok', 'leve', 'positivo'),
  arcEvent('arc_domingo_1', 'guerra_domingo_arc', 0, 'Provocação no domingo', 'npc_pesquisa',
    'O apresentador do domingo da {rival} provocou sua emissora no ar. O público adorou a briga; Caio viu o pico no minuto a minuto.',
    [
      { id: 'responder', label: 'Responder no ar', effects: { allBuzz: 3, reputation: { critics: -1 }, arcAdvance: 'guerra_domingo_arc' } },
      { id: 'ignorar', label: 'Ignorar', effects: { arcAdvance: 'guerra_domingo_arc' } },
    ], 'ignorar'),
  arcEvent('arc_domingo_2', 'guerra_domingo_arc', 1, 'Escalada: prêmios milionários', 'npc_comercial',
    'A {rival} anunciou prêmios milionários no domingo. Marta pede reforço para não perder os anunciantes da tarde.',
    [
      { id: 'reforcar', label: 'Reforçar prêmios e quadros', effects: { cashWeeks: -0.06, flag: { domingo_turbinado: 8 }, arcAdvance: 'guerra_domingo_arc' } },
      { id: 'segurar', label: 'Segurar custos', effects: { arcAdvance: 'guerra_domingo_arc' } },
    ], 'segurar'),
  arcEvent('arc_domingo_3', 'guerra_domingo_arc', 2, 'Empate técnico', 'npc_pesquisa',
    'Domingo passado deu empate técnico na tarde. A imprensa chama de "a maior guerra da TV". Todo mundo olha para você.',
    [
      { id: 'all_in', label: 'Apostar tudo no próximo domingo', effects: { cashWeeks: -0.04, allBuzz: 4, arcAdvance: 'guerra_domingo_arc' } },
      { id: 'calma', label: 'Manter a calma', effects: { arcAdvance: 'guerra_domingo_arc' } },
    ], 'calma'),
  arcEvent('arc_domingo_4', 'guerra_domingo_arc', 3, 'Fim da trégua', 'npc_bia',
    'Depois de semanas de guerra, as emissoras baixaram as armas. O domingo voltou ao normal, e os custos também.',
    [
      { id: 'ok', label: 'Seguir em frente', effects: { arcEnd: 'guerra_domingo_arc' } },
    ], 'ok', 'leve'),
);

export const EVENT_BY_ID: Record<string, EventTemplate> = Object.fromEntries(EVENT_TEMPLATES.map((e) => [e.id, e]));
