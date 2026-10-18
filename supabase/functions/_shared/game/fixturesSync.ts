// Espelha os jogos da partida na tabela fixtures (seção 18.1): os da semana que passou e os das próximas duas,
// com horário (e o original, quando a liga mudou), quem transmite, placar e audiência. A fonte da verdade continua
// sendo o estado da partida; falhas aqui nunca derrubam o jogo (banco sem a migração da Fase 6.4, por exemplo).

import { fixturesBetween, seasonYear } from '../engine/sports.ts';
import { addDays } from '../engine/time.ts';
import type { GameState } from '../engine/types.ts';
import type { HandlerCtx } from './types.ts';

export async function syncFixtures(ctx: HandlerCtx, gameId: string, state: GameState): Promise<void> {
  if (!state.sports) return;
  const from = addDays(state.meta.date, -7);
  const list = fixturesBetween(state, from, addDays(state.meta.date, 14));
  if (!list.length) return;
  // audiência dos jogos já transmitidos: estatística do programa da transmissão em cada emissora
  const audience = new Map<string, Record<string, { pontos: number; share: number }>>();
  for (const p of state.programs) {
    if (p.origin !== 'sports' || typeof p.flags.fixture !== 'string' || p.flags.sportsRole || !p.stats.length) continue;
    const last = p.stats[p.stats.length - 1];
    const codes = new Set([String(p.flags.fixture), ...String(p.flags.fixtures ?? '').split('|').filter(Boolean)]);
    for (const code of codes) audience.set(code, { ...(audience.get(code) ?? {}), [p.stationId]: { pontos: last.pts, share: last.share } });
  }
  const now = ctx.now().toISOString();
  const ts = (date: string, time: string) => `${date}T${time}:00-03:00`; // horário de Brasília
  const rows = list.map((f) => ({
    game_id: gameId,
    code: f.code,
    competition_id: f.comp,
    season: seasonYear(f.season),
    phase: f.phase,
    round: f.away ? (f.leg ? `${f.round} (${f.leg === 1 ? 'ida' : 'volta'})` : String(f.round)) : f.label ?? null,
    kickoff: ts(f.date, f.time),
    original_kickoff: f.change ? ts(f.change.fromDate, f.change.fromTime) : null,
    home_club: f.home,
    away_club: f.away,
    broadcaster_station_ids: state.sports!.picks[f.code] ?? [],
    result: f.score ? { placar: f.score.slice(0, 2), penaltis: f.score.length >= 4 && f.score[2] >= 0 ? f.score.slice(2, 4) : null, prorrogacao: f.score[4] === 1 } : null,
    audience: audience.get(f.code) ?? null,
    status: f.score ? 'encerrado' : f.status,
    updated_at: now,
  }));
  try {
    await ctx.store.upsert('fixtures', rows, ['game_id', 'code']);
  } catch {
    // tabela ausente: segue sem espelho
  }
}
