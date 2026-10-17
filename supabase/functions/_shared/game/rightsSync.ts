// Espelha contratos de direitos e relacionamentos do estado da partida nas tabelas rights_contracts e
// holder_relationships (seção 18.1), para consulta. A fonte da verdade continua sendo o estado da partida.
// Falhas aqui nunca derrubam o jogo (banco sem a migração da Fase 6.3, por exemplo).

import type { GameState } from '../engine/types.ts';
import type { HandlerCtx } from './types.ts';

export async function syncRights(ctx: HandlerCtx, gameId: string, state: GameState): Promise<void> {
  const contracts = state.rightsContracts ?? [];
  const rel = state.holderRel ?? {};
  if (!contracts.length && !Object.keys(rel).length) return;
  const now = ctx.now().toISOString();
  try {
    await ctx.store.remove('rights_contracts', { game_id: gameId });
    if (contracts.length) {
      await ctx.store.insert('rights_contracts', contracts.map((c) => ({
        id: ctx.uuid(),
        game_id: gameId,
        station_id: c.stationId,
        rights_holder_id: c.holderId,
        product_ref: c.productRef,
        origin: c.origin,
        negotiation_id: c.negotiationId ?? null,
        terms: { ...c.terms, contrato: c.id, rotulo: c.label, programa: c.programId ?? null },
        start_date: c.startDate,
        end_date: c.endDate,
        payments: c.payments,
        obligations: c.obligations,
        status: c.status,
        updated_at: now,
      })));
    }
  } catch {
    // tabela ausente: segue sem espelho
  }
  try {
    const rows = Object.entries(rel).flatMap(([holderId, byStation]) => Object.entries(byStation).map(([stationId, r]) => ({
      game_id: gameId, rights_holder_id: holderId, station_id: stationId, score: r.score, distrust_until: r.distrustUntil ?? null, history: r.history ?? [], updated_at: now,
    })));
    if (rows.length) await ctx.store.upsert('holder_relationships', rows, ['game_id', 'rights_holder_id', 'station_id']);
  } catch {
    // tabela ausente: segue sem espelho
  }
}
