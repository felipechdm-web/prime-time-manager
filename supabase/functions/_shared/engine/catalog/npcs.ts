// Elenco fixo da emissora do jogador (seção 12.1) e arquétipos de talento (12.2).
// Todos os personagens que falam são fictícios, inclusive no universo real.

import type { GenreId, NpcRole, NpcSheet, Profile } from '../types.ts';

export interface FixedNpcDef {
  key: string;
  role: NpcRole;
  name: string;
  title: string;
  age: number;
  avatar: string;
  sheet: NpcSheet;
  mood: number;
  trust: number;
  loyalty: number;
  patience: number;
}

export const FIXED_NPCS: FixedNpcDef[] = [
  {
    key: 'npc_presidente',
    role: 'presidente',
    name: 'Dr. Otávio Barreto',
    title: 'Presidente',
    age: 64,
    avatar: '👔',
    sheet: {
      speech_style: ['lacônico', 'autoritário', 'irônico'],
      catchphrases: ['Eu não pago você para ter opinião, pago para ter audiência.', 'Número, diretor. Me traga número.'],
      main_goal: 'liderança, lucro e prestígio pessoal da emissora',
      secret_goal: 'deixar a emissora valorizada para uma venda ou sucessão tranquila',
      red_line: 'ser humilhado publicamente pela concorrência ou pela imprensa',
      bio: 'Dono da emissora há duas décadas. Fala pouco, cobra muito e lembra de tudo.',
    },
    mood: 0,
    trust: 55,
    loyalty: 50,
    patience: 60,
  },
  {
    key: 'npc_comercial',
    role: 'comercial',
    name: 'Marta Siqueira',
    title: 'Diretora Comercial',
    age: 47,
    avatar: '💼',
    sheet: {
      speech_style: ['direta', 'pragmática', 'irônica'],
      catchphrases: ['Ponto não paga conta, diretor. Cota paga.', 'Meu cliente não compra prestígio, compra GRP.'],
      main_goal: 'bater a meta anual com folga',
      secret_goal: 'ser promovida a superintendente',
      red_line: 'perder o maior anunciante por decisão artística',
      bio: 'Veio de agência de publicidade. Conhece cada anunciante pelo nome e cada desconto pelo centavo.',
    },
    mood: 10,
    trust: 55,
    loyalty: 60,
    patience: 50,
  },
  {
    key: 'npc_jornalismo',
    role: 'jornalismo',
    name: 'Henrique Castello',
    title: 'Diretor de Jornalismo',
    age: 58,
    avatar: '📰',
    sheet: {
      speech_style: ['formal', 'combativo', 'orgulhoso'],
      catchphrases: ['Jornalismo não é tapa-buraco.', 'Credibilidade se perde em um dia e se reconstrói em dez anos.'],
      main_goal: 'proteger os telejornais e a credibilidade da casa',
      secret_goal: 'ganhar um programa de entrevistas próprio no horário nobre',
      red_line: 'ver o telejornal principal rebaixado ou cortado',
      bio: 'Repórter de rua por trinta anos. Ameaça pedir demissão uma vez por trimestre.',
    },
    mood: 0,
    trust: 50,
    loyalty: 55,
    patience: 45,
  },
  {
    key: 'npc_artistico',
    role: 'artistico',
    name: 'Lúcia Prado',
    title: 'Diretora Artística',
    age: 52,
    avatar: '🎭',
    sheet: {
      speech_style: ['passional', 'eloquente', 'teimosa'],
      catchphrases: ['Novela boa não se faz com planilha.', 'Me dê orçamento e eu te dou prêmio.'],
      main_goal: 'orçamento para novelas e séries de prestígio',
      secret_goal: 'emplacar a novela do autor que ela descobriu',
      red_line: 'ver um projeto autoral cancelado sem chance de estrear',
      bio: 'Diretora de núcleo premiada. Protege autores e elenco como família.',
    },
    mood: 5,
    trust: 50,
    loyalty: 55,
    patience: 50,
  },
  {
    key: 'npc_pesquisa',
    role: 'pesquisa',
    name: 'Caio Nakamura',
    title: 'Gerente de Pesquisa',
    age: 34,
    avatar: '📊',
    sheet: {
      speech_style: ['analítico', 'cauteloso', 'seco'],
      catchphrases: ['O dado não tem opinião.', 'Isso está dentro da margem de erro, diretor.'],
      main_goal: 'decisões baseadas em evidência',
      secret_goal: 'montar um núcleo de dados próprio',
      red_line: 'ver números maquiados em reunião',
      bio: 'Estatístico. Prefere gráfico a reunião.',
    },
    mood: 10,
    trust: 55,
    loyalty: 60,
    patience: 60,
  },
  {
    key: 'npc_bia',
    role: 'assistente',
    name: 'Bia Ramos',
    title: 'Assistente da Diretoria',
    age: 27,
    avatar: '📝',
    sheet: {
      speech_style: ['animada', 'organizada', 'fofoqueira'],
      catchphrases: ['Diretor, posso ser sincera?', 'Anotei tudo, e ouvi umas coisinhas no corredor.'],
      main_goal: 'ajudar o diretor e crescer na carreira',
      secret_goal: 'virar produtora de programa',
      red_line: 'ser tratada como invisível',
      bio: 'Organiza a agenda, resume a semana e sabe de tudo antes de todo mundo.',
    },
    mood: 30,
    trust: 65,
    loyalty: 70,
    patience: 70,
  },
  {
    key: 'npc_promocao',
    role: 'promocao',
    name: 'Rodrigo Leme',
    title: 'Chefe de Promoção e Chamadas',
    age: 39,
    avatar: '📣',
    sheet: {
      speech_style: ['criativo', 'acelerado', 'vaidoso'],
      catchphrases: ['Estreia sem chamada é estreia no escuro.', 'Me dá trinta segundos que eu te dou um sucesso.'],
      main_goal: 'inventário promocional para campanhas de estreia',
      secret_goal: 'ganhar um prêmio de criação',
      red_line: 'ter campanha cancelada na véspera',
      bio: 'Publicitário que trocou a agência pela emissora. Vive de vinhetas e slogans.',
    },
    mood: 10,
    trust: 50,
    loyalty: 55,
    patience: 55,
  },
  {
    key: 'npc_juridico',
    role: 'juridico',
    name: 'Dra. Helena Faria',
    title: 'Diretora Jurídica',
    age: 55,
    avatar: '⚖️',
    sheet: {
      speech_style: ['precisa', 'paciente', 'didática'],
      catchphrases: ['Juridicamente, diretor, a resposta é: depende.', 'Eu explico de novo, devagar.'],
      main_goal: 'evitar processos e multas',
      secret_goal: 'se aposentar sem nenhum processo perdido',
      red_line: 'ser ignorada em uma decisão de risco legal',
      bio: 'Conhece a classificação indicativa, a lei eleitoral e cada contrato da casa.',
    },
    mood: 0,
    trust: 55,
    loyalty: 60,
    patience: 65,
  },
];

export interface TalentArchetype {
  id: string;
  label: string;
  role: string;
  genres: GenreId[];
  carisma: [number, number];
  popularity: [number, number];
  prestige: [number, number];
  ego: [number, number];
  risk: [number, number];
  salary: [number, number]; // R$ 2026 por semana
  segmentBias: Partial<Profile>;
  gender?: 'f' | 'm';
  stageName?: boolean;
}

export const TALENT_ARCHETYPES: TalentArchetype[] = [
  { id: 'apresentador_auditorio', label: 'Apresentador(a) de auditório', role: 'apresentador', genres: ['auditorio', 'game_show', 'talent_show'], carisma: [70, 95], popularity: [55, 90], prestige: [25, 55], ego: [60, 95], risk: [35, 75], salary: [60000, 250000], segmentBias: { adulto_cde: 0.1, maduro_cde: 0.1 }, stageName: true },
  { id: 'apresentadora_matinal', label: 'Apresentador(a) matinal', role: 'apresentador', genres: ['feminino', 'infantil'], carisma: [60, 90], popularity: [45, 80], prestige: [30, 60], ego: [40, 75], risk: [10, 40], salary: [25000, 100000], segmentBias: { maduro_cde: 0.1 } },
  { id: 'ancora', label: 'Âncora de telejornal', role: 'jornalista', genres: ['telejornal', 'revista_eletronica'], carisma: [55, 85], popularity: [40, 80], prestige: [60, 95], ego: [45, 85], risk: [5, 30], salary: [40000, 150000], segmentBias: { adulto_ab: 0.1, maduro_ab: 0.1 } },
  { id: 'autor_consagrado', label: 'Autor(a) de novela consagrado(a)', role: 'autor', genres: ['novela_21h', 'novela_19h', 'novela_18h'], carisma: [40, 70], popularity: [50, 85], prestige: [70, 98], ego: [70, 98], risk: [20, 60], salary: [50000, 200000], segmentBias: {} },
  { id: 'autora_jovem', label: 'Autor(a) de novela em ascensão', role: 'autor', genres: ['novela_18h', 'novela_19h', 'novela_juvenil', 'serie_nacional'], carisma: [40, 70], popularity: [25, 60], prestige: [45, 80], ego: [40, 75], risk: [15, 50], salary: [20000, 70000], segmentBias: { jovem_ab: 0.1 } },
  { id: 'diretor_nucleo', label: 'Diretor(a) de núcleo', role: 'diretor', genres: ['novela_21h', 'serie_nacional', 'novela_19h'], carisma: [35, 65], popularity: [20, 50], prestige: [60, 95], ego: [55, 90], risk: [10, 40], salary: [30000, 120000], segmentBias: {} },
  { id: 'gala', label: 'Galã', role: 'ator', genres: ['novela_21h', 'novela_19h', 'serie_nacional'], carisma: [70, 95], popularity: [60, 95], prestige: [40, 75], ego: [60, 90], risk: [25, 65], salary: [40000, 160000], segmentBias: { adulto_cde: 0.1, maduro_cde: 0.1 }, gender: 'm' },
  { id: 'mocinha', label: 'Protagonista de novela', role: 'atriz', genres: ['novela_21h', 'novela_18h', 'novela_19h'], carisma: [70, 95], popularity: [55, 95], prestige: [45, 80], ego: [50, 85], risk: [15, 50], salary: [40000, 160000], segmentBias: { jovem_cde: 0.1, adulto_cde: 0.1 }, gender: 'f' },
  { id: 'vila_veterana', label: 'Vilã veterana', role: 'atriz', genres: ['novela_21h', 'novela_18h', 'serie_nacional'], carisma: [60, 90], popularity: [50, 85], prestige: [65, 95], ego: [65, 95], risk: [10, 40], salary: [35000, 130000], segmentBias: { maduro_ab: 0.1, maduro_cde: 0.1 }, gender: 'f' },
  { id: 'humorista', label: 'Humorista', role: 'humorista', genres: ['humoristico', 'talk_show', 'game_show'], carisma: [65, 95], popularity: [50, 90], prestige: [30, 70], ego: [50, 85], risk: [40, 85], salary: [30000, 120000], segmentBias: { jovem_cde: 0.1, adulto_cde: 0.1 } },
  { id: 'comentarista', label: 'Comentarista esportivo', role: 'comentarista', genres: ['mesa_redonda', 'futebol'], carisma: [50, 85], popularity: [40, 80], prestige: [40, 80], ego: [50, 85], risk: [30, 70], salary: [20000, 90000], segmentBias: { adulto_cde: 0.1 }, gender: 'm' },
  { id: 'narrador', label: 'Narrador esportivo', role: 'narrador', genres: ['futebol', 'mesa_redonda'], carisma: [60, 90], popularity: [50, 90], prestige: [50, 85], ego: [55, 90], risk: [15, 45], salary: [40000, 150000], segmentBias: { adulto_cde: 0.1 }, gender: 'm' },
  { id: 'apresentador_policial', label: 'Apresentador policial', role: 'apresentador', genres: ['policial'], carisma: [55, 90], popularity: [40, 80], prestige: [10, 40], ego: [60, 95], risk: [55, 95], salary: [25000, 110000], segmentBias: { adulto_cde: 0.15, maduro_cde: 0.1 }, gender: 'm' },
  { id: 'apresentador_talk', label: 'Apresentador(a) de talk show', role: 'apresentador', genres: ['talk_show', 'revista_eletronica'], carisma: [65, 95], popularity: [40, 85], prestige: [45, 85], ego: [55, 90], risk: [25, 60], salary: [35000, 140000], segmentBias: { adulto_ab: 0.15, jovem_ab: 0.1 } },
  { id: 'apresentador_reality', label: 'Apresentador(a) de reality', role: 'apresentador', genres: ['reality', 'talent_show', 'game_show'], carisma: [65, 95], popularity: [50, 90], prestige: [30, 65], ego: [45, 80], risk: [20, 55], salary: [40000, 160000], segmentBias: { jovem_ab: 0.1, jovem_cde: 0.1 } },
];

export function talentArchetypeForGenre(g: GenreId): TalentArchetype[] {
  return TALENT_ARCHETYPES.filter((t) => t.genres.includes(g));
}

export const ROLE_LABELS: Record<NpcRole, string> = {
  presidente: 'Presidência',
  comercial: 'Comercial',
  jornalismo: 'Jornalismo',
  artistico: 'Artístico',
  pesquisa: 'Pesquisa',
  assistente: 'Assistente',
  promocao: 'Promoção',
  juridico: 'Jurídico',
  talento: 'Talento',
  anunciante: 'Anunciante',
  colunista: 'Imprensa',
  investidor: 'Investidor',
};
