// "Simular faixa": prévia de audiência com intervalo de confiança (seção 7.4).
// Roda no navegador com o mesmo motor; o resultado oficial sempre vem do servidor.

import { airingsOfDay, computeDay } from './audience.ts';
import { ERAS } from './catalog/eras.ts';
import { GENRES } from './catalog/genres.ts';
import { difficultyMult, getProgram, playerStation } from './state.ts';
import type { Block, GameState } from './types.ts';
import { SLOTS_PER_DAY } from './time.ts';

export interface PreviewResult {
  day: number;
  programs: { programId: string; title: string; start: number; len: number; est: number; lo: number; hi: number; share: number }[];
  stations: { id: string; pts24: number; prime: number }[];
  slots: Record<string, number[]>;
}

export function previewDay(state: GameState, day: number, playerSchedule?: Block[][]): PreviewResult {
  const ps = playerStation(state);
  const schedules = playerSchedule ? { ...state.schedules, [ps.id]: playerSchedule } : state.schedules;
  const res = computeDay(state, day, { carry: null, pntOnly: true, schedules, noiseKey: 'preview', noNoise: true });
  const P = ERAS[state.meta.era].params;
  const width = (0.06 + (1 - state.research.precision / 100) * 0.22) * (P.noiseSd / 1.4) * difficultyMult(state, 'noise');
  const programs = airingsOfDay(res)
    .filter((a) => a.stationId === ps.id)
    .map((a) => {
      const p = getProgram(state, a.programId);
      return {
        programId: a.programId,
        title: p?.title ?? '',
        start: a.start,
        len: a.len,
        est: Math.round(a.pts * 10) / 10,
        lo: Math.round(a.pts * (1 - width) * 10) / 10,
        hi: Math.round(a.pts * (1 + width) * 10) / 10,
        share: Math.round(a.share * 10) / 10,
      };
    })
    .filter((x) => {
      const p = getProgram(state, x.programId);
      return p && GENRES[p.genre].group !== 'sistema';
    });
  const stations = res.stationIds.map((id, c) => {
    const s24 = res.pntPts[c].reduce((s, v) => s + v, 0) / SLOTS_PER_DAY;
    let pr = 0;
    for (let t = 48; t < 72; t++) pr += res.pntPts[c][t];
    return { id, pts24: Math.round(s24 * 10) / 10, prime: Math.round((pr / 24) * 10) / 10 };
  });
  const slots = Object.fromEntries(res.stationIds.map((id, c) => [id, res.pntPts[c].map((v) => Math.round(v * 10) / 10)]));
  return { day, programs, stations, slots };
}
