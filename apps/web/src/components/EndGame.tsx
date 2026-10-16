// Fim de partida (seção 15.3): demissão, fim de mandato ou carreira encerrada.

import type { GameState } from '@engine/types.ts';
import { go } from '../lib/router.ts';
import { Button } from './ui.tsx';

export function startNewCareer(state: GameState): void {
  const ps = state.stations.find((s) => s.isPlayer);
  try {
    sessionStorage.setItem('ptm.carry', JSON.stringify({ reputation: state.player.reputation, careerStations: [...state.player.careerStations, ps?.name ?? ''].filter(Boolean), name: state.player.name, background: state.player.background, pronoun: state.player.pronoun }));
  } catch {
    // ignora
  }
  go('novo');
}

export function EndGameBanner({ gameId, state }: { gameId: string; state: GameState }) {
  const s = state.meta.status;
  const text = s === 'fired' ? 'Você foi demitido(a). A emissora agradece os serviços prestados.' : s === 'promoted' ? 'Você foi promovido(a).' : 'Carreira encerrada nesta emissora.';
  return (
    <div className={`border-b px-4 py-3 text-sm ${s === 'fired' ? 'border-bad/40 bg-bad/10' : 'border-accent/40 bg-accent/10'}`}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{text} A partida está encerrada; o histórico continua disponível.</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => go(`g/${gameId}/carreira`)}>Ver retrospectiva</Button>
          <Button size="sm" variant="primary" onClick={() => startNewCareer(state)}>Recomeçar em outra emissora</Button>
        </div>
      </div>
    </div>
  );
}
