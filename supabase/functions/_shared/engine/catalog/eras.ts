// Pacotes de regras por era (seção 5 do documento-mestre).
// Os números são valores de calibração do jogo, não estatísticas oficiais.

import type { ArchetypeId, EraId } from '../types.ts';

export interface EraParams {
  tlePrime: number; // TLE médio no horário nobre (fração do universo)
  digitalEscape: number; // fuga para outras telas
  noiseSd: number; // ruído diário (pontos, escala do documento)
  beta: number; // sensibilidade do logit
  retentionBase: number; // herança base entre programas
  priceIndex: number; // 1 = R$ de 2026
  socialWeight: number; // peso das redes na reputação
  minuteByMinute: boolean;
  minuteFromYear: number; // ano em que o minuto a minuto fica disponível
  outsideUtil: number; // utilidade da opção "fora da TV aberta"
  youngOutside: number; // atração extra das outras telas para jovens
  cppBase: number; // custo por ponto de referência (R$ 2026, peso de faixa 1,0)
  universeScale: number; // tamanho do universo de domicílios vs 2026
  adMinutesDefault: number;
  kidsTV: number; // força da audiência infantil nas manhãs/tardes
  payTvReach: number; // alcance da TV paga (para canal pago temático)
  costScale: number;
  inflation: 'alta_choques' | 'alta_ate_94' | 'baixa';
}

export interface EraDef {
  id: EraId;
  name: string;
  tagline: string;
  startYear: number;
  endYear: number;
  playableYears: number[];
  summary: string;
  messageFormat: string;
  currency: string;
  currencyNote: string;
  params: EraParams;
}

export const ERAS: Record<EraId, EraDef> = {
  '80s': {
    id: '80s',
    name: 'Anos 80',
    tagline: 'A era da hegemonia',
    startYear: 1983,
    endYear: 1989,
    playableYears: [1983, 1984, 1985, 1986, 1987, 1988, 1989],
    summary:
      'Mercado concentrado: uma líder dominante, uma vice popular de auditório e emissoras menores buscando nichos. Novelas e humorísticos com audiências enormes, TV ligada em quase todas as casas no horário nobre e quase nenhuma concorrência fora da TV aberta. Medição lenta (consolidado diário; minuto a minuto só no fim da década em praças-chave). Inflação alta e planos econômicos que congelam preços. Censura prévia no início da década e abertura política gradual. Comunicação interna por memorando, telex e telefone fixo.',
    messageFormat: 'memorando datilografado, telex ou telefonema',
    currency: 'Cruzeiro / Cruzado / Cruzado Novo',
    currencyNote: 'Valores exibidos em R$ convertidos de 2026 (moeda da época: Cruzeiro até 1986, Cruzado até 1989, depois Cruzado Novo).',
    params: {
      tlePrime: 0.7,
      digitalEscape: 0,
      noiseSd: 1.0,
      beta: 1.0,
      retentionBase: 0.55,
      priceIndex: 1,
      socialWeight: 0,
      minuteByMinute: false,
      minuteFromYear: 1988,
      outsideUtil: 0.9,
      youngOutside: 0,
      cppBase: 7500,
      universeScale: 0.55,
      adMinutesDefault: 12,
      kidsTV: 1.0,
      payTvReach: 0,
      costScale: 0.85,
      inflation: 'alta_choques',
    },
  },
  '90s': {
    id: '90s',
    name: 'Anos 90',
    tagline: 'A guerra do domingo',
    startYear: 1990,
    endYear: 1999,
    playableYears: [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999],
    summary:
      'Concorrência acirrada: emissoras investem em dramaturgia rival, auditórios e programas populares; a disputa de domingo à tarde é o coração da década. O Plano Real (1994) estabiliza os preços e aquece o mercado publicitário. A TV por assinatura chega, pequena e de elite. O minuto a minuto se populariza e a programação passa a reagir ao vivo ("segura o quadro", "estica o bloco"). Falências e trocas de controle de redes acontecem. Comunicação por fax, telefone e os primeiros celulares.',
    messageFormat: 'fax, memorando ou telefonema',
    currency: 'Cruzeiro / Cruzeiro Real / Real',
    currencyNote: 'Valores exibidos em R$ nominais da época (índice 0,15 sobre 2026).',
    params: {
      tlePrime: 0.68,
      digitalEscape: 0.02,
      noiseSd: 1.2,
      beta: 1.1,
      retentionBase: 0.55,
      priceIndex: 0.15,
      socialWeight: 0,
      minuteByMinute: true,
      minuteFromYear: 1990,
      outsideUtil: 1.6,
      youngOutside: 0.1,
      cppBase: 8000,
      universeScale: 0.68,
      adMinutesDefault: 12,
      kidsTV: 1.0,
      payTvReach: 0.06,
      costScale: 0.9,
      inflation: 'alta_ate_94',
    },
  },
  '00s': {
    id: '00s',
    name: 'Anos 2000',
    tagline: 'Reality e diversificação',
    startYear: 2000,
    endYear: 2009,
    playableYears: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009],
    summary:
      'Explosão dos reality shows e dos formatos internacionais licenciados. Uma concorrente investe pesado em dramaturgia para brigar pelo 2º lugar. TV digital começa em 2007 nas capitais; a internet cresce, mas ainda é coadjuvante. Anos de Copa e de eleição são marcos de faturamento e de grade. Crise financeira global em 2008. Comunicação por e-mail e celular.',
    messageFormat: 'e-mail ou ligação no celular',
    currency: 'Real',
    currencyNote: 'Valores exibidos em R$ nominais da época (índice 0,35 sobre 2026).',
    params: {
      tlePrime: 0.62,
      digitalEscape: 0.06,
      noiseSd: 1.4,
      beta: 1.2,
      retentionBase: 0.5,
      priceIndex: 0.35,
      socialWeight: 0.1,
      minuteByMinute: true,
      minuteFromYear: 2000,
      outsideUtil: 2.0,
      youngOutside: 0.25,
      cppBase: 8500,
      universeScale: 0.8,
      adMinutesDefault: 12,
      kidsTV: 0.85,
      payTvReach: 0.12,
      costScale: 1,
      inflation: 'baixa',
    },
  },
  '10s': {
    id: '10s',
    name: 'Anos 2010',
    tagline: 'A segunda tela',
    startYear: 2010,
    endYear: 2019,
    playableYears: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019],
    summary:
      'O streaming estrangeiro chega e disputa o tempo do público jovem; o TLE cai aos poucos. Redes sociais viram termômetro (trending topics) e afetam a reputação em tempo real. Desligamento do sinal analógico por etapas e investimento em HD. Anunciantes começam a migrar verba para o digital e o preço do 30s fica pressionado. Restrições à publicidade infantil. Comunicação por e-mail e WhatsApp.',
    messageFormat: 'e-mail ou WhatsApp',
    currency: 'Real',
    currencyNote: 'Valores exibidos em R$ nominais da época (índice 0,6 sobre 2026).',
    params: {
      tlePrime: 0.55,
      digitalEscape: 0.18,
      noiseSd: 1.6,
      beta: 1.3,
      retentionBase: 0.45,
      priceIndex: 0.6,
      socialWeight: 0.5,
      minuteByMinute: true,
      minuteFromYear: 2010,
      outsideUtil: 2.8,
      youngOutside: 0.5,
      cppBase: 8000,
      universeScale: 0.92,
      adMinutesDefault: 12,
      kidsTV: 0.45,
      payTvReach: 0.3,
      costScale: 1.05,
      inflation: 'baixa',
    },
  },
  now: {
    id: 'now',
    name: 'Atual (2026)',
    tagline: 'TV em todas as telas',
    startYear: 2020,
    endYear: 2036,
    playableYears: [2026],
    summary:
      'TV linear ainda grande, mas fragmentada: YouTube e streaming disputam a audiência total (em dez/2024 as plataformas digitais já respondiam por 20,1% do vídeo no Brasil). A TV 3.0 (DTV+) entrou em operação comercial em junho de 2026 no Rio, em São Paulo e em Brasília, liberando interatividade, aplicativo do canal e publicidade segmentada. 2026 é ano de Copa do Mundo e de eleições gerais: HGPE, debates e apuração disputam a grade. Anunciantes compram audiência cross-media (TV + digital). Comunicação por WhatsApp.',
    messageFormat: 'WhatsApp, e-mail ou áudio',
    currency: 'Real',
    currencyNote: 'Valores em R$ de 2026.',
    params: {
      tlePrime: 0.45,
      digitalEscape: 0.35,
      noiseSd: 1.8,
      beta: 1.4,
      retentionBase: 0.4,
      priceIndex: 1,
      socialWeight: 0.8,
      minuteByMinute: true,
      minuteFromYear: 2020,
      outsideUtil: 3.3,
      youngOutside: 0.7,
      cppBase: 7000,
      universeScale: 1,
      adMinutesDefault: 12,
      kidsTV: 0.3,
      payTvReach: 0.25,
      costScale: 1,
      inflation: 'baixa',
    },
  },
};

export const ERA_ORDER: EraId[] = ['80s', '90s', '00s', '10s', 'now'];

export function eraForYear(year: number): EraId {
  if (year <= 1989) return '80s';
  if (year <= 1999) return '90s';
  if (year <= 2009) return '00s';
  if (year <= 2019) return '10s';
  return 'now';
}

export function eraIndex(era: EraId): number {
  return ERA_ORDER.indexOf(era);
}

// ===== Regras por era (era_rules) =====
export interface EraRule {
  era: EraId;
  key: string;
  severity: 'block' | 'warn' | 'info';
  config: Record<string, unknown>;
  text: string;
}

const RATING_HOURS = { L: null, '10': null, '12': '20:00', '14': '21:00', '16': '22:00', '18': '23:00' };

function ratingRule(era: EraId, severity: 'block' | 'warn', note: string): EraRule {
  return {
    era,
    key: 'rating_hours',
    severity,
    config: { hours: RATING_HOURS, fineUntilYear: 2015 },
    text: `Classificação indicativa: livre e 10 anos a qualquer hora; 12 a partir das 20h; 14 a partir das 21h; 16 a partir das 22h; 18 a partir das 23h. ${note}`,
  };
}

export const ERA_RULES: EraRule[] = [
  ratingRule('80s', 'warn', 'Exibir fora do horário gera multa; no início da década há censura prévia.'),
  ratingRule('90s', 'warn', 'Exibir fora do horário gera multa.'),
  ratingRule('00s', 'warn', 'Exibir fora do horário gera multa.'),
  ratingRule('10s', 'warn', 'Até 2015 gera multa; a partir de 2016 o horário vira recomendação e o descumprimento gera pressão pública e regulatória.'),
  ratingRule('now', 'warn', 'O horário é recomendação; descumprir gera pressão pública e regulatória, não multa automática.'),
  ...(['80s', '90s', '00s', '10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'ad_cap',
    severity: 'block' as const,
    config: { defaultMinutes: 12, maxMinutes: 15 },
    text: 'Publicidade comercial limitada a 25% do tempo; o jogo usa 12 min/hora como padrão e permite até 15.',
  })),
  ...(['80s', '90s', '00s', '10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'hgpe',
    severity: 'block' as const,
    config: { blocks: ['13:00', '20:30'], minutesBefore2016: 45, minutesFrom2016: 15, days: [0, 1, 2, 3, 4, 5] },
    text: 'Em anos de eleição, o Horário Gratuito de Propaganda Eleitoral ocupa faixas fixas de segunda a sábado.',
  })),
  ...(['90s', '00s', '10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'alcohol_ads',
    severity: 'info' as const,
    config: { strongAfter: '21:00' },
    text: 'Comerciais de bebidas mais fortes só em horário noturno; cervejas livres.',
  })),
  ...(['00s', '10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'tobacco_ads',
    severity: 'block' as const,
    config: {},
    text: 'Proibido anunciar tabaco.',
  })),
  ...(['10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'kids_ads',
    severity: 'warn' as const,
    config: { revenueMult: 0.55 },
    text: 'Restrições à publicidade infantil reduzem a receita da faixa infantil.',
  })),
  ...(['10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'national_quota',
    severity: 'warn' as const,
    config: { hoursPerWeek: 3.5, fromYear: 2011, payOnly: true },
    text: 'Canais pagos de espaço qualificado devem exibir 3h30 semanais de conteúdo nacional no horário nobre.',
  })),
  ...(['80s', '90s', '00s', '10s', 'now'] as EraId[]).map((era) => ({
    era,
    key: 'affiliates',
    severity: 'block' as const,
    config: { windows: ['12:00', '19:00'] },
    text: 'No modo rede, as janelas locais das afiliadas são obrigatórias e não programáveis.',
  })),
  {
    era: '80s',
    key: 'censorship',
    severity: 'info',
    config: { untilYear: 1985 },
    text: 'Censura prévia: capítulos podem ser cortados pelo órgão censor até 1985.',
  },
];

export function rulesFor(era: EraId): EraRule[] {
  return ERA_RULES.filter((r) => r.era === era);
}

// ===== Emissoras reais por era (seção 11.5) =====
export interface RealStationDef {
  key: string;
  name: string;
  short: string;
  archetype: ArchetypeId;
  power: number;
  color: string;
  regional: Partial<Record<string, number>>;
  fact: string;
  from?: string; // data de entrada no ar dentro da era
  until?: string; // data de saída do ar
}

const GLOBO_REG = { SP: 1.0, RJ: 1.12, BH: 1.08, POA: 1.0, REC: 1.05, SSA: 1.0, FOR: 1.02, CWB: 1.02, GYN: 1.05, DF: 1.05, CPS: 1.0, BEL: 1.0, VIX: 1.05, MAO: 1.0, FLN: 1.0 };
const SBT_REG = { SP: 1.05, RJ: 0.95, BH: 0.95, POA: 0.92, REC: 1.1, SSA: 1.05, FOR: 1.1, CWB: 1.0, GYN: 1.0, DF: 0.95, CPS: 1.05, BEL: 1.15, VIX: 0.95, MAO: 1.15, FLN: 0.95 };
const RECORD_REG = { SP: 1.1, RJ: 1.1, BH: 1.0, POA: 0.92, REC: 1.0, SSA: 1.05, FOR: 0.98, CWB: 0.95, GYN: 1.0, DF: 1.0, CPS: 1.05, BEL: 1.05, VIX: 1.0, MAO: 1.0, FLN: 0.92 };
const BAND_REG = { SP: 1.15, RJ: 0.88, BH: 0.95, POA: 1.15, REC: 0.85, SSA: 0.85, FOR: 0.85, CWB: 1.05, GYN: 0.95, DF: 0.95, CPS: 1.1, BEL: 0.85, VIX: 0.9, MAO: 0.85, FLN: 1.0 };
const MANCHETE_REG = { SP: 0.95, RJ: 1.3, BH: 1.0, POA: 0.9, REC: 0.95, SSA: 0.95, FOR: 0.9, CWB: 0.9, GYN: 0.9, DF: 1.0, CPS: 0.95, BEL: 0.9, VIX: 1.05, MAO: 0.9, FLN: 0.9 };
const REDETV_REG = { SP: 1.12, RJ: 1.05, BH: 0.92, POA: 0.9, REC: 0.95, SSA: 0.92, FOR: 1.0, CWB: 0.9, GYN: 0.9, DF: 0.95, CPS: 1.05, BEL: 0.9, VIX: 0.9, MAO: 0.9, FLN: 0.9 };
const CULTURA_REG = { SP: 1.35, RJ: 0.75, BH: 0.8, POA: 0.8, REC: 0.75, SSA: 0.75, FOR: 0.75, CWB: 0.85, GYN: 0.75, DF: 1.1, CPS: 1.15, BEL: 0.7, VIX: 0.75, MAO: 0.7, FLN: 0.8 };

export const REAL_STATIONS: Record<EraId, RealStationDef[]> = {
  '80s': [
    { key: 'globo', name: 'Globo', short: 'GLO', archetype: 'hegemonica', power: 1.0, color: '#3b82f6', regional: GLOBO_REG, fact: 'Liderança absoluta da década.' },
    { key: 'sbt', name: 'SBT', short: 'SBT', archetype: 'popular_auditorio', power: 0.32, color: '#f59e0b', regional: SBT_REG, fact: 'Fundada em 1981, firma-se como vice com auditórios e enlatados.' },
    { key: 'manchete', name: 'Manchete', short: 'MAN', archetype: 'desafiante', power: 0.12, color: '#a855f7', regional: MANCHETE_REG, fact: 'Fundada em 5/6/1983 com proposta de alto padrão; prejuízos já evidentes em 1985.', from: '1983-06-05' },
    { key: 'band', name: 'Bandeirantes', short: 'BAN', archetype: 'jornalistica_esportiva', power: 0.0, color: '#10b981', regional: BAND_REG, fact: 'Jornalismo e esporte como identidade.' },
    { key: 'record', name: 'Record', short: 'REC', archetype: 'em_crise', power: -0.25, color: '#ef4444', regional: RECORD_REG, fact: 'Situação financeira ruim na segunda metade da década; vendida em 1989.' },
    { key: 'cultura', name: 'TV Cultura', short: 'CUL', archetype: 'publica_educativa', power: -0.45, color: '#14b8a6', regional: CULTURA_REG, fact: 'Missão educativa.' },
  ],
  '90s': [
    { key: 'globo', name: 'Globo', short: 'GLO', archetype: 'hegemonica', power: 0.92, color: '#3b82f6', regional: GLOBO_REG, fact: 'Segue líder; reage à concorrência de dramaturgia e auditório.' },
    { key: 'sbt', name: 'SBT', short: 'SBT', archetype: 'popular_auditorio', power: 0.42, color: '#f59e0b', regional: SBT_REG, fact: 'Vice da década; protagonista da guerra do domingo.' },
    { key: 'manchete', name: 'Manchete', short: 'MAN', archetype: 'desafiante', power: 0.12, color: '#a855f7', regional: MANCHETE_REG, fact: 'Auge de dramaturgia no começo da década; sai do ar em 10/5/1999.', until: '1999-05-10' },
    { key: 'record', name: 'Record', short: 'REC', archetype: 'desafiante', power: 0.05, color: '#ef4444', regional: RECORD_REG, fact: 'Sob novo controle, expande a rede nacional ao longo da década.' },
    { key: 'band', name: 'Bandeirantes', short: 'BAN', archetype: 'jornalistica_esportiva', power: 0.0, color: '#10b981', regional: BAND_REG, fact: 'Esporte e jornalismo; disputa direitos esportivos.' },
    { key: 'redetv', name: 'RedeTV!', short: 'RTV', archetype: 'em_crise', power: -0.3, color: '#ec4899', regional: REDETV_REG, fact: 'Ocupa as concessões da Manchete e estreia no fim de 1999.', from: '1999-11-15' },
    { key: 'cultura', name: 'TV Cultura', short: 'CUL', archetype: 'publica_educativa', power: -0.4, color: '#14b8a6', regional: CULTURA_REG, fact: 'Infantis e educativos de prestígio.' },
  ],
  '00s': [
    { key: 'globo', name: 'Globo', short: 'GLO', archetype: 'hegemonica', power: 0.86, color: '#3b82f6', regional: GLOBO_REG, fact: 'Líder, com realities e dramaturgia.' },
    { key: 'record', name: 'Record', short: 'REC', archetype: 'desafiante', power: 0.32, color: '#ef4444', regional: RECORD_REG, fact: 'Slogan "A caminho da liderança" desde 2004; em agosto de 2007 tira do SBT a vice-liderança mensal na Grande SP.' },
    { key: 'sbt', name: 'SBT', short: 'SBT', archetype: 'popular_auditorio', power: 0.36, color: '#f59e0b', regional: SBT_REG, fact: 'Perde a vice no meio da década; grade instável.' },
    { key: 'band', name: 'Bandeirantes', short: 'BAN', archetype: 'jornalistica_esportiva', power: 0.0, color: '#10b981', regional: BAND_REG, fact: 'Mantém o nicho.' },
    { key: 'redetv', name: 'RedeTV!', short: 'RTV', archetype: 'em_crise', power: -0.15, color: '#ec4899', regional: REDETV_REG, fact: 'Grade popular e arrendada.' },
    { key: 'cultura', name: 'TV Cultura / TV Brasil', short: 'CUL', archetype: 'publica_educativa', power: -0.45, color: '#14b8a6', regional: CULTURA_REG, fact: 'TV Brasil surge em 2007.' },
  ],
  '10s': [
    { key: 'globo', name: 'Globo', short: 'GLO', archetype: 'hegemonica', power: 0.82, color: '#3b82f6', regional: GLOBO_REG, fact: 'Líder, mas perdendo TLE para o streaming.' },
    { key: 'record', name: 'Record', short: 'REC', archetype: 'desafiante', power: 0.34, color: '#ef4444', regional: RECORD_REG, fact: 'Vice na maior parte da década, com dramaturgia bíblica e realities.' },
    { key: 'sbt', name: 'SBT', short: 'SBT', archetype: 'popular_auditorio', power: 0.33, color: '#f59e0b', regional: SBT_REG, fact: 'Retoma a vice em 2012 com infantis e novelas de catálogo; alterna com a Record.' },
    { key: 'band', name: 'Bandeirantes', short: 'BAN', archetype: 'jornalistica_esportiva', power: -0.05, color: '#10b981', regional: BAND_REG, fact: 'Nicho estável.' },
    { key: 'redetv', name: 'RedeTV!', short: 'RTV', archetype: 'em_crise', power: -0.3, color: '#ec4899', regional: REDETV_REG, fact: 'Dependente de arrendamentos.' },
    { key: 'cultura', name: 'TV Cultura / TV Brasil', short: 'CUL', archetype: 'publica_educativa', power: -0.5, color: '#14b8a6', regional: CULTURA_REG, fact: 'Missão pública.' },
  ],
  now: [
    { key: 'globo', name: 'Globo', short: 'GLO', archetype: 'hegemonica', power: 0.82, color: '#3b82f6', regional: GLOBO_REG, fact: 'Fechou 2025 com 10,5 pontos de média na Grande SP.' },
    { key: 'record', name: 'Record', short: 'REC', archetype: 'desafiante', power: 0.3, color: '#ef4444', regional: RECORD_REG, fact: 'Vice em 2025, com 3,9 pontos.' },
    { key: 'sbt', name: 'SBT', short: 'SBT', archetype: 'popular_auditorio', power: 0.16, color: '#f59e0b', regional: SBT_REG, fact: '3º lugar em 2025, com 2,9 pontos.' },
    { key: 'band', name: 'Band', short: 'BAN', archetype: 'jornalistica_esportiva', power: -0.22, color: '#10b981', regional: BAND_REG, fact: '1,1 ponto em 2025, queda de 18%.' },
    { key: 'redetv', name: 'RedeTV!', short: 'RTV', archetype: 'em_crise', power: -0.45, color: '#ec4899', regional: REDETV_REG, fact: 'Patamar baixo, grade com arrendamento.' },
    { key: 'cultura', name: 'TV Cultura / TV Brasil', short: 'CUL', archetype: 'publica_educativa', power: -0.62, color: '#14b8a6', regional: CULTURA_REG, fact: 'Cultura fechou 2025 com 0,3 ponto.' },
  ],
};
