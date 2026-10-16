// Praças medidas (seção 9.9), segmentos de público (9.2) e curvas de TV ligada (9.1).

import type { DayType, SegmentId } from '../types.ts';

export interface MarketDef {
  code: string;
  name: string;
  hhPerPoint: number; // domicílios por ponto (2026)
  indPerPoint: number;
  abIndex: number; // peso relativo das classes AB
  lunchBoost: number; // almoço mais forte em praças menores
  carnival: boolean; // carnaval local forte (cobertura regional)
}

export const MARKETS: MarketDef[] = [
  { code: 'SP', name: 'Grande São Paulo', hhPerPoint: 78781, indPerPoint: 199633, abIndex: 1.1, lunchBoost: 1.0, carnival: false },
  { code: 'RJ', name: 'Grande Rio de Janeiro', hhPerPoint: 49778, indPerPoint: 122054, abIndex: 1.05, lunchBoost: 1.0, carnival: true },
  { code: 'BH', name: 'Grande Belo Horizonte', hhPerPoint: 22184, indPerPoint: 55330, abIndex: 1.0, lunchBoost: 1.05, carnival: false },
  { code: 'POA', name: 'Grande Porto Alegre', hhPerPoint: 15961, indPerPoint: 37514, abIndex: 1.1, lunchBoost: 1.05, carnival: false },
  { code: 'REC', name: 'Grande Recife', hhPerPoint: 14118, indPerPoint: 35792, abIndex: 0.85, lunchBoost: 1.1, carnival: true },
  { code: 'SSA', name: 'Grande Salvador', hhPerPoint: 13794, indPerPoint: 32968, abIndex: 0.85, lunchBoost: 1.1, carnival: true },
  { code: 'FOR', name: 'Grande Fortaleza', hhPerPoint: 13723, indPerPoint: 35677, abIndex: 0.85, lunchBoost: 1.1, carnival: false },
  { code: 'CWB', name: 'Grande Curitiba', hhPerPoint: 12511, indPerPoint: 32040, abIndex: 1.1, lunchBoost: 1.05, carnival: false },
  { code: 'GYN', name: 'Grande Goiânia', hhPerPoint: 10100, indPerPoint: 25019, abIndex: 0.95, lunchBoost: 1.12, carnival: false },
  { code: 'DF', name: 'Distrito Federal', hhPerPoint: 10034, indPerPoint: 26506, abIndex: 1.3, lunchBoost: 1.05, carnival: false },
  { code: 'CPS', name: 'Grande Campinas', hhPerPoint: 8761, indPerPoint: 22272, abIndex: 1.15, lunchBoost: 1.08, carnival: false },
  { code: 'BEL', name: 'Grande Belém', hhPerPoint: 7765, indPerPoint: 22460, abIndex: 0.8, lunchBoost: 1.15, carnival: false },
  { code: 'VIX', name: 'Grande Vitória', hhPerPoint: 7310, indPerPoint: 18462, abIndex: 1.0, lunchBoost: 1.1, carnival: false },
  { code: 'MAO', name: 'Manaus', hhPerPoint: 7168, indPerPoint: 20596, abIndex: 0.8, lunchBoost: 1.15, carnival: false },
  { code: 'FLN', name: 'Grande Florianópolis', hhPerPoint: 5672, indPerPoint: 13641, abIndex: 1.15, lunchBoost: 1.08, carnival: false },
];

export const PNT_HH_PER_POINT = 277670;
export const PNT_IND_PER_POINT = 699962;

export const MARKET_WEIGHTS: number[] = (() => {
  const total = MARKETS.reduce((s, m) => s + m.hhPerPoint, 0);
  return MARKETS.map((m) => m.hhPerPoint / total);
})();

export const MARKET_INDEX: Record<string, number> = Object.fromEntries(MARKETS.map((m, i) => [m.code, i]));

// ===== Segmentos (seção 9.2) =====
export const SEGMENTS: SegmentId[] = ['criancas', 'jovem_ab', 'jovem_cde', 'adulto_ab', 'adulto_cde', 'maduro_ab', 'maduro_cde'];

export const SEGMENT_LABELS: Record<SegmentId, string> = {
  criancas: 'Crianças 4-11',
  jovem_ab: 'Jovens 12-24 AB',
  jovem_cde: 'Jovens 12-24 CDE',
  adulto_ab: 'Adultos 25-49 AB',
  adulto_cde: 'Adultos 25-49 CDE',
  maduro_ab: 'Maduros 50+ AB',
  maduro_cde: 'Maduros 50+ CDE',
};

const SEGMENT_BASE: Record<SegmentId, number> = {
  criancas: 0.13,
  jovem_ab: 0.05,
  jovem_cde: 0.12,
  adulto_ab: 0.09,
  adulto_cde: 0.21,
  maduro_ab: 0.11,
  maduro_cde: 0.29,
};

// valor comercial relativo de cada segmento (Q do público, seção 10.1)
export const SEGMENT_AD_VALUE: Record<SegmentId, number> = {
  criancas: 0.75,
  jovem_ab: 1.25,
  jovem_cde: 0.85,
  adulto_ab: 1.45,
  adulto_cde: 1.0,
  maduro_ab: 1.1,
  maduro_cde: 0.72,
};

function segModifier(seg: SegmentId, hour: number, dt: DayType, kidsTV: number): number {
  const weekend = dt !== 'weekday';
  switch (seg) {
    case 'criancas': {
      if (hour >= 7 && hour < 12) return 1 + (weekend ? 1.6 : 1.2) * kidsTV;
      if (hour >= 14 && hour < 18) return 1 + 0.7 * kidsTV;
      if (hour >= 18 && hour < 21) return 0.9;
      if (hour >= 21 && hour < 23) return 0.35;
      if (hour >= 23 || hour < 6) return 0.06;
      return 0.6;
    }
    case 'jovem_ab':
    case 'jovem_cde': {
      if (hour >= 6 && hour < 12) return weekend ? 0.8 : 0.55;
      if (hour >= 14 && hour < 18) return 1.25;
      if (hour >= 22 || hour < 2) return 1.35;
      if (hour >= 2 && hour < 6) return 0.9;
      return 1.0;
    }
    case 'adulto_ab':
    case 'adulto_cde': {
      if (hour >= 6 && hour < 9) return 1.2;
      if (hour >= 9 && hour < 17) return weekend ? 1.15 : 0.7;
      if (hour >= 19) return 1.25;
      if (hour < 2) return 1.15;
      return 0.9;
    }
    case 'maduro_ab':
    case 'maduro_cde': {
      if (hour >= 9 && hour < 18) return 1.25;
      if (hour >= 23 || hour < 6) return 0.7;
      return 1.0;
    }
  }
}

// pesos por segmento para um slot (normalizados para somar 1)
export function segmentWeights(clockHour: number, dt: DayType, kidsTV: number, abIndex: number): number[] {
  const w: number[] = [];
  let total = 0;
  for (const s of SEGMENTS) {
    let v = SEGMENT_BASE[s] * segModifier(s, clockHour, dt, kidsTV);
    if (s.endsWith('_ab')) v *= abIndex;
    w.push(v);
    total += v;
  }
  return w.map((v) => v / total);
}

// ===== Curvas de TV ligada por hora do relógio (relativas ao pico) =====
const HOURLY: Record<DayType, number[]> = {
  weekday: [0.4, 0.24, 0.14, 0.1, 0.09, 0.11, 0.2, 0.3, 0.33, 0.32, 0.33, 0.4, 0.58, 0.56, 0.45, 0.44, 0.47, 0.55, 0.68, 0.84, 0.96, 1.0, 0.88, 0.62],
  saturday: [0.48, 0.3, 0.18, 0.12, 0.1, 0.1, 0.15, 0.22, 0.28, 0.33, 0.38, 0.43, 0.55, 0.56, 0.55, 0.56, 0.58, 0.62, 0.68, 0.78, 0.86, 0.88, 0.82, 0.66],
  sunday: [0.42, 0.27, 0.17, 0.11, 0.09, 0.09, 0.13, 0.19, 0.25, 0.31, 0.38, 0.46, 0.58, 0.62, 0.66, 0.7, 0.72, 0.74, 0.76, 0.84, 0.92, 0.94, 0.84, 0.6],
};

// vetor de 96 valores por tipo de dia (slot 0 = 06h00), normalizado para que
// a média do nobre (20h-22h30) num dia útil seja 1,0
export const TLE_CURVE: Record<DayType, number[]> = (() => {
  const raw: Record<DayType, number[]> = { weekday: [], saturday: [], sunday: [] };
  for (const dt of ['weekday', 'saturday', 'sunday'] as DayType[]) {
    for (let s = 0; s < 96; s++) {
      const minutes = (360 + s * 15 + 7.5) % 1440;
      const h = Math.floor(minutes / 60);
      const frac = (minutes % 60) / 60;
      const a = HOURLY[dt][h];
      const b = HOURLY[dt][(h + 1) % 24];
      // interpolação centrada na meia hora
      const t = frac - 0.5;
      const v = t < 0 ? a + (a - HOURLY[dt][(h + 23) % 24]) * t * 0.5 : a + (b - a) * t * 0.5;
      raw[dt].push(Math.max(0.05, v));
    }
  }
  let primeAvg = 0;
  for (let s = 56; s < 66; s++) primeAvg += raw.weekday[s];
  primeAvg /= 10;
  for (const dt of ['weekday', 'saturday', 'sunday'] as DayType[]) {
    raw[dt] = raw[dt].map((v) => v / primeAvg);
  }
  return raw;
})();
