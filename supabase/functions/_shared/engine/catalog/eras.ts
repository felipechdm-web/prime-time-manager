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

// v2.1 (17/10/2026): o jogo tem só a era atual. O motor continua lendo os parâmetros por era.
export const ERAS: Record<EraId, EraDef> = {
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

export const ERA_ORDER: EraId[] = ['now'];

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
  ratingRule('now', 'warn', 'O horário é recomendação; descumprir gera pressão pública e regulatória, não multa automática.'),
  {
    era: 'now', key: 'ad_cap', severity: 'block', config: { defaultMinutes: 12, maxMinutes: 15 },
    text: 'Publicidade comercial limitada a 25% do tempo; o jogo usa 12 min/hora como padrão e permite até 15.',
  },
  {
    era: 'now', key: 'hgpe', severity: 'block', config: { blocks: ['13:00', '20:30'], minutesBefore2016: 45, minutesFrom2016: 15, days: [0, 1, 2, 3, 4, 5] },
    text: 'Em anos de eleição, o Horário Gratuito de Propaganda Eleitoral ocupa faixas fixas de segunda a sábado.',
  },
  { era: 'now', key: 'alcohol_ads', severity: 'info', config: { strongAfter: '21:00' }, text: 'Comerciais de bebidas mais fortes só em horário noturno; cervejas livres.' },
  { era: 'now', key: 'tobacco_ads', severity: 'block', config: {}, text: 'Proibido anunciar tabaco.' },
  { era: 'now', key: 'kids_ads', severity: 'warn', config: { revenueMult: 0.55 }, text: 'Restrições à publicidade infantil reduzem a receita da faixa infantil.' },
  {
    era: 'now', key: 'national_quota', severity: 'warn', config: { hoursPerWeek: 3.5, fromYear: 2011, payOnly: true },
    text: 'Canais pagos de espaço qualificado devem exibir 3h30 semanais de conteúdo nacional no horário nobre.',
  },
  { era: 'now', key: 'affiliates', severity: 'block', config: { windows: ['12:00', '19:00'] }, text: 'No modo rede, as janelas locais das afiliadas são obrigatórias e não programáveis.' },
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
const REDETV_REG = { SP: 1.12, RJ: 1.05, BH: 0.92, POA: 0.9, REC: 0.95, SSA: 0.92, FOR: 1.0, CWB: 0.9, GYN: 0.9, DF: 0.95, CPS: 1.05, BEL: 0.9, VIX: 0.9, MAO: 0.9, FLN: 0.9 };
const CULTURA_REG = { SP: 1.35, RJ: 0.75, BH: 0.8, POA: 0.8, REC: 0.75, SSA: 0.75, FOR: 0.75, CWB: 0.85, GYN: 0.75, DF: 1.1, CPS: 1.15, BEL: 0.7, VIX: 0.75, MAO: 0.7, FLN: 0.8 };

export const REAL_STATIONS: Record<EraId, RealStationDef[]> = {
  now: [
    { key: 'globo', name: 'Globo', short: 'GLO', archetype: 'hegemonica', power: 0.82, color: '#3b82f6', regional: GLOBO_REG, fact: 'Fechou 2025 com 10,5 pontos de média na Grande SP.' },
    { key: 'record', name: 'Record', short: 'REC', archetype: 'desafiante', power: 0.3, color: '#ef4444', regional: RECORD_REG, fact: 'Vice em 2025, com 3,9 pontos.' },
    { key: 'sbt', name: 'SBT', short: 'SBT', archetype: 'popular_auditorio', power: 0.16, color: '#f59e0b', regional: SBT_REG, fact: '3º lugar em 2025, com 2,9 pontos.' },
    { key: 'band', name: 'Band', short: 'BAN', archetype: 'jornalistica_esportiva', power: -0.22, color: '#10b981', regional: BAND_REG, fact: '1,1 ponto em 2025, queda de 18%.' },
    { key: 'redetv', name: 'RedeTV!', short: 'RTV', archetype: 'em_crise', power: -0.45, color: '#ec4899', regional: REDETV_REG, fact: 'Patamar baixo, grade com arrendamento.' },
    { key: 'cultura', name: 'TV Cultura / TV Brasil', short: 'CUL', archetype: 'publica_educativa', power: -0.62, color: '#14b8a6', regional: CULTURA_REG, fact: 'Cultura fechou 2025 com 0,3 ponto.' },
  ],
};
