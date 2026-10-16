// Calendário, slots de 15 minutos e faixas horárias.
// O "dia de TV" vai das 06h00 às 05h45 do dia seguinte: slot 0 = 06h00, slot 95 = 05h45.

import type { BandId, DayType } from './types.ts';

export const SLOTS_PER_DAY = 96;
export const DAYS = 7;

export const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DAY_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const BANDS: { id: BandId; name: string; from: number; to: number; weight: number }[] = [
  // from/to em minutos do relógio (to exclusivo); madrugada tratada à parte
  { id: 'manha_cedo', name: 'Manhã cedo', from: 360, to: 540, weight: 0.5 },
  { id: 'manha', name: 'Manhã', from: 540, to: 720, weight: 0.6 },
  { id: 'meio_dia', name: 'Meio-dia', from: 720, to: 840, weight: 0.8 },
  { id: 'vespertino', name: 'Vespertino', from: 840, to: 1080, weight: 0.6 },
  { id: 'pre_nobre', name: 'Pré-nobre', from: 1080, to: 1200, weight: 1.2 },
  { id: 'nobre', name: 'Nobre', from: 1200, to: 1350, weight: 2.0 },
  { id: 'pos_nobre', name: 'Pós-nobre', from: 1350, to: 1440, weight: 1.0 },
  { id: 'madrugada', name: 'Madrugada', from: 0, to: 360, weight: 0.1 },
];

export const BAND_BY_ID: Record<BandId, (typeof BANDS)[number]> = Object.fromEntries(
  BANDS.map((b) => [b.id, b]),
) as Record<BandId, (typeof BANDS)[number]>;

export const PRIME_BANDS: BandId[] = ['pre_nobre', 'nobre', 'pos_nobre'];

export function slotClockMinutes(slot: number): number {
  return (360 + slot * 15) % 1440;
}

export function slotLabel(slot: number): string {
  const m = slotClockMinutes(slot);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}h${String(mm).padStart(2, '0')}`;
}

export function clockToSlot(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  let minutes = h * 60 + (m || 0);
  minutes -= 360;
  if (minutes < 0) minutes += 1440;
  return Math.floor(minutes / 15);
}

const BAND_OF_SLOT: BandId[] = (() => {
  const arr: BandId[] = [];
  for (let s = 0; s < SLOTS_PER_DAY; s++) {
    const m = slotClockMinutes(s);
    let band: BandId = 'madrugada';
    for (const b of BANDS) {
      if (m >= b.from && m < b.to) {
        band = b.id;
        break;
      }
    }
    arr.push(band);
  }
  return arr;
})();

export function bandOfSlot(slot: number): BandId {
  return BAND_OF_SLOT[slot];
}

export function isPrimeSlot(slot: number): boolean {
  // 18h-0h
  return slot >= 48 && slot < 72;
}

export function dayType(day: number): DayType {
  return day === 5 ? 'saturday' : day === 6 ? 'sunday' : 'weekday';
}

// ===== Datas =====
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function firstMondayOfYear(year: number): string {
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return toIso(d);
}

export function yearOf(iso: string): number {
  return parseInt(iso.slice(0, 4), 10);
}

export function monthOf(iso: string): number {
  return parseInt(iso.slice(5, 7), 10);
}

export function formatDate(iso: string): string {
  const d = parseIso(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export function formatDateLong(iso: string): string {
  const d = parseIso(iso);
  return `${d.getUTCDate()} de ${MONTH_NAMES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function weekLabel(mondayIso: string): string {
  return `${formatDate(mondayIso)} a ${formatDate(addDays(mondayIso, 6))}`;
}

function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

export function carnivalTuesday(year: number): string {
  return addDays(easter(year), -47);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === n) return toIso(d);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function mothersDay(year: number): string {
  return nthWeekdayOfMonth(year, 5, 0, 2);
}

// ===== Copa do Mundo =====
interface CopaDef {
  start: string;
  end: string;
  hours: string[]; // horários de Brasília dos jogos do Brasil
  realStage: number; // até onde o Brasil foi na vida real: 3=oitavas,4=quartas,5=semi,6=final(perdeu),7=campeão
}

export const COPAS: Record<number, CopaDef> = {
  1986: { start: '1986-05-31', end: '1986-06-29', hours: ['16:00', '12:00'], realStage: 4 },
  1990: { start: '1990-06-08', end: '1990-07-08', hours: ['16:00', '12:00'], realStage: 3 },
  1994: { start: '1994-06-17', end: '1994-07-17', hours: ['17:00', '20:30'], realStage: 7 },
  1998: { start: '1998-06-10', end: '1998-07-12', hours: ['16:00', '12:30'], realStage: 6 },
  2002: { start: '2002-05-31', end: '2002-06-30', hours: ['06:00', '08:30'], realStage: 7 },
  2006: { start: '2006-06-09', end: '2006-07-09', hours: ['16:00', '11:00'], realStage: 4 },
  2010: { start: '2010-06-11', end: '2010-07-11', hours: ['15:30', '11:00'], realStage: 4 },
  2014: { start: '2014-06-12', end: '2014-07-13', hours: ['17:00', '16:00'], realStage: 5 },
  2018: { start: '2018-06-14', end: '2018-07-15', hours: ['15:00', '11:00'], realStage: 4 },
  2022: { start: '2022-11-20', end: '2022-12-18', hours: ['16:00', '12:00'], realStage: 4 },
  2026: { start: '2026-06-11', end: '2026-07-19', hours: ['19:00', '16:00'], realStage: 0 },
  2030: { start: '2030-06-13', end: '2030-07-21', hours: ['16:00', '13:00'], realStage: 0 },
  2034: { start: '2034-06-15', end: '2034-07-23', hours: ['13:00', '10:00'], realStage: 0 },
};

export interface CopaMatch {
  date: string;
  slot: number;
  stage: number; // 1-3 grupos, 4 oitavas, 5 quartas, 6 semi, 7 final
  label: string;
}

const STAGE_LABELS = ['', '1º jogo da fase de grupos', '2º jogo da fase de grupos', '3º jogo da fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];

export function copaMatches(year: number, maxStage: number): CopaMatch[] {
  const c = COPAS[year];
  if (!c) return [];
  const offsets = [0, 4, 9, 14, 18, 23, 27];
  const out: CopaMatch[] = [];
  for (let st = 1; st <= 7; st++) {
    if (st > maxStage) break;
    let date = addDays(c.start, offsets[st - 1]);
    if (st === 7) date = c.end;
    const hour = c.hours[(st + year) % c.hours.length];
    out.push({ date, slot: clockToSlot(hour), stage: st, label: STAGE_LABELS[st] });
  }
  return out;
}

export function isCopaYear(year: number): boolean {
  return !!COPAS[year];
}

// ===== Eleições =====
export function isElectionYear(year: number): boolean {
  return year >= 1986 && (year % 2 === 0 || year === 1989);
}

export function isGeneralElection(year: number): boolean {
  return year === 1989 || (year >= 1994 && (year - 1994) % 4 === 0) || year === 1986 || year === 1990;
}

export function electionDate(year: number): string {
  if (year === 1989) return '1989-11-15';
  if (year < 1994) return nthWeekdayOfMonth(year, 11, 0, 3);
  return nthWeekdayOfMonth(year, 10, 0, 1);
}

// período de HGPE: ~45 dias antes (35 a partir de 2016)
export function hgpeWindow(year: number): { from: string; to: string } | null {
  if (!isElectionYear(year)) return null;
  const el = electionDate(year);
  const days = year >= 2016 ? 35 : 45;
  return { from: addDays(el, -days), to: addDays(el, -3) };
}

export function inHgpe(iso: string): boolean {
  const w = hgpeWindow(yearOf(iso));
  if (!w) return false;
  return iso >= w.from && iso <= w.to;
}

// ===== Sazonalidade =====
export const TLE_SEASON = [0.92, 0.95, 1.0, 1.0, 1.02, 1.04, 0.95, 1.02, 1.0, 1.0, 0.98, 0.95];
export const AD_SEASON = [0.78, 0.85, 0.98, 1.0, 1.08, 1.0, 0.95, 1.0, 1.0, 1.03, 1.06, 1.15];

export function inPandemic(iso: string): boolean {
  return iso >= '2020-03-16' && iso <= '2020-08-31';
}

export interface DayCalendar {
  date: string;
  tleMult: number;
  adMult: number;
  tags: string[];
  primeMult: number; // multiplicador extra só para o horário nobre
}

export function dayCalendar(iso: string): DayCalendar {
  const year = yearOf(iso);
  const month = monthOf(iso);
  let tle = TLE_SEASON[month - 1];
  let ad = AD_SEASON[month - 1];
  if (month === 11 && year >= 2010) ad *= 1.04; // Black Friday
  const tags: string[] = [];
  let prime = 1;
  const carn = carnivalTuesday(year);
  if (iso >= addDays(carn, -3) && iso <= carn) {
    tle *= 0.86;
    tags.push('carnaval');
  }
  if (iso === addDays(carn, 1)) tags.push('quarta_cinzas');
  const md = iso.slice(5);
  if (md === '12-24') {
    tle *= 0.82;
    tags.push('natal');
  }
  if (md === '12-25') tags.push('natal');
  if (md === '12-31') {
    prime *= 1.12;
    tags.push('reveillon');
  }
  if (md === '01-01') {
    tle *= 0.9;
    tags.push('ano_novo');
  }
  if (iso === mothersDay(year)) tags.push('dia_das_maes');
  if (isElectionYear(year) && iso === electionDate(year)) {
    prime *= 1.15;
    tags.push('apuracao');
  }
  if (inPandemic(iso)) {
    tle *= 1.15;
    ad *= 0.75;
    tags.push('pandemia');
  }
  return { date: iso, tleMult: tle, adMult: ad, tags, primeMult: prime };
}
