// Abertura dos envelopes das concorrências esportivas (tender-resolve, seção 19.7). Roda no servidor: o segredo de
// quem vende (mínimo, pesos e lances dos rivais) vem de negotiation_secrets quando houve reunião, ou é calculado aqui.
// A IA (Haiku) só escreve o anúncio do resultado, a partir do resultado já decidido pelo motor.

import { money } from '../engine/money.ts';
import { playerStation } from '../engine/state.ts';
import { resolveTenderInState, tenderHidden } from '../engine/tenders.ts';
import type { TenderHidden } from '../engine/tenders.ts';
import type { GameState, TenderPublic, TenderResult } from '../engine/types.ts';
import { basePayload, runScene } from './mestre.ts';
import type { HandlerCtx } from './types.ts';

function announcement(state: GameState, t: TenderPublic, r: TenderResult): string {
  const era = state.meta.era;
  const ps = playerStation(state);
  const head = r.winner
    ? `Resultado da concorrência de ${t.compName} ${t.cycle}: venceu a ${r.winnerName}, com um envelope de ${money(era, r.winningValue)}.`
    : `A concorrência de ${t.compName} ${t.cycle} terminou sem vencedor: nenhum envelope chegou ao mínimo da ${t.sellerName}.`;
  let mine = '';
  if (t.playerBid) {
    const pos = r.ranking.findIndex((x) => x.stationId === ps.id) + 1;
    mine = r.winner === ps.id
      ? ' É nossa! O jurídico já está preparando o contrato e as parcelas.'
      : r.playerValid === false
        ? ` Nosso envelope (${money(era, t.playerBid.valor)}) ficou abaixo do mínimo e foi desclassificado.`
        : ` Nosso envelope (${money(era, t.playerBid.valor)}) ficou em ${pos}º lugar na pontuação de preço, exposição e relacionamento.`;
  }
  return `${head}${mine}\n\nMarta`;
}

export async function resolveDueTenders(ctx: HandlerCtx, gameId: string, state: GameState, onlyId?: string): Promise<(TenderResult & { tenderId: string })[]> {
  const due = (state.tenders ?? []).filter((t) => t.status === 'a_resolver' && (!onlyId || t.id === onlyId));
  const out: (TenderResult & { tenderId: string })[] = [];
  for (const t of due) {
    // o mesmo segredo da reunião, se houve; senão o motor calcula (mesma semente, mesmo resultado)
    let hidden: TenderHidden = tenderHidden(state, t);
    let meetings: Record<string, unknown>[] = [];
    try {
      meetings = (await ctx.store.select('negotiations', { game_id: gameId, product_ref: t.id })) as Record<string, unknown>[];
      const last = meetings.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
      if (last) {
        const [sec] = await ctx.store.select('negotiation_secrets', { negotiation_id: last.id });
        if (sec?.hidden_state) hidden = { ...(sec.hidden_state as TenderHidden) };
      }
    } catch {
      meetings = [];
    }
    const r = resolveTenderInState(state, t.id, hidden);
    if (!r) continue;
    out.push({ ...r, tenderId: t.id });
    let body = announcement(state, t, r);
    if (t.playerBid && ctx.llm) {
      const ps = playerStation(state);
      const scene = await runScene(ctx, {
        state, gameId, sceneType: 'mensagem', npcIds: ['npc_comercial'], fn: 'tender-resolve',
        payload: basePayload(state, {
          concorrencia: {
            competicao: t.compName, ciclo: t.cycle, quem_vende: t.sellerName, vencedor: r.winnerName || null, valor_vencedor: r.winner ? money(state.meta.era, r.winningValue) : null,
            nosso_envelope: money(state.meta.era, t.playerBid.valor), nosso_resultado: r.winner === ps.id ? 'vencemos' : r.playerValid === false ? 'abaixo_do_minimo' : 'perdemos',
            posicao: r.ranking.findIndex((x) => x.stationId === ps.id) + 1, participantes: r.ranking.length,
          },
        }),
        history: '',
        task: 'Marta (Comercial) anuncia ao diretor o resultado da concorrência em 2 ou 3 falas curtas. Use só os dados de "concorrencia" (nomes e valores exatamente como estão). Não invente lances, valores nem motivos. choices vazio.',
        fallback: () => ({ scene_type: 'mensagem', narrative: [{ speaker: 'npc_comercial', text: body.replace(/\n\nMarta$/, '') }], headlines: [], choices: [], player_action: null, proposals: [], memory_notes: [] }),
      });
      const text = scene.output.narrative.map((n) => n.text).join('\n\n');
      if (text.trim()) body = `${text}\n\nMarta`;
    }
    state.pendingInbox.push({ fromNpc: 'npc_comercial', subject: `Resultado da concorrência: ${t.compName} ${t.cycle}`, body, requiresAction: false, eventId: null, kind: 'mensagem' });
    for (const m of meetings) {
      if (m.status !== 'aberta' && m.status !== 'pausada') continue;
      try {
        await ctx.store.update('negotiations', { id: m.id }, { status: 'fechada', updated_at: ctx.now().toISOString() });
      } catch {
        // tabela ausente
      }
    }
  }
  return out;
}
