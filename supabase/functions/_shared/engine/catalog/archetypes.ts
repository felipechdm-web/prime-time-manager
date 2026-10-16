// Arquétipos de emissora (seção 11.1) e grades-modelo usadas para gerar
// a programação inicial de cada emissora.
//
// Formato de cada bloco: [início "HH:MM", duração em minutos, gênero, rótulo]
// "a|b" = usa o primeiro gênero disponível na era (infantil só com TV infantil forte).
// Rótulos começando com "*" indicam reprise.

import type { ArchetypeId, DayType, GenreId } from '../types.ts';

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  strategy: string;
  behavior: string;
  ai: {
    qualityMean: number;
    appealMean: number;
    reactivity: number; // 0-1: chance de reagir a perdas
    delay: [number, number]; // semanas para aplicar mudanças grandes
    aggression: number; // propensão a contraprogramar/estrear
    poach: number; // chance de assediar talentos
    lease: number; // propensão a arrendar faixas
    budget: number; // nível de gasto
    counter: number; // preferência por contraprogramação
  };
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  hegemonica: {
    id: 'hegemonica',
    name: 'Hegemônica',
    strategy: 'Proteger a liderança e a marca de qualidade',
    behavior: 'Investe em dramaturgia, evita popularesco, reage tarde mas com força',
    ai: { qualityMean: 72, appealMean: 74, reactivity: 0.45, delay: [4, 8], aggression: 0.45, poach: 0.15, lease: 0, budget: 1.0, counter: 0.3 },
  },
  popular_auditorio: {
    id: 'popular_auditorio',
    name: 'Popular de auditório',
    strategy: 'Liderar fins de semana e tardes com entretenimento de massa',
    behavior: 'Contraprograma muito, aposta em apresentadores carismáticos, compra enlatados baratos',
    ai: { qualityMean: 50, appealMean: 70, reactivity: 0.8, delay: [2, 5], aggression: 0.7, poach: 0.3, lease: 0.1, budget: 0.7, counter: 0.75 },
  },
  desafiante: {
    id: 'desafiante',
    name: 'Desafiante endinheirada',
    strategy: 'Tomar o 2º lugar comprando talento e formatos',
    behavior: 'Assedia talentos do jogador, faz grandes estreias, gasta acima do caixa',
    ai: { qualityMean: 60, appealMean: 64, reactivity: 0.7, delay: [2, 6], aggression: 0.65, poach: 0.55, lease: 0.15, budget: 0.95, counter: 0.4 },
  },
  jornalistica_esportiva: {
    id: 'jornalistica_esportiva',
    name: 'Jornalística/esportiva',
    strategy: 'Nicho de jornalismo e esporte',
    behavior: 'Briga por direitos esportivos, grade estável',
    ai: { qualityMean: 60, appealMean: 52, reactivity: 0.3, delay: [4, 8], aggression: 0.3, poach: 0.1, lease: 0.25, budget: 0.6, counter: 0.2 },
  },
  em_crise: {
    id: 'em_crise',
    name: 'Emissora em crise',
    strategy: 'Sobreviver',
    behavior: 'Arrenda faixas, vive de reprise, pode quebrar ou ser vendida',
    ai: { qualityMean: 40, appealMean: 48, reactivity: 0.4, delay: [2, 6], aggression: 0.25, poach: 0.0, lease: 0.7, budget: 0.35, counter: 0.3 },
  },
  publica_educativa: {
    id: 'publica_educativa',
    name: 'Pública/educativa',
    strategy: 'Missão, não audiência',
    behavior: 'Grade estável; não reage ao mercado',
    ai: { qualityMean: 70, appealMean: 34, reactivity: 0, delay: [8, 8], aggression: 0, poach: 0, lease: 0, budget: 0.3, counter: 0 },
  },
  canal_pago: {
    id: 'canal_pago',
    name: 'Canal pago temático',
    strategy: 'Nicho qualificado, receita mista',
    behavior: 'Maratonas, reprises estratégicas e estreias exclusivas',
    ai: { qualityMean: 62, appealMean: 55, reactivity: 0.1, delay: [4, 8], aggression: 0.1, poach: 0, lease: 0, budget: 0.4, counter: 0 },
  },
};

export type TemplateBlock = [string, number, string, string, number[]?];

export interface GridTemplate {
  weekday: TemplateBlock[];
  saturday: TemplateBlock[];
  sunday: TemplateBlock[];
  overrides?: TemplateBlock[]; // blocos específicos de um dia útil (5º elemento = dias)
}

const HEGEMONICA: GridTemplate = {
  weekday: [
    ['06:00', 120, 'telejornal', 'Telejornal matinal'],
    ['08:00', 180, 'infantil|feminino', 'Matinal'],
    ['11:00', 60, 'feminino', 'Revista da manhã'],
    ['12:00', 45, 'janela_local', 'Telejornal local (1ª edição)'],
    ['12:45', 45, 'telejornal', 'Telejornal da tarde'],
    ['13:30', 75, 'novela_18h', '*Reprise de novela'],
    ['14:45', 135, 'filme', 'Sessão da tarde'],
    ['17:00', 60, 'novela_juvenil|serie_estrangeira', 'Novela juvenil'],
    ['18:00', 60, 'novela_18h', 'Novela das seis'],
    ['19:00', 30, 'janela_local', 'Telejornal local (2ª edição)'],
    ['19:30', 60, 'novela_19h', 'Novela das sete'],
    ['20:30', 45, 'telejornal', 'Telejornal da noite'],
    ['21:15', 75, 'novela_21h', 'Novela das nove'],
    ['22:30', 60, 'serie_nacional|humoristico', 'Série das dez'],
    ['23:30', 60, 'talk_show', 'Talk show'],
    ['00:30', 30, 'telejornal', 'Jornal da madrugada'],
    ['01:00', 120, 'filme', 'Filme da madrugada'],
    ['03:00', 180, 'filme|serie_estrangeira', 'Madrugada de filmes'],
  ],
  overrides: [['21:45', 120, 'futebol', 'Futebol de quarta', [2]]],
  saturday: [
    ['06:00', 60, 'telejornal', 'Telejornal de sábado'],
    ['07:00', 240, 'infantil|feminino', 'Manhã de sábado'],
    ['11:00', 60, 'feminino|revista_eletronica', 'Variedades de sábado'],
    ['12:00', 45, 'janela_local', 'Telejornal local'],
    ['12:45', 45, 'telejornal', 'Telejornal da tarde'],
    ['13:30', 150, 'filme', 'Filme de sábado'],
    ['16:00', 120, 'auditorio|game_show', 'Tarde de sábado'],
    ['18:00', 60, 'novela_18h', 'Novela das seis'],
    ['19:00', 30, 'janela_local', 'Telejornal local (2ª edição)'],
    ['19:30', 60, 'novela_19h', 'Novela das sete'],
    ['20:30', 45, 'telejornal', 'Telejornal da noite'],
    ['21:15', 75, 'novela_21h', 'Novela das nove'],
    ['22:30', 90, 'humoristico', 'Humorístico de sábado'],
    ['00:00', 120, 'filme', 'Filme de sábado à noite'],
    ['02:00', 240, 'filme|serie_estrangeira', 'Madrugada de filmes'],
  ],
  sunday: [
    ['06:00', 90, 'documentario', 'Programa rural'],
    ['07:30', 90, 'infantil|feminino', 'Manhã de domingo'],
    ['09:00', 120, 'mesa_redonda', 'Revista esportiva'],
    ['11:00', 120, 'filme', 'Filme de domingo'],
    ['13:00', 180, 'auditorio', 'Auditório de domingo'],
    ['16:00', 120, 'futebol', 'Futebol de domingo'],
    ['18:00', 120, 'auditorio|game_show', 'Domingo à tarde (2ª parte)'],
    ['20:00', 150, 'revista_eletronica', 'Revista de domingo'],
    ['22:30', 90, 'mesa_redonda|serie_nacional', 'Mesa-redonda'],
    ['00:00', 120, 'filme', 'Filme de domingo à noite'],
    ['02:00', 240, 'filme|serie_estrangeira', 'Madrugada de filmes'],
  ],
};

const POPULAR: GridTemplate = {
  weekday: [
    ['06:00', 60, 'telejornal', 'Jornal da manhã'],
    ['07:00', 240, 'infantil|feminino', 'Programa infantil'],
    ['11:00', 60, 'game_show|feminino', 'Variedades da manhã'],
    ['12:00', 45, 'janela_local', 'Telejornal local'],
    ['12:45', 75, 'novela_18h', '*Novela importada'],
    ['14:00', 120, 'filme|game_show', 'Cinema da tarde'],
    ['16:00', 60, 'serie_estrangeira', 'Série da tarde'],
    ['17:00', 60, 'game_show', 'Show de prêmios da tarde'],
    ['18:00', 60, 'policial|telejornal', 'Jornal popular'],
    ['19:00', 60, 'novela_juvenil|novela_19h', 'Novela infantojuvenil'],
    ['20:00', 45, 'telejornal', 'Telejornal da noite'],
    ['20:45', 75, 'novela_21h|novela_18h', 'Novela da noite'],
    ['22:00', 60, 'game_show|humoristico', 'Programa de humor'],
    ['23:00', 60, 'talk_show', 'Talk show'],
    ['00:00', 30, 'telejornal', 'Jornal da meia-noite'],
    ['00:30', 90, 'serie_estrangeira', 'Série da madrugada'],
    ['02:00', 240, 'filme', 'Madrugada de filmes'],
  ],
  saturday: [
    ['06:00', 60, 'feminino', 'Sábado em casa'],
    ['07:00', 240, 'infantil|feminino', 'Sábado animado'],
    ['11:00', 120, 'game_show|auditorio', 'Gincana de sábado'],
    ['13:00', 180, 'auditorio', 'Sábado no auditório'],
    ['16:00', 120, 'filme', 'Filme de sábado'],
    ['18:00', 60, 'policial|telejornal', 'Jornal popular de sábado'],
    ['19:00', 60, 'novela_juvenil|novela_19h', 'Novela infantojuvenil'],
    ['20:00', 120, 'game_show|talent_show', 'Show de sábado'],
    ['22:00', 90, 'humoristico', 'Humor de sábado'],
    ['23:30', 150, 'filme', 'Filme de sábado à noite'],
    ['02:00', 240, 'filme|serie_estrangeira', 'Madrugada de filmes'],
  ],
  sunday: [
    ['06:00', 120, 'documentario|feminino', 'Domingo cedo'],
    ['08:00', 180, 'infantil|game_show', 'Domingo da criançada'],
    ['11:00', 240, 'auditorio', 'Auditório de domingo'],
    ['15:00', 240, 'auditorio', 'Auditório de domingo (2ª parte)'],
    ['19:00', 120, 'game_show|talent_show', 'Show de prêmios de domingo'],
    ['21:00', 90, 'reality|serie_estrangeira', 'Atração de domingo à noite'],
    ['22:30', 90, 'talk_show|humoristico', 'Domingo à noite'],
    ['00:00', 120, 'filme', 'Filme de domingo'],
    ['02:00', 240, 'filme|serie_estrangeira', 'Madrugada de filmes'],
  ],
};

const DESAFIANTE: GridTemplate = {
  weekday: [
    ['06:00', 90, 'telejornal', 'Jornal da manhã'],
    ['07:30', 210, 'infantil|feminino', 'Manhã da família'],
    ['11:00', 60, 'feminino', 'Revista feminina'],
    ['12:00', 45, 'janela_local', 'Telejornal local'],
    ['12:45', 75, 'policial|telejornal', 'Policial do almoço'],
    ['14:00', 120, 'filme|serie_estrangeira', 'Cinema da tarde'],
    ['16:00', 60, 'serie_estrangeira|talk_show', 'Série da tarde'],
    ['17:00', 60, 'game_show|serie_estrangeira', 'Tarde de prêmios'],
    ['18:00', 60, 'policial', 'Jornalismo popular'],
    ['19:00', 30, 'janela_local', 'Telejornal local (2ª edição)'],
    ['19:30', 60, 'novela_biblica|novela_18h', 'Novela das sete e meia'],
    ['20:30', 45, 'telejornal', 'Telejornal da noite'],
    ['21:15', 75, 'novela_21h', 'Novela da noite'],
    ['22:30', 75, 'reality|serie_nacional', 'Atração das dez e meia'],
    ['23:45', 45, 'talk_show', 'Talk show'],
    ['00:30', 30, 'telejornal', 'Jornal da madrugada'],
    ['01:00', 300, 'filme|religioso', 'Madrugada'],
  ],
  saturday: [
    ['06:00', 60, 'telejornal', 'Jornal de sábado'],
    ['07:00', 240, 'infantil|feminino', 'Sábado da família'],
    ['11:00', 60, 'feminino', 'Revista de sábado'],
    ['12:00', 45, 'janela_local', 'Telejornal local'],
    ['12:45', 75, 'policial|telejornal', 'Policial de sábado'],
    ['14:00', 120, 'filme', 'Filme de sábado'],
    ['16:00', 120, 'game_show|auditorio', 'Tarde de sábado'],
    ['18:00', 60, 'policial', 'Jornalismo popular'],
    ['19:00', 30, 'janela_local', 'Telejornal local (2ª edição)'],
    ['19:30', 60, 'novela_biblica|novela_18h', 'Novela das sete e meia'],
    ['20:30', 45, 'telejornal', 'Telejornal da noite'],
    ['21:15', 105, 'talent_show|game_show', 'Show de sábado'],
    ['23:00', 60, 'musical|humoristico', 'Noite de sábado'],
    ['00:00', 360, 'filme|religioso', 'Madrugada'],
  ],
  sunday: [
    ['06:00', 120, 'religioso|documentario', 'Domingo cedo'],
    ['08:00', 180, 'infantil|feminino', 'Domingo da família'],
    ['11:00', 120, 'mesa_redonda|filme', 'Esporte de domingo'],
    ['13:00', 300, 'auditorio', 'Auditório de domingo'],
    ['18:00', 120, 'game_show|talent_show', 'Domingo de prêmios'],
    ['20:00', 150, 'revista_eletronica', 'Revista dominical'],
    ['22:30', 90, 'reality|serie_nacional', 'Domingo à noite'],
    ['00:00', 360, 'filme|religioso', 'Madrugada'],
  ],
};

const JORNALISTICA: GridTemplate = {
  weekday: [
    ['06:00', 120, 'telejornal', 'Jornal da manhã'],
    ['08:00', 180, 'feminino|infantil', 'Manhã em casa'],
    ['11:00', 60, 'talk_show|feminino', 'Entrevista da manhã'],
    ['12:00', 45, 'janela_local', 'Telejornal local'],
    ['12:45', 75, 'mesa_redonda', 'Esporte do almoço'],
    ['14:00', 120, 'filme|serie_estrangeira', 'Filme da tarde'],
    ['16:00', 120, 'policial', 'Policial da tarde'],
    ['18:00', 60, 'policial|telejornal', 'Plantão da cidade'],
    ['19:00', 30, 'janela_local', 'Telejornal local (2ª edição)'],
    ['19:30', 60, 'telejornal', 'Jornal da noite'],
    ['20:30', 90, 'serie_estrangeira|filme', 'Série da noite'],
    ['22:00', 60, 'talk_show|reality', 'Noite de entrevistas'],
    ['23:00', 60, 'mesa_redonda', 'Debate esportivo'],
    ['00:00', 30, 'telejornal', 'Jornal da meia-noite'],
    ['00:30', 330, 'filme|televendas', 'Madrugada'],
  ],
  overrides: [['22:00', 120, 'futebol', 'Futebol de quarta', [2]]],
  saturday: [
    ['06:00', 120, 'documentario|telejornal', 'Sábado cedo'],
    ['08:00', 240, 'infantil|feminino', 'Manhã de sábado'],
    ['12:00', 45, 'janela_local', 'Telejornal local'],
    ['12:45', 195, 'filme|mesa_redonda', 'Tarde de cinema'],
    ['16:00', 120, 'mesa_redonda', 'Sábado esportivo'],
    ['18:00', 60, 'policial', 'Plantão de sábado'],
    ['19:00', 30, 'janela_local', 'Telejornal local (2ª edição)'],
    ['19:30', 60, 'telejornal', 'Jornal de sábado'],
    ['20:30', 150, 'filme', 'Cinema de sábado'],
    ['23:00', 60, 'talk_show|musical', 'Noite de sábado'],
    ['00:00', 360, 'filme|televendas', 'Madrugada'],
  ],
  sunday: [
    ['06:00', 120, 'documentario|religioso', 'Domingo cedo'],
    ['08:00', 180, 'mesa_redonda|infantil', 'Esporte de domingo'],
    ['11:00', 120, 'filme', 'Filme de domingo'],
    ['13:00', 120, 'auditorio|game_show', 'Domingo de variedades'],
    ['15:00', 60, 'mesa_redonda', 'Aquecimento da rodada'],
    ['16:00', 120, 'futebol', 'Futebol de domingo'],
    ['18:00', 120, 'filme|auditorio', 'Domingo à tarde'],
    ['20:00', 120, 'revista_eletronica|documentario', 'Revista de domingo'],
    ['22:00', 120, 'mesa_redonda', 'Mesa-redonda'],
    ['00:00', 360, 'filme|televendas', 'Madrugada'],
  ],
};

const CRISE: GridTemplate = {
  weekday: [
    ['06:00', 120, 'religioso|televendas', 'Programa arrendado'],
    ['08:00', 120, 'televendas|feminino', 'Ofertas da manhã'],
    ['10:00', 120, 'feminino|talk_show', 'Manhã popular'],
    ['12:00', 120, 'policial', 'Policial do meio-dia'],
    ['14:00', 120, 'filme|serie_estrangeira', 'Filme da tarde'],
    ['16:00', 120, 'televendas|talk_show', 'Tarde de ofertas'],
    ['18:00', 60, 'policial|telejornal', 'Alerta da cidade'],
    ['19:00', 60, 'telejornal', 'Jornal da noite'],
    ['20:00', 90, 'filme|serie_estrangeira', 'Cinema da noite'],
    ['21:30', 90, 'talk_show|humoristico', 'Noite popular'],
    ['23:00', 60, 'talk_show|game_show', 'Fim de noite'],
    ['00:00', 360, 'religioso|televendas', 'Madrugada arrendada'],
  ],
  saturday: [
    ['06:00', 240, 'religioso|televendas', 'Programa arrendado'],
    ['10:00', 120, 'feminino|infantil', 'Sábado popular'],
    ['12:00', 120, 'policial|filme', 'Policial de sábado'],
    ['14:00', 240, 'filme', 'Filmes de sábado'],
    ['18:00', 120, 'auditorio|game_show', 'Auditório de sábado'],
    ['20:00', 120, 'filme', 'Filme de sábado'],
    ['22:00', 120, 'talk_show|musical', 'Noite de sábado'],
    ['00:00', 360, 'religioso|televendas', 'Madrugada arrendada'],
  ],
  sunday: [
    ['06:00', 300, 'religioso', 'Culto de domingo'],
    ['11:00', 180, 'filme|auditorio', 'Domingo de filmes'],
    ['14:00', 240, 'auditorio|game_show', 'Domingo popular'],
    ['18:00', 120, 'filme', 'Filme de domingo'],
    ['20:00', 120, 'talk_show|documentario', 'Domingo à noite'],
    ['22:00', 120, 'filme', 'Filme da noite'],
    ['00:00', 360, 'religioso|televendas', 'Madrugada arrendada'],
  ],
};

const PUBLICA: GridTemplate = {
  weekday: [
    ['06:00', 60, 'documentario|telejornal', 'Documentário matinal'],
    ['07:00', 240, 'infantil', 'Manhã das crianças'],
    ['11:00', 60, 'documentario', 'Ciência e cultura'],
    ['12:00', 60, 'telejornal', 'Jornal do meio-dia'],
    ['13:00', 180, 'infantil', 'Tarde das crianças'],
    ['16:00', 120, 'documentario|serie_estrangeira', 'Tarde documental'],
    ['18:00', 60, 'infantil|documentario', 'Fim de tarde'],
    ['19:00', 60, 'telejornal', 'Jornal da noite'],
    ['20:00', 120, 'documentario|talk_show', 'Debate da noite'],
    ['22:00', 60, 'talk_show', 'Grande entrevista'],
    ['23:00', 60, 'musical', 'Concerto'],
    ['00:00', 360, 'documentario|filme', 'Madrugada cultural'],
  ],
  saturday: [
    ['06:00', 360, 'infantil', 'Sábado das crianças'],
    ['12:00', 120, 'documentario', 'Sábado documental'],
    ['14:00', 240, 'filme|documentario', 'Cinema clássico'],
    ['18:00', 120, 'musical', 'Palco de sábado'],
    ['20:00', 120, 'documentario', 'Documentário de sábado'],
    ['22:00', 120, 'musical|talk_show', 'Noite de música'],
    ['00:00', 360, 'documentario|filme', 'Madrugada cultural'],
  ],
  sunday: [
    ['06:00', 360, 'infantil', 'Domingo das crianças'],
    ['12:00', 240, 'documentario|filme', 'Domingo cultural'],
    ['16:00', 180, 'musical|documentario', 'Concerto de domingo'],
    ['19:00', 60, 'telejornal', 'Jornal de domingo'],
    ['20:00', 120, 'talk_show|documentario', 'Roda de conversa'],
    ['22:00', 120, 'filme', 'Cine clássico'],
    ['00:00', 360, 'documentario|filme', 'Madrugada cultural'],
  ],
};

const PAGO: GridTemplate = {
  weekday: [
    ['06:00', 360, 'serie_estrangeira', 'Maratona de séries'],
    ['12:00', 240, 'filme', 'Filmes da tarde'],
    ['16:00', 240, 'serie_estrangeira', 'Séries da tarde'],
    ['20:00', 150, 'serie_nacional|filme', 'Estreia da noite'],
    ['22:30', 90, 'filme', 'Filme das dez e meia'],
    ['00:00', 360, 'filme|serie_estrangeira', 'Madrugada'],
  ],
  saturday: [
    ['06:00', 360, 'serie_estrangeira', 'Maratona de sábado'],
    ['12:00', 480, 'filme', 'Sábado de cinema'],
    ['20:00', 150, 'filme', 'Grande estreia'],
    ['22:30', 90, 'serie_nacional|filme', 'Série nacional'],
    ['00:00', 360, 'filme|serie_estrangeira', 'Madrugada'],
  ],
  sunday: [
    ['06:00', 360, 'documentario|serie_estrangeira', 'Domingo documental'],
    ['12:00', 480, 'filme', 'Domingo de cinema'],
    ['20:00', 150, 'serie_nacional|filme', 'Série de domingo'],
    ['22:30', 90, 'filme', 'Filme de domingo'],
    ['00:00', 360, 'filme|serie_estrangeira', 'Madrugada'],
  ],
};

const REDE_NOVA: GridTemplate = {
  weekday: [
    ['06:00', 120, 'telejornal', 'Jornal da manhã'],
    ['08:00', 240, 'tapa_buraco|serie_estrangeira', 'Programação de teste'],
    ['12:00', 120, 'serie_estrangeira', 'Séries do almoço'],
    ['14:00', 240, 'filme', 'Filmes da tarde'],
    ['18:00', 60, 'telejornal', 'Jornal do fim de tarde'],
    ['19:00', 60, 'serie_estrangeira', 'Série das sete'],
    ['20:00', 120, 'filme', 'Filme da noite'],
    ['22:00', 120, 'serie_estrangeira', 'Série da noite'],
    ['00:00', 360, 'tapa_buraco', 'Sinal em teste'],
  ],
  saturday: [
    ['06:00', 360, 'tapa_buraco|serie_estrangeira', 'Programação de teste'],
    ['12:00', 360, 'filme', 'Filmes de sábado'],
    ['18:00', 60, 'telejornal', 'Jornal de sábado'],
    ['19:00', 300, 'filme', 'Noite de cinema'],
    ['00:00', 360, 'tapa_buraco', 'Sinal em teste'],
  ],
  sunday: [
    ['06:00', 360, 'tapa_buraco|serie_estrangeira', 'Programação de teste'],
    ['12:00', 360, 'filme', 'Filmes de domingo'],
    ['18:00', 120, 'serie_estrangeira', 'Séries de domingo'],
    ['20:00', 240, 'filme', 'Domingo de cinema'],
    ['00:00', 360, 'tapa_buraco', 'Sinal em teste'],
  ],
};

export const GRID_TEMPLATES: Record<string, GridTemplate> = {
  hegemonica: HEGEMONICA,
  popular_auditorio: POPULAR,
  desafiante: DESAFIANTE,
  jornalistica_esportiva: JORNALISTICA,
  em_crise: CRISE,
  publica_educativa: PUBLICA,
  canal_pago: PAGO,
  rede_nova: REDE_NOVA,
};

export function templateDay(t: GridTemplate, dt: DayType): TemplateBlock[] {
  return dt === 'weekday' ? t.weekday : dt === 'saturday' ? t.saturday : t.sunday;
}

export function resolveGenre(spec: string, available: (g: GenreId) => boolean): GenreId {
  const parts = spec.split('|') as GenreId[];
  for (const g of parts) if (available(g)) return g;
  return parts[parts.length - 1];
}
