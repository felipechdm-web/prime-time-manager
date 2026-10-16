// Gêneros (seção 8.2): encaixe por faixa, perfil de público, fadiga, custo e curva.

import type { BandId, EraId, GenreId, Profile, RatingAge } from '../types.ts';

export type GenreGroup =
  | 'drama'
  | 'humor'
  | 'variedade'
  | 'reality'
  | 'jornalismo'
  | 'esporte'
  | 'filme'
  | 'infantil'
  | 'arrendado'
  | 'documental'
  | 'especial'
  | 'sistema';

export type CurveKind = 'novela' | 'futebol' | 'auditorio' | 'jornal' | 'reality' | 'filme' | 'flat';

export interface GenreDef {
  id: GenreId;
  name: string;
  icon: string;
  color: string;
  group: GenreGroup;
  fit: [number, number, number, number, number, number, number, number]; // madrugada, manhã cedo, manhã, meio-dia, vespertino, pré-nobre, nobre, pós-nobre
  sat?: Partial<Record<BandId, number>>;
  sun?: Partial<Record<BandId, number>>;
  profile: Profile;
  fatiguePerEp: number;
  cost: [number, number]; // R$ 2026 por episódio padrão
  dur: [number, number, number]; // padrão, mínima, máxima (min)
  episodes: [number, number] | null; // programas com fim
  commercial: number;
  rating: RatingAge;
  curve: CurveKind;
  eras?: EraId[];
  marketable: boolean;
  leased?: boolean;
  live?: boolean;
  kids?: boolean;
}

const BAND_ORDER: BandId[] = ['madrugada', 'manha_cedo', 'manha', 'meio_dia', 'vespertino', 'pre_nobre', 'nobre', 'pos_nobre'];

function p(c: number, ja: number, jc: number, aa: number, ac: number, ma: number, mc: number): Profile {
  return { criancas: c, jovem_ab: ja, jovem_cde: jc, adulto_ab: aa, adulto_cde: ac, maduro_ab: ma, maduro_cde: mc };
}

export const GENRES: Record<GenreId, GenreDef> = {
  novela_18h: {
    id: 'novela_18h', name: 'Novela das seis', icon: '🎭', color: '#f472b6', group: 'drama',
    fit: [0.1, 0.1, 0.25, 0.4, 0.6, 0.95, 0.7, 0.35],
    profile: p(0.35, 0.35, 0.5, 0.45, 0.75, 0.65, 0.9),
    fatiguePerEp: 0.12, cost: [250000, 900000], dur: [45, 40, 60], episodes: [120, 180],
    commercial: 65, rating: 'L', curve: 'novela', marketable: true,
  },
  novela_19h: {
    id: 'novela_19h', name: 'Novela das sete', icon: '🎭', color: '#fb7185', group: 'drama',
    fit: [0.1, 0.1, 0.2, 0.35, 0.55, 0.95, 0.8, 0.4],
    profile: p(0.5, 0.6, 0.7, 0.55, 0.75, 0.5, 0.7),
    fatiguePerEp: 0.12, cost: [300000, 1000000], dur: [50, 45, 60], episodes: [140, 190],
    commercial: 70, rating: '10', curve: 'novela', marketable: true,
  },
  novela_21h: {
    id: 'novela_21h', name: 'Novela das nove', icon: '🎭', color: '#e11d48', group: 'drama',
    fit: [0.05, 0.05, 0.15, 0.3, 0.45, 0.75, 1.0, 0.75],
    profile: p(0.2, 0.55, 0.6, 0.8, 0.9, 0.75, 0.85),
    fatiguePerEp: 0.12, cost: [400000, 1600000], dur: [60, 50, 75], episodes: [150, 200],
    commercial: 80, rating: '14', curve: 'novela', marketable: true,
  },
  novela_juvenil: {
    id: 'novela_juvenil', name: 'Novela juvenil', icon: '🎒', color: '#f9a8d4', group: 'drama',
    fit: [0.1, 0.1, 0.3, 0.45, 0.85, 0.75, 0.4, 0.25],
    profile: p(0.55, 0.85, 0.9, 0.3, 0.35, 0.2, 0.3),
    fatiguePerEp: 0.15, cost: [120000, 350000], dur: [45, 30, 60], episodes: [150, 250],
    commercial: 55, rating: 'L', curve: 'novela', eras: ['90s', '00s', '10s', 'now'], marketable: true,
  },
  novela_biblica: {
    id: 'novela_biblica', name: 'Novela bíblica', icon: '📜', color: '#d97706', group: 'drama',
    fit: [0.05, 0.05, 0.2, 0.3, 0.4, 0.75, 0.85, 0.5],
    profile: p(0.3, 0.25, 0.6, 0.3, 0.75, 0.5, 0.95),
    fatiguePerEp: 0.14, cost: [300000, 1000000], dur: [60, 45, 75], episodes: [80, 160],
    commercial: 55, rating: '12', curve: 'novela', eras: ['10s', 'now'], marketable: true,
  },
  serie_nacional: {
    id: 'serie_nacional', name: 'Série / minissérie', icon: '🎬', color: '#a78bfa', group: 'drama',
    fit: [0.1, 0.05, 0.1, 0.15, 0.25, 0.4, 0.85, 1.0],
    profile: p(0.1, 0.7, 0.5, 0.95, 0.7, 0.75, 0.55),
    fatiguePerEp: 0.3, cost: [400000, 1500000], dur: [45, 30, 60], episodes: [8, 40],
    commercial: 60, rating: '14', curve: 'flat', marketable: true,
  },
  humoristico: {
    id: 'humoristico', name: 'Humorístico', icon: '😂', color: '#facc15', group: 'humor',
    fit: [0.15, 0.1, 0.2, 0.3, 0.4, 0.6, 0.9, 0.95], sat: { nobre: 1.0, pos_nobre: 1.0 },
    profile: p(0.55, 0.75, 0.8, 0.65, 0.85, 0.5, 0.7),
    fatiguePerEp: 0.8, cost: [150000, 600000], dur: [45, 30, 60], episodes: null,
    commercial: 65, rating: '12', curve: 'flat', marketable: true,
  },
  auditorio: {
    id: 'auditorio', name: 'Auditório / variedades', icon: '🎤', color: '#fb923c', group: 'variedade',
    fit: [0.1, 0.2, 0.45, 0.5, 0.6, 0.55, 0.55, 0.45],
    sat: { vespertino: 0.9, pre_nobre: 0.85, nobre: 0.75 },
    sun: { meio_dia: 0.85, vespertino: 1.0, pre_nobre: 0.95, nobre: 0.85 },
    profile: p(0.55, 0.4, 0.85, 0.4, 0.85, 0.55, 0.9),
    fatiguePerEp: 0.5, cost: [200000, 900000], dur: [120, 60, 300], episodes: null,
    commercial: 75, rating: 'L', curve: 'auditorio', marketable: true,
  },
  game_show: {
    id: 'game_show', name: 'Game show', icon: '🎲', color: '#22d3ee', group: 'variedade',
    fit: [0.1, 0.1, 0.35, 0.45, 0.55, 0.75, 0.75, 0.55], sat: { nobre: 0.85 }, sun: { pre_nobre: 0.85, nobre: 0.8 },
    profile: p(0.45, 0.6, 0.75, 0.6, 0.8, 0.65, 0.8),
    fatiguePerEp: 0.7, cost: [100000, 400000], dur: [60, 30, 90], episodes: null,
    commercial: 75, rating: 'L', curve: 'auditorio', marketable: true,
  },
  reality: {
    id: 'reality', name: 'Reality show', icon: '🏠', color: '#e879f9', group: 'reality',
    fit: [0.15, 0.05, 0.15, 0.2, 0.3, 0.5, 0.85, 1.0],
    profile: p(0.25, 0.95, 0.9, 0.75, 0.85, 0.35, 0.55),
    fatiguePerEp: 0.25, cost: [300000, 1200000], dur: [60, 30, 90], episodes: [60, 100],
    commercial: 85, rating: '14', curve: 'reality', eras: ['00s', '10s', 'now'], marketable: true,
  },
  talk_show: {
    id: 'talk_show', name: 'Talk show', icon: '🛋️', color: '#818cf8', group: 'variedade',
    fit: [0.35, 0.1, 0.25, 0.25, 0.25, 0.3, 0.45, 0.95],
    profile: p(0.05, 0.6, 0.45, 0.85, 0.6, 0.7, 0.5),
    fatiguePerEp: 0.2, cost: [80000, 300000], dur: [60, 45, 90], episodes: null,
    commercial: 55, rating: '12', curve: 'flat', marketable: true,
  },
  telejornal: {
    id: 'telejornal', name: 'Telejornal', icon: '📰', color: '#60a5fa', group: 'jornalismo',
    fit: [0.3, 0.85, 0.45, 0.85, 0.4, 0.85, 0.9, 0.6],
    profile: p(0.05, 0.35, 0.4, 0.85, 0.8, 0.95, 0.9),
    fatiguePerEp: 0, cost: [60000, 500000], dur: [30, 15, 60], episodes: null,
    commercial: 70, rating: 'L', curve: 'jornal', marketable: false,
  },
  revista_eletronica: {
    id: 'revista_eletronica', name: 'Revista eletrônica', icon: '🗞️', color: '#38bdf8', group: 'jornalismo',
    fit: [0.2, 0.2, 0.3, 0.3, 0.4, 0.6, 0.75, 0.75], sun: { nobre: 1.0, pos_nobre: 0.9 },
    profile: p(0.1, 0.5, 0.45, 0.85, 0.8, 0.85, 0.8),
    fatiguePerEp: 0.3, cost: [200000, 600000], dur: [120, 60, 150], episodes: null,
    commercial: 75, rating: '12', curve: 'flat', marketable: true,
  },
  policial: {
    id: 'policial', name: 'Jornalismo policial', icon: '🚨', color: '#94a3b8', group: 'jornalismo',
    fit: [0.2, 0.15, 0.35, 0.7, 0.65, 0.8, 0.5, 0.4],
    profile: p(0.05, 0.3, 0.75, 0.4, 0.95, 0.4, 0.9),
    fatiguePerEp: 0.2, cost: [40000, 150000], dur: [120, 60, 180], episodes: null,
    commercial: 45, rating: '10', curve: 'flat', marketable: true,
  },
  futebol: {
    id: 'futebol', name: 'Futebol ao vivo', icon: '⚽', color: '#22c55e', group: 'esporte',
    fit: [0.1, 0.05, 0.1, 0.3, 0.6, 0.6, 0.85, 0.9], sun: { vespertino: 1.0, meio_dia: 0.8 },
    profile: p(0.25, 0.6, 0.8, 0.75, 0.95, 0.6, 0.7),
    fatiguePerEp: 0, cost: [500000, 3000000], dur: [120, 120, 150], episodes: null,
    commercial: 90, rating: 'L', curve: 'futebol', marketable: true, live: true,
  },
  mesa_redonda: {
    id: 'mesa_redonda', name: 'Mesa-redonda esportiva', icon: '🏟️', color: '#84cc16', group: 'esporte',
    fit: [0.3, 0.1, 0.2, 0.4, 0.2, 0.2, 0.3, 0.7], sun: { pos_nobre: 0.9 },
    profile: p(0.05, 0.45, 0.6, 0.55, 0.75, 0.5, 0.6),
    fatiguePerEp: 0.1, cost: [30000, 120000], dur: [90, 60, 120], episodes: null,
    commercial: 55, rating: 'L', curve: 'flat', marketable: true,
  },
  filme: {
    id: 'filme', name: 'Sessão de filmes', icon: '🎞️', color: '#fbbf24', group: 'filme',
    fit: [0.6, 0.2, 0.35, 0.35, 0.75, 0.55, 0.75, 0.8],
    profile: p(0.5, 0.75, 0.75, 0.7, 0.75, 0.55, 0.6),
    fatiguePerEp: 0.4, cost: [40000, 600000], dur: [120, 90, 150], episodes: null,
    commercial: 60, rating: '12', curve: 'filme', marketable: true,
  },
  serie_estrangeira: {
    id: 'serie_estrangeira', name: 'Série estrangeira', icon: '📺', color: '#c084fc', group: 'filme',
    fit: [0.5, 0.2, 0.35, 0.3, 0.55, 0.4, 0.5, 0.75],
    profile: p(0.3, 0.85, 0.6, 0.7, 0.5, 0.35, 0.3),
    fatiguePerEp: 0.6, cost: [20000, 150000], dur: [45, 30, 60], episodes: [20, 100],
    commercial: 50, rating: '12', curve: 'flat', marketable: true,
  },
  infantil: {
    id: 'infantil', name: 'Infantil / desenhos', icon: '🧸', color: '#4ade80', group: 'infantil',
    fit: [0.05, 0.6, 1.0, 0.6, 0.85, 0.25, 0.05, 0.02], sat: { manha_cedo: 0.85, manha: 1.0 }, sun: { manha_cedo: 0.85, manha: 1.0 },
    profile: p(1.0, 0.25, 0.35, 0.1, 0.2, 0.05, 0.1),
    fatiguePerEp: 0.1, cost: [15000, 120000], dur: [120, 60, 240], episodes: null,
    commercial: 55, rating: 'L', curve: 'flat', marketable: true, kids: true,
  },
  religioso: {
    id: 'religioso', name: 'Religioso (arrendado)', icon: '⛪', color: '#a8a29e', group: 'arrendado',
    fit: [0.6, 0.35, 0.3, 0.15, 0.15, 0.1, 0.1, 0.25],
    profile: p(0.05, 0.1, 0.25, 0.1, 0.35, 0.3, 0.7),
    fatiguePerEp: 0, cost: [0, 0], dur: [60, 30, 240], episodes: null,
    commercial: 0, rating: 'L', curve: 'flat', marketable: false, leased: true,
  },
  televendas: {
    id: 'televendas', name: 'Televendas (arrendado)', icon: '🛒', color: '#78716c', group: 'arrendado',
    fit: [0.6, 0.35, 0.35, 0.15, 0.2, 0.05, 0.05, 0.2],
    profile: p(0.02, 0.05, 0.2, 0.15, 0.3, 0.3, 0.5),
    fatiguePerEp: 0, cost: [0, 0], dur: [60, 30, 240], episodes: null,
    commercial: 0, rating: 'L', curve: 'flat', marketable: false, leased: true,
  },
  documentario: {
    id: 'documentario', name: 'Documentário', icon: '🌎', color: '#2dd4bf', group: 'documental',
    fit: [0.4, 0.15, 0.2, 0.2, 0.3, 0.3, 0.4, 0.7],
    profile: p(0.2, 0.6, 0.25, 0.75, 0.3, 0.75, 0.3),
    fatiguePerEp: 0.3, cost: [20000, 150000], dur: [60, 30, 90], episodes: [6, 26],
    commercial: 40, rating: 'L', curve: 'flat', marketable: true,
  },
  feminino: {
    id: 'feminino', name: 'Feminino / culinária', icon: '🍳', color: '#f0abfc', group: 'variedade',
    fit: [0.05, 0.5, 1.0, 0.6, 0.55, 0.2, 0.05, 0.05],
    profile: p(0.1, 0.25, 0.4, 0.45, 0.8, 0.75, 0.95),
    fatiguePerEp: 0.15, cost: [40000, 200000], dur: [90, 60, 180], episodes: null,
    commercial: 70, rating: 'L', curve: 'flat', marketable: true,
  },
  musical: {
    id: 'musical', name: 'Musical', icon: '🎵', color: '#f97316', group: 'variedade',
    fit: [0.35, 0.1, 0.25, 0.3, 0.4, 0.45, 0.6, 0.85], sat: { nobre: 0.85 },
    profile: p(0.3, 0.9, 0.8, 0.6, 0.6, 0.4, 0.5),
    fatiguePerEp: 0.5, cost: [80000, 400000], dur: [60, 45, 120], episodes: null,
    commercial: 60, rating: 'L', curve: 'auditorio', marketable: true,
  },
  cobertura_especial: {
    id: 'cobertura_especial', name: 'Cobertura especial', icon: '🎆', color: '#fde047', group: 'especial',
    fit: [0.5, 0.5, 0.5, 0.6, 0.6, 0.8, 1.0, 0.9],
    profile: p(0.5, 0.6, 0.7, 0.75, 0.8, 0.8, 0.85),
    fatiguePerEp: 0, cost: [300000, 2000000], dur: [180, 60, 360], episodes: null,
    commercial: 85, rating: 'L', curve: 'auditorio', marketable: false, live: true,
  },
  talent_show: {
    id: 'talent_show', name: 'Talent show', icon: '⭐', color: '#fcd34d', group: 'variedade',
    fit: [0.1, 0.05, 0.2, 0.3, 0.45, 0.6, 0.85, 0.8], sat: { nobre: 0.95 }, sun: { nobre: 0.95 },
    profile: p(0.45, 0.85, 0.8, 0.75, 0.8, 0.6, 0.7),
    fatiguePerEp: 0.35, cost: [300000, 1000000], dur: [90, 60, 150], episodes: [12, 20],
    commercial: 80, rating: 'L', curve: 'reality', eras: ['00s', '10s', 'now'], marketable: true,
  },
  janela_local: {
    id: 'janela_local', name: 'Janela local (afiliadas)', icon: '📍', color: '#475569', group: 'sistema',
    fit: [0.7, 0.8, 0.7, 0.85, 0.7, 0.85, 0.8, 0.7],
    profile: p(0.1, 0.3, 0.45, 0.7, 0.8, 0.9, 0.95),
    fatiguePerEp: 0, cost: [0, 0], dur: [30, 15, 60], episodes: null,
    commercial: 0, rating: 'L', curve: 'jornal', marketable: false,
  },
  hgpe: {
    id: 'hgpe', name: 'Horário eleitoral (HGPE)', icon: '🗳️', color: '#334155', group: 'sistema',
    fit: [0, 0, 0, 0, 0, 0, 0, 0],
    profile: p(0.05, 0.1, 0.1, 0.25, 0.2, 0.35, 0.3),
    fatiguePerEp: 0, cost: [0, 0], dur: [45, 15, 45], episodes: null,
    commercial: 0, rating: 'L', curve: 'flat', marketable: false,
  },
  tapa_buraco: {
    id: 'tapa_buraco', name: 'Tapa-buraco', icon: '🧱', color: '#52525b', group: 'sistema',
    fit: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    profile: p(0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3),
    fatiguePerEp: 0, cost: [8000, 8000], dur: [60, 15, 240], episodes: null,
    commercial: 10, rating: 'L', curve: 'flat', marketable: false,
  },
};

export const GENRE_LIST: GenreDef[] = Object.values(GENRES);

export const PLAYABLE_GENRES: GenreId[] = GENRE_LIST.filter((g) => g.group !== 'sistema').map((g) => g.id);

export function genreAvailable(g: GenreId, era: EraId): boolean {
  const def = GENRES[g];
  return !def.eras || def.eras.includes(era);
}

export function genreFit(g: GenreId, band: BandId, dayType: 'weekday' | 'saturday' | 'sunday'): number {
  const def = GENRES[g];
  if (dayType === 'saturday' && def.sat && def.sat[band] !== undefined) return def.sat[band] as number;
  if (dayType === 'sunday' && def.sun && def.sun[band] !== undefined) return def.sun[band] as number;
  const base = def.fit[BAND_ORDER.indexOf(band)];
  // fins de semana: tardes valorizam variedades e esporte, telejornais perdem força
  if (dayType !== 'weekday') {
    if (def.group === 'jornalismo' && def.id === 'telejornal') return base * 0.8;
    if (def.group === 'drama' && def.id.startsWith('novela')) return base * 0.75;
  }
  return base;
}

export function isFinite(g: GenreId): boolean {
  return GENRES[g].episodes !== null;
}

export function isNovela(g: GenreId): boolean {
  return g.startsWith('novela');
}
